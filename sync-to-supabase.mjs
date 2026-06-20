import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseBody, parseExercise } from './sync/parse.mjs';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  USER_ID,
  OBSIDIAN_HEALTH_DIR = '/Users/moromizatomasaru/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian倉庫/Health',
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`環境変数 ${name} が未設定です（.env を確認）`);
    process.exit(1);
  }
}
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
requireEnv('USER_ID', USER_ID);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const bodyMd = await readFile(join(OBSIDIAN_HEALTH_DIR, '体組成.md'), 'utf8');
  const exMd = await readFile(join(OBSIDIAN_HEALTH_DIR, 'トレーニング.md'), 'utf8');

  const bodyRows = parseBody(bodyMd).map(r => ({ ...r, user_id: USER_ID }));
  const exRows = parseExercise(exMd).map(r => ({ ...r, user_id: USER_ID }));

  const body = await supabase
    .from('body_records')
    .upsert(bodyRows, { onConflict: 'user_id,date' });
  if (body.error) throw new Error(`body_records: ${body.error.message}`);

  const ex = await supabase
    .from('exercise_records')
    .upsert(exRows, { onConflict: 'user_id,date,type' });
  if (ex.error) throw new Error(`exercise_records: ${ex.error.message}`);

  console.log(`同期完了: body_records ${bodyRows.length}件 / exercise_records ${exRows.length}件`);
}

main().catch(err => {
  console.error('同期に失敗しました:', err.message);
  process.exit(1);
});
