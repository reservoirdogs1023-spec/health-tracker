import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
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

async function asUser(db, id, sql, args = []) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${id ?? ''}', false); SET ROLE ${id ? 'authenticated' : 'anon'}`);
  return db.query(sql, args);
}

test('only the configured owner can read the archive; identity cannot be reassigned', async () => {
  const db = await setup();
  try {
    await assert.rejects(asUser(db, null, 'SELECT public.health_web_archive()'), /permission denied/);
    await assert.rejects(asUser(db, OTHER, 'SELECT public.health_web_archive()'), /Owner access required/);
    const { rows } = await asUser(db, OWNER, 'SELECT public.health_web_archive() AS archive');
    assert.deepEqual(rows[0].archive, { body: [], sleep: [], exercise: [], workout: [], pending: [], vo2: [] });
    await assert.rejects(asUser(db, OTHER, 'UPDATE public.health_web_owner SET user_id=$1', [OTHER]), /permission denied/);
  } finally { await db.close(); }
});

const body = { category: 'body', key: '2026-11-01', payload: { date: '2026-11-01', weight: 70, bodyFat: null } };
test('reimporting is idempotent and a conflicting batch preserves all previous values', async () => {
  const db = await setup();
  try {
    const send = batch => asUser(db, OWNER, 'SELECT public.health_web_import($1::jsonb) AS result', [JSON.stringify(batch)]);
    assert.deepEqual((await send([body])).rows[0].result, { inserted: 1, unchanged: 0 });
    assert.deepEqual((await send([body])).rows[0].result, { inserted: 0, unchanged: 1 });
    await assert.rejects(send([
      { ...body, key: '2026-11-02', payload: { ...body.payload, date: '2026-11-02' } },
      { ...body, payload: { ...body.payload, weight: 71 } },
    ]), /Record conflict/);
    const archive = (await asUser(db, OWNER, 'SELECT public.health_web_archive() AS archive')).rows[0].archive;
    assert.deepEqual(archive.body, [body.payload]);
    await assert.rejects(asUser(db, OTHER, 'SELECT public.health_web_import($1::jsonb)', [JSON.stringify([body])]), /Owner access required/);
    await assert.rejects(asUser(db, OTHER, 'INSERT INTO public.health_web_records VALUES ($1,$2,$3,$4)', [OWNER, 'body', body.key, JSON.stringify(body.payload)]), /row-level security/);
  } finally { await db.close(); }
});

test('invalid dates, unexpected personal fields, negative metrics and mismatched keys are rejected', async () => {
  const db = await setup();
  try {
    for (const row of [
      { ...body, payload: { ...body.payload, location: 'must-not-be-stored' } },
      { ...body, key: '2026-02-30', payload: { ...body.payload, date: '2026-02-30' } },
      { ...body, payload: { ...body.payload, weight: -1 } },
      { ...body, key: 'different-key' },
    ]) {
      await assert.rejects(asUser(db, OWNER, 'SELECT public.health_web_import($1::jsonb)', [JSON.stringify([row])]), /check constraint/);
    }
    assert.deepEqual((await asUser(db, OWNER, 'SELECT public.health_web_archive() AS archive')).rows[0].archive.body, []);
  } finally { await db.close(); }
});

test('manual entry preserves unspecified values and remains in the pending archive', async () => {
  const db = await setup();
  try {
    const save = value => asUser(db, OWNER, 'SELECT public.health_web_save_entry($1::jsonb)', [JSON.stringify(value)]);
    await save({ date: '2026-11-01', weight: 70, bodyFat: null, nightHours: 6, napHours: 0 });
    await save({ date: '2026-11-01', weight: null, bodyFat: 20, nightHours: null, napHours: null });
    const archive = (await asUser(db, OWNER, 'SELECT public.health_web_archive() AS archive')).rows[0].archive;
    assert.deepEqual(archive.pending, [{ date: '2026-11-01', weight: 70, bodyFat: 20, nightHours: 6, napHours: 0 }]);
    assert.deepEqual(archive.body, []);
    await assert.rejects(asUser(db, OTHER, 'SELECT public.health_web_save_entry($1::jsonb)', [JSON.stringify(archive.pending[0])]), /Owner access required/);
  } finally { await db.close(); }
});

test('migration retains every category, stable keys, missing values and local dates', async () => {
  const db=await setup();
  try {
    const archive={
      body:[{date:'2026-11-01',weight:70,bodyFat:null}],
      sleep:[{date:'2026-11-01',hours:7,nightHours:6,napHours:1}],
      exercise:[{date:'2026-11-01',type:'ストレッチ'}],
      workout:[{recordKey:'source-stable-key',date:'2026-11-01',time:'00:10:00',species:'Running',durationMinutes:30,distanceKm:5,caloriesKcal:null}],
      pending:[{date:'2026-11-01',weight:null,bodyFat:20,nightHours:null,napHours:null}],
      vo2:[{date:'2026-11-01',value:45.5,source:'export'}],
    };
    const rows=Object.entries(archive).flatMap(([category,list])=>list.map(payload=>({category,key:category==='workout'?payload.recordKey:category==='exercise'?`${payload.date}|${payload.type}`:payload.date,payload})));
    await asUser(db,OWNER,'SELECT public.health_web_import($1::jsonb)',[JSON.stringify(rows)]);
    assert.deepEqual((await asUser(db,OWNER,'SELECT public.health_web_archive() AS archive')).rows[0].archive,archive);
  } finally { await db.close(); }
});
