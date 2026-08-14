import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { addWorkoutRecordKeys, parseBody, parseSleep, parseExercise, parseWorkout } from './sync/parse.mjs';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  USER_ID,
  OBSIDIAN_HEALTH_DIR = '/Users/moromizatomasaru/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian倉庫/Health',
} = process.env;
const dryRun = process.argv.includes('--dry-run');

function requireEnv(name, value) {
  if (!value) {
    console.error(`環境変数 ${name} が未設定です（.env を確認）`);
    process.exit(1);
  }
}
if (!dryRun) {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
  requireEnv('USER_ID', USER_ID);
}

async function main() {
  const bodyMd = await readFile(join(OBSIDIAN_HEALTH_DIR, '体組成.md'), 'utf8');
  const sleepMd = await readFile(join(OBSIDIAN_HEALTH_DIR, '睡眠.md'), 'utf8');
  const exMd = await readFile(join(OBSIDIAN_HEALTH_DIR, 'トレーニング.md'), 'utf8');
  const workoutMd = await readFile(join(OBSIDIAN_HEALTH_DIR, 'ワークアウト.md'), 'utf8');

  const parsedBodyRows = parseBody(bodyMd);
  const parsedSleepRows = parseSleep(sleepMd);
  const parsedExerciseRows = parseExercise(exMd);
  const parsedWorkoutRows = addWorkoutRecordKeys(parseWorkout(workoutMd));

  if (dryRun) {
    console.log(`同期 dry-run: body_records ${parsedBodyRows.length}件 / sleep_records ${parsedSleepRows.length}件 / exercise_records ${parsedExerciseRows.length}件 / workout_records ${parsedWorkoutRows.length}件`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bodyRows = parsedBodyRows.map(r => ({ ...r, user_id: USER_ID }));
  const sleepRows = parsedSleepRows.map(r => ({ ...r, user_id: USER_ID }));
  const exRows = parsedExerciseRows.map(r => ({ ...r, user_id: USER_ID }));
  const workoutRows = parsedWorkoutRows.map(r => ({ ...r, user_id: USER_ID }));

  const body = await supabase
    .from('body_records')
    .upsert(bodyRows, { onConflict: 'user_id,date' });
  if (body.error) throw new Error(`body_records: ${body.error.message}`);

  // 睡眠はテーブル未作成でも他の同期を止めない（警告のみでスキップ）
  let sleepSynced = 0;
  const sleep = await supabase
    .from('sleep_records')
    .upsert(sleepRows, { onConflict: 'user_id,date' });
  if (sleep.error) {
    console.warn(`⚠ sleep_records をスキップ: ${sleep.error.message}`);
  } else {
    sleepSynced = sleepRows.length;
  }

  const ex = await supabase
    .from('exercise_records')
    .upsert(exRows, { onConflict: 'user_id,date,type' });
  if (ex.error) throw new Error(`exercise_records: ${ex.error.message}`);

  if (workoutRows.length) {
    const workouts = await supabase
      .from('workout_records')
      .upsert(workoutRows, { onConflict: 'user_id,record_key' });
    if (workouts.error) throw new Error(`workout_records: ${workouts.error.message}`);
  }

  console.log(`同期完了: body_records ${bodyRows.length}件 / sleep_records ${sleepSynced}件 / exercise_records ${exRows.length}件 / workout_records ${workoutRows.length}件`);
}

main().catch(err => {
  console.error('同期に失敗しました:', err.message);
  process.exit(1);
});
