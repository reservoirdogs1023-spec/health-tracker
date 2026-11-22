import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const OWNER = '11111111-1111-4111-8111-111111111111';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.query('INSERT INTO public.health_web_owner(user_id) VALUES ($1)', [OWNER]);
  return db;
}

async function as(db, role, sql, args = []) {
  const sub = role === 'authenticated' ? OWNER : '';
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${sub}', false); SET ROLE ${role}`);
  return db.query(sql, args);
}

const mirror = (db, snapshot, maxDeletes = 5, dryRun = false) =>
  as(db, 'service_role', 'SELECT public.health_web_mirror($1::jsonb, $2, $3) AS r',
    [JSON.stringify(snapshot), maxDeletes, dryRun]).then(x => x.rows[0].r);

const rows = async db => (await as(db, 'postgres',
  'SELECT category, record_key, payload FROM public.health_web_records ORDER BY 1,2')).rows;

const body = (date, weight) => ({ category: 'body', key: date, payload: { date, weight, bodyFat: null } });
const pending = { date: '2026-11-03', weight: 70, bodyFat: null, nightHours: null, napHours: null };

test('mirror inserts, updates and deletes so the Web matches Notion, but keeps manual pending entries', async () => {
  const db = await setup();
  try {
    await as(db, 'authenticated', 'SELECT public.health_web_save_entry($1::jsonb)', [JSON.stringify(pending)]);
    assert.deepEqual(await mirror(db, [body('2026-11-01', 70), body('2026-11-02', 71)]),
      { inserted: 2, updated: 0, unchanged: 0, deleted: 0, dryRun: false });
    assert.deepEqual(await mirror(db, [body('2026-11-01', 69.5)]),
      { inserted: 0, updated: 1, unchanged: 0, deleted: 1, dryRun: false });
    const after = await rows(db);
    assert.deepEqual(after.map(r => `${r.category}:${r.record_key}`), ['body:2026-11-01', 'pending:2026-11-03']);
    assert.equal(after[0].payload.weight, 69.5);
  } finally { await db.close(); }
});

test('dry run reports counts without writing', async () => {
  const db = await setup();
  try {
    assert.deepEqual(await mirror(db, [body('2026-11-01', 70)], 5, true),
      { inserted: 1, updated: 0, unchanged: 0, deleted: 0, dryRun: true });
    assert.deepEqual(await rows(db), []);
  } finally { await db.close(); }
});

test('too many deletions abort the whole mirror', async () => {
  const db = await setup();
  try {
    await mirror(db, [body('2026-11-01', 70), body('2026-11-02', 71), body('2026-11-03', 72)]);
    await assert.rejects(mirror(db, [body('2026-11-04', 70)], 2), /would delete 3 records/);
    assert.equal((await rows(db)).length, 3);
  } finally { await db.close(); }
});

test('one invalid or duplicate record rejects the whole snapshot', async () => {
  const db = await setup();
  try {
    await assert.rejects(mirror(db, [body('2026-11-01', 70), body('2026-11-02', -1)]), /Invalid mirror record/);
    await assert.rejects(mirror(db, [body('2026-11-01', 70), body('2026-11-01', 71)]), /Duplicate keys/);
    await assert.rejects(mirror(db, [{ category: 'pending', key: pending.date, payload: pending }]), /Invalid mirror record/);
    assert.deepEqual(await rows(db), []);
  } finally { await db.close(); }
});

test('only the service role can run the mirror', async () => {
  const db = await setup();
  try {
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(as(db, role, 'SELECT public.health_web_mirror($1::jsonb)', [JSON.stringify([body('2026-11-01', 70)])]), /permission denied/);
    }
  } finally { await db.close(); }
});
