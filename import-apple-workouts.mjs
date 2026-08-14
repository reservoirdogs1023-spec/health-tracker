// Apple Health の巨大な export.xml を展開せず、ZIP の標準出力から Workout だけを読む。
// 使い方: npm run import:workouts
//         npm run import:workouts -- --dry-run

import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
  WORKOUT_START_DATE,
  formatWorkoutMarkdown,
  readWorkoutsFromZip,
} from './sync/apple-health-workouts.mjs';

const ZIP_PATH = process.env.APPLE_HEALTH_EXPORT_ZIP
  ?? join(homedir(), 'Downloads', '書き出したデータ.zip');
const HEALTH_DIR = process.env.OBSIDIAN_HEALTH_DIR
  ?? join(homedir(), 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents', 'Obsidian倉庫', 'Health');
const OUTPUT_PATH = join(HEALTH_DIR, 'ワークアウト.md');
const dryRun = process.argv.includes('--dry-run');

function sumPresent(rows, key) {
  const values = rows.map(row => row[key]).filter(value => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

async function main() {
  const rows = await readWorkoutsFromZip(ZIP_PATH, { fromDate: WORKOUT_START_DATE });
  const days = new Set(rows.map(row => row.date)).size;

  console.log(`${WORKOUT_START_DATE} 以降: ${rows.length}件 / ${days}日`);
  for (const species of ['Walking', 'Running', 'Cycling']) {
    const selected = rows.filter(row => row.species === species);
    const distance = sumPresent(selected, 'distance_km');
    const distanceText = distance == null ? '距離なし' : `${distance.toFixed(2)}km`;
    console.log(`${species}: ${selected.length}件 / ${distanceText}`);
  }

  if (dryRun) {
    console.log('--dry-run のためファイルは書き込んでいません。');
    return;
  }
  await writeFile(OUTPUT_PATH, formatWorkoutMarkdown(rows), 'utf8');
  console.log(`書き込み完了: ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('Apple Health の取り込みに失敗しました:', error.message);
  process.exit(1);
});
