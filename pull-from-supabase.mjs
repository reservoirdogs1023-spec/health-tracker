// Supabase → Obsidian の逆方向取り込み。
// スマホ（Web版）から入力された分で、Obsidian の 体組成.md / 睡眠.md / トレーニング.md に
// 無い行だけを取り込む。Obsidian が正なので既存行は書き換えない。
// 使い方:  npm run pull        （書き込み）
//          npm run pull -- --dry （差分の確認のみ・書き込まない）
//
// 両側に同じ日があって値が食い違う場合は、書き換えずに一覧表示し、終了コード 2 で止まる。
// この後に sync（Obsidian→Web の全件上書き）を走らせると Web 側の入力が消えるため、
// 衝突は必ず人が解決してから先へ進むこと。

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { mergeBody, mergeSleep, mergeExercise } from './sync/merge.mjs';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  USER_ID,
  OBSIDIAN_HEALTH_DIR = '/Users/moromizatomasaru/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian倉庫/Health',
} = process.env;

for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID })) {
  if (!value) {
    console.error(`環境変数 ${name} が未設定です（.env を確認）`);
    process.exit(1);
  }
}

const dryRun = process.argv.includes('--dry');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const [body, sleep, ex] = await Promise.all([
    supabase.from('body_records').select('date,weight,body_fat').eq('user_id', USER_ID).order('date'),
    supabase.from('sleep_records').select('date,hours,night_hours,nap_hours').eq('user_id', USER_ID).order('date'),
    supabase.from('exercise_records').select('date,type,detail').eq('user_id', USER_ID).order('date'),
  ]);
  if (body.error) throw new Error(`body_records: ${body.error.message}`);
  if (ex.error) throw new Error(`exercise_records: ${ex.error.message}`);
  // 睡眠はテーブル未作成でも他の取り込みを止めない（警告のみでスキップ）
  const sleepAvailable = !sleep.error;
  if (sleep.error) console.warn(`⚠ sleep_records をスキップ: ${sleep.error.message}`);

  const bodyPath = join(OBSIDIAN_HEALTH_DIR, '体組成.md');
  const sleepPath = join(OBSIDIAN_HEALTH_DIR, '睡眠.md');
  const exPath = join(OBSIDIAN_HEALTH_DIR, 'トレーニング.md');

  const bodyRes = mergeBody(await readFile(bodyPath, 'utf8'), body.data);
  const sleepRes = sleepAvailable
    ? mergeSleep(await readFile(sleepPath, 'utf8'), sleep.data)
    : { added: [], markdown: null, conflicts: [] };
  const exRes = mergeExercise(await readFile(exPath, 'utf8'), ex.data);

  const report = (label, added) => {
    if (!added.length) { console.log(`${label}: 取り込む行なし（既に一致）`); return; }
    console.log(`${label}: ${added.length}件を取り込み`);
    for (const line of added) console.log(`  ${line}`);
  };
  report('体組成', bodyRes.added);
  if (sleepAvailable) report('睡眠', sleepRes.added);
  report('トレーニング', exRes.added);

  const conflicts = [
    ...bodyRes.conflicts.map(c => ({ ...c, table: '体組成' })),
    ...(sleepAvailable ? sleepRes.conflicts.map(c => ({ ...c, table: '睡眠' })) : []),
    ...exRes.conflicts.map(c => ({ ...c, table: 'トレーニング' })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (dryRun) {
    reportConflicts(conflicts);
    console.log('\n--dry のため書き込みはしていません。');
    return;
  }
  if (bodyRes.added.length) await writeFile(bodyPath, bodyRes.markdown);
  if (sleepRes.added.length) await writeFile(sleepPath, sleepRes.markdown);
  if (exRes.added.length) await writeFile(exPath, exRes.markdown);
  if (bodyRes.added.length || sleepRes.added.length || exRes.added.length) {
    console.log('\n取り込み完了。ダッシュボード再生成は `python3 health-tools/health.py dash` を実行してください。');
  }

  if (conflicts.length) {
    reportConflicts(conflicts);
    process.exitCode = 2; // sync へ自動で進ませない
  }
}

// 食い違いは自動で直さず、そのまま並べて人に判断してもらう。
function reportConflicts(conflicts) {
  if (!conflicts.length) {
    console.log('\n食い違い: なし');
    return;
  }
  const show = v => (v === null ? '（空欄）' : v);
  console.log(`\n⚠ 食い違い ${conflicts.length}件（自動では直していません）`);
  for (const c of conflicts) {
    for (const d of c.diffs) {
      console.log(`  ${c.table} ${c.key} ${d.label}: Obsidian=${show(d.local)} / Web=${show(d.remote)}`);
    }
  }
  console.log('\nどちらを採るか決めてから次へ進んでください。');
  console.log('Obsidian を採る → そのまま `npm run sync`（Web 側が Obsidian の値で上書きされます）');
  console.log('Web を採る     → 先に Obsidian 側の値を書き換えてから `npm run sync`');
}

main().catch(err => {
  console.error('取り込みに失敗しました:', err.message);
  process.exit(1);
});
