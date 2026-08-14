import { spawn } from 'node:child_process';

// 取り込みの下限。ヒートマップを「1月〜12月」の1年枠で見せるため 2026年の元日から。
// 年が明けてもここは動かさない（ワークアウト.md は毎回全書き換えなので、
// 日付を後ろにずらすと過去年のデータが消える）。表示側で年を絞る。
export const WORKOUT_START_DATE = '2026-01-01';

const ACTIVITY_TYPES = new Map([
  ['HKWorkoutActivityTypeWalking', 'Walking'],
  ['HKWorkoutActivityTypeRunning', 'Running'],
  ['HKWorkoutActivityTypeCycling', 'Cycling'],
]);

const DISTANCE_TYPE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
const CALORIES_TYPE = 'HKQuantityTypeIdentifierActiveEnergyBurned';

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function attributes(tag) {
  const result = {};
  const pattern = /([\w:.-]+)="([^"]*)"/g;
  for (const match of tag.matchAll(pattern)) result[match[1]] = decodeXml(match[2]);
  return result;
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function durationMinutes(value, unit) {
  const number = finiteNumber(value);
  if (number == null) return null;
  if (unit === 'h' || unit === 'hr') return round(number * 60);
  if (unit === 's' || unit === 'sec') return round(number / 60);
  return round(number);
}

export function distanceKm(value, unit) {
  const number = finiteNumber(value);
  if (number == null) return null;
  if (unit === 'm') return round(number / 1000);
  if (unit === 'mi') return round(number * 1.609344);
  return round(number);
}

export function caloriesKcal(value, unit) {
  const number = finiteNumber(value);
  if (number == null) return null;
  if (unit === 'kJ') return round(number / 4.184);
  return round(number);
}

export function parseWorkoutElement(xml, { fromDate = WORKOUT_START_DATE } = {}) {
  const startEnd = xml.indexOf('>');
  if (startEnd < 0) return null;
  const workout = attributes(xml.slice(0, startEnd + 1));
  const species = ACTIVITY_TYPES.get(workout.workoutActivityType);
  if (!species) return null;

  const dateMatch = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(workout.startDate ?? '');
  if (!dateMatch || dateMatch[1] < fromDate) return null;

  let distance = null;
  let calories = null;
  for (const match of xml.matchAll(/<WorkoutStatistics\b[^>]*\/?\s*>/g)) {
    const statistic = attributes(match[0]);
    if (statistic.type === DISTANCE_TYPE) distance = distanceKm(statistic.sum, statistic.unit);
    if (statistic.type === CALORIES_TYPE) calories = caloriesKcal(statistic.sum, statistic.unit);
  }

  // Apple Health の Cycling はこのデータセットでは距離統計を持たない。
  // 将来別の統計が増えても推測値や別種の距離を混ぜない。
  if (species === 'Cycling') distance = null;

  return {
    date: dateMatch[1],
    time: dateMatch[2],
    species,
    duration_minutes: durationMinutes(workout.duration, workout.durationUnit),
    distance_km: distance,
    calories_kcal: calories,
  };
}

// export.xml は巨大なので、Workout 1要素ぶんだけをバッファに保持する。
// WorkoutStatistics / WorkoutRoute は "<Workout" の直後が空白ではないため開始要素と誤認しない。
export async function parseWorkoutXmlStream(readable, options = {}) {
  readable.setEncoding?.('utf8');
  const rows = [];
  let buffer = '';

  for await (const chunk of readable) {
    buffer += chunk;
    while (true) {
      const start = buffer.search(/<Workout(?=[\s>])/);
      if (start < 0) {
        buffer = buffer.slice(-16);
        break;
      }
      if (start > 0) buffer = buffer.slice(start);

      const startEnd = buffer.indexOf('>');
      if (startEnd < 0) break;
      const selfClosing = /\/\s*>$/.test(buffer.slice(0, startEnd + 1));
      const close = selfClosing ? startEnd + 1 : buffer.indexOf('</Workout>', startEnd + 1);
      if (close < 0) break;

      const elementEnd = selfClosing ? close : close + '</Workout>'.length;
      const row = parseWorkoutElement(buffer.slice(0, elementEnd), options);
      if (row) rows.push(row);
      buffer = buffer.slice(elementEnd);
    }
  }

  return rows;
}

export async function readWorkoutsFromZip(zipPath, options = {}) {
  const entry = options.entry ?? 'apple_health_export/export.xml';
  const unzip = spawn('unzip', ['-p', zipPath, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  unzip.stderr.setEncoding('utf8');
  unzip.stderr.on('data', chunk => { stderr += chunk; });

  try {
    const [rows, exitCode] = await Promise.all([
      parseWorkoutXmlStream(unzip.stdout, options),
      new Promise((resolve, reject) => {
        unzip.once('error', reject);
        unzip.once('close', resolve);
      }),
    ]);
    if (exitCode !== 0) throw new Error(`unzip が終了コード ${exitCode} で失敗しました: ${stderr.trim()}`);
    return rows;
  } catch (error) {
    unzip.kill();
    throw error;
  }
}

function displayNumber(value) {
  return value == null ? '' : String(value);
}

export function formatWorkoutMarkdown(rows) {
  const sorted = [...rows].sort((a, b) =>
    b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const lines = [
    '# ワークアウトログ',
    '',
    '> Apple Health から自動取得した有酸素運動。1行1ワークアウト（同日複数行あり）。',
    '> 距離が記録されていない場合は空欄のままにし、0 や推定値では補完しない。',
    '',
    '| 日付 | 時刻 | 種目 | 時間(分) | 距離(km) | kcal |',
    '|------|------|------|---------|---------|------|',
    ...sorted.map(row => `| ${row.date} | ${row.time} | ${row.species} | ${displayNumber(row.duration_minutes)} | ${displayNumber(row.distance_km)} | ${displayNumber(row.calories_kcal)} |`),
    '',
  ];
  return lines.join('\n');
}
