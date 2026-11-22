// Scheduled job: read the Notion health databases and mirror them into Supabase.
// The repository is public, so this script must never print health values:
// only counts and error codes go to the log.
//
// Env: NOTION_TOKEN, SUPABASE_URL, SUPABASE_SECRET_KEY, MAX_DELETES (default 5)
// Args: --dry-run  (report counts, write nothing)

import { buildSnapshot, type Category, type NotionPage } from './notion-mapping.ts';

const DATA_SOURCES: Record<Category, string> = {
  body: '41d75102-a638-812e-a699-000b12dc35fb',
  sleep: '41d75102-a638-81c4-b520-000be39c4db8',
  exercise: '41d75102-a638-8186-820b-000b56c707b6',
  workout: '41d75102-a638-8176-8e0f-000b0574fc14',
  vo2: '41d75102-a638-81b0-9c42-000be7a40375',
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

async function queryAll(token: string, dataSourceId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) {
      const code = await res.json().then((b: { code?: string }) => b.code ?? '', () => '');
      throw new Error(`Notion query failed: HTTP ${res.status} ${code}`);
    }
    const body = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
    pages.push(...body.results.filter(p => !(p as { in_trash?: boolean }).in_trash));
    cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function mirror(url: string, key: string, snapshot: unknown, maxDeletes: number, dryRun: boolean) {
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy service_role JWT
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/health_web_mirror`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ snapshot, max_deletes: maxDeletes, dry_run: dryRun }),
  });
  const body = await res.json().catch(() => null) as { code?: string; message?: string } | null;
  if (!res.ok) {
    // Only the delete-limit message is free of record details.
    const safe = body?.message?.startsWith('Mirror would delete') ? body.message : '';
    throw new Error(`Supabase mirror failed: HTTP ${res.status} ${body?.code ?? ''} ${safe}`.trim());
  }
  return body;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const maxDeletes = Number(process.env.MAX_DELETES ?? '5');
  if (!Number.isInteger(maxDeletes) || maxDeletes < 0) throw new Error('MAX_DELETES must be a non-negative integer');
  if (!process.env.NOTION_TOKEN || !process.env.SUPABASE_SECRET_KEY) {
    // Secrets not registered yet: skip quietly instead of failing every scheduled run.
    console.log('Sync skipped: NOTION_TOKEN or SUPABASE_SECRET_KEY is not configured');
    return;
  }
  const token = env('NOTION_TOKEN');
  const input = {} as Record<Category, NotionPage[]>;
  for (const [category, id] of Object.entries(DATA_SOURCES) as [Category, string][]) {
    input[category] = await queryAll(token, id);
  }
  const { records, skipped, duplicates } = buildSnapshot(input);
  const counts = Object.fromEntries(Object.keys(DATA_SOURCES).map(c => [c, records.filter(r => r.category === c).length]));
  console.log(`Notion rows read: ${JSON.stringify(Object.fromEntries(Object.entries(input).map(([c, p]) => [c, p.length])))}`);
  console.log(`Mapped records: ${JSON.stringify(counts)} skipped=${skipped} duplicates=${duplicates}`);
  const result = await mirror(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), records, maxDeletes, dryRun);
  console.log(`Mirror result: ${JSON.stringify(result)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Sync failed');
  process.exit(1);
});
