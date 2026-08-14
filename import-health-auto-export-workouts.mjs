// Health Auto Export の日次ZIPからワークアウトを差分取り込みする。
// 使い方: npm run import:workouts:auto
//         npm run import:workouts:auto -- /path/to/HealthAutoExport_*.zip
//         HEALTH_AUTO_EXPORT_ZIP=/path/to/export.zip npm run import:workouts:auto
//         npm run import:workouts:auto -- --dry-run

import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { formatWorkoutMarkdown } from './sync/apple-health-workouts.mjs';
import {
  convertHealthAutoExportWorkouts,
  mergeWorkoutRows,
} from './sync/health-auto-export-workouts.mjs';
import { parseWorkout } from './sync/parse.mjs';

const HEALTH_DIR = process.env.OBSIDIAN_HEALTH_DIR
  ?? join(homedir(), 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents', 'Obsidian倉庫', 'Health');
const OUTPUT_PATH = join(HEALTH_DIR, 'ワークアウト.md');
const ZIP_NAME_PATTERN = /^HealthAutoExport_.*\.zip$/;
const JSON_ENTRY_PATTERN = /(?:^|\/)HealthAutoExport-[^/]+\.json$/;

function parseArguments(args) {
  let zipPath = null;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') {
      dryRun = true;
    } else if (argument === '--zip') {
      zipPath = args[index + 1];
      if (!zipPath) throw new Error('--zip の後にZIPパスを指定してください。');
      index += 1;
    } else if (argument.startsWith('-')) {
      throw new Error(`未対応の引数です: ${argument}`);
    } else if (zipPath == null) {
      zipPath = argument;
    } else {
      throw new Error(`ZIPパスが複数指定されています: ${argument}`);
    }
  }

  return { zipPath, dryRun };
}

async function newestHealthAutoExportZip(downloadsDir) {
  const entries = await readdir(downloadsDir, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter(entry => entry.isFile() && ZIP_NAME_PATTERN.test(entry.name))
    .map(async entry => {
      const path = join(downloadsDir, entry.name);
      return { path, modified: (await stat(path)).mtimeMs };
    }));

  candidates.sort((a, b) => b.modified - a.modified || b.path.localeCompare(a.path));
  if (!candidates.length) {
    throw new Error(`${downloadsDir} に HealthAutoExport_*.zip が見つかりません。`);
  }
  return candidates[0].path;
}

async function unzipStdout(zipPath, args) {
  const unzip = spawn(
    'unzip',
    [args[0], zipPath, ...args.slice(1)],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  unzip.stdout.setEncoding('utf8');
  unzip.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  unzip.stdout.on('data', chunk => { stdout += chunk; });
  unzip.stderr.on('data', chunk => { stderr += chunk; });

  const exitCode = await new Promise((resolve, reject) => {
    unzip.once('error', reject);
    unzip.once('close', resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`unzip が終了コード ${exitCode} で失敗しました: ${stderr.trim()}`);
  }
  return stdout;
}

async function readHealthAutoExportJson(zipPath) {
  const entries = (await unzipStdout(zipPath, ['-Z1']))
    .split('\n')
    .map(entry => entry.trim())
    .filter(Boolean)
    .filter(entry => JSON_ENTRY_PATTERN.test(entry));
  if (entries.length !== 1) {
    throw new Error(`Health Auto Export JSON がZIP内に1件必要です（検出: ${entries.length}件）。`);
  }

  // JSONは約21MB。ディスクへ展開せず、unzipの標準出力だけをJSON.parseへ渡す。
  const json = await unzipStdout(zipPath, ['-p', entries[0]]);
  return JSON.parse(json);
}

function printUnknownNames(unknownNames) {
  const count = [...unknownNames.values()].reduce((sum, value) => sum + value, 0);
  if (!count) {
    console.log('未知のワークアウト名: 0件');
    return;
  }

  console.log(`未知のワークアウト名（取り込み除外）: ${count}件`);
  for (const [name, nameCount] of [...unknownNames].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`- ${name}: ${nameCount}件`);
  }
}

async function main() {
  const { zipPath: argumentZipPath, dryRun } = parseArguments(process.argv.slice(2));
  const zipPath = argumentZipPath
    ?? process.env.HEALTH_AUTO_EXPORT_ZIP
    ?? await newestHealthAutoExportZip(join(homedir(), 'Downloads'));

  const [exported, existingMarkdown] = await Promise.all([
    readHealthAutoExportJson(zipPath),
    readFile(OUTPUT_PATH, 'utf8'),
  ]);
  const existingRows = parseWorkout(existingMarkdown);
  const { rows: importedRows, unknownNames } = convertHealthAutoExportWorkouts(exported);
  const mergedRows = mergeWorkoutRows(existingRows, importedRows);
  const inserted = mergedRows.length - existingRows.length;
  const updated = importedRows.length - inserted;

  console.log(`入力ZIP: ${basename(zipPath)}`);
  console.log(`取り込み対象: ${importedRows.length}件 / 更新 ${updated}件 / 追加 ${inserted}件`);
  console.log(`マージ後: ${mergedRows.length}件（既存の非一致行は保持）`);
  printUnknownNames(unknownNames);

  if (dryRun) {
    console.log('--dry-run のためファイルは書き込んでいません。');
    return;
  }

  await writeFile(OUTPUT_PATH, formatWorkoutMarkdown(mergedRows), 'utf8');
  console.log(`書き込み完了: ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('Health Auto Export の取り込みに失敗しました:', error.message);
  process.exit(1);
});
