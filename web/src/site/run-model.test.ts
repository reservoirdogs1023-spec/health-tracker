import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunPage } from './run-model.ts';
import type { WorkoutRecord } from './health-types.ts';

function run(date: string, minutes: number | null, km: number | null, key = date): WorkoutRecord {
  return { recordKey: key, date, time: '08:00:00', species: 'Running', durationMinutes: minutes, distanceKm: km, caloriesKcal: null };
}

test('月曜はじまりの週でRunningだけを集計し、短距離はペースから除外する', () => {
  const records = [
    run('2026-06-07', 90, 10),
    run('2026-06-08', 12, 2),
    run('2026-06-08', 21, 3, 'second'),
    run('2026-06-09', 2, 1),
    { ...run('2026-06-10', 100, 20), species: 'Walking' as const },
    run('2026-06-15', 100, 10),
  ];
  const model = buildRunPage(records, 'week', '2026-06-14');
  assert.equal(model.start, '2026-06-08');
  assert.equal(model.end, '2026-06-14');
  assert.deepEqual(model.totals, { durationMinutes: 35, distanceKm: 6, pace: 6.6 });
  assert.equal(model.buckets.length, 7);
  assert.deepEqual(model.buckets[0], { key: '2026-06-08', label: '8', durationMinutes: 33, distanceKm: 5, pace: 6.6 });
  assert.equal(model.buckets[1].pace, null);
  assert.equal(model.bests.pace?.value, 6);
});

test('月は日別、年は月別にまとめ、平均ペースを距離で重み付けする', () => {
  const records = [run('2026-05-31', 600, 100), run('2026-06-01', 12, 2), run('2026-06-30', 42, 6), run('2026-07-01', 24, 3)];
  const month = buildRunPage(records, 'month', '2026-06-15');
  assert.equal(month.start, '2026-06-01');
  assert.equal(month.end, '2026-06-30');
  assert.equal(month.buckets.length, 30);
  assert.deepEqual(month.totals, { durationMinutes: 54, distanceKm: 8, pace: 6.75 });
  const year = buildRunPage(records, 'year', '2026-06-15');
  assert.equal(year.start, '2026-01-01');
  assert.equal(year.end, '2026-12-31');
  assert.equal(year.buckets.length, 12);
  assert.deepEqual(year.buckets[5], { key: '2026-06', label: '6月', durationMinutes: 54, distanceKm: 8, pace: 6.75 });
  assert.deepEqual(year.totals, { durationMinutes: 678, distanceKm: 111, pace: 678 / 111 });
  assert.equal(buildRunPage([], 'month', '2028-02-10').buckets.length, 29);
});

test('時間を主目標にし、2026年だけ年目標を分け、達成率は100で止める', () => {
  const records = [run('2026-06-08', 1000, 150)];
  const week = buildRunPage(records, 'week', '2026-06-08');
  assert.deepEqual(week.goals, { durationMinutes: 80, distanceKm: 9 });
  assert.deepEqual(week.progress, { time: 100, distance: 100 });
  assert.deepEqual(buildRunPage(records, 'month', '2026-06-08').goals, { durationMinutes: 300, distanceKm: 35 });
  assert.deepEqual(buildRunPage(records, 'year', '2026-06-08').goals, { durationMinutes: 900, distanceKm: 100 });
  assert.deepEqual(buildRunPage([], 'year', '2027-06-08').goals, { durationMinutes: 3600, distanceKm: 400 });
  assert.deepEqual(buildRunPage([run('2026-06-08', 20, 3)], 'week', '2026-06-08').progress, { time: 25, distance: 100 / 3 });
});

test('全期間のベスト・累計距離の初回到達日・新しい順の記録を事実から作る', () => {
  const records = [run('2026-06-04', 70, 7), run('2026-06-01', 24, 3), run('2026-06-03', 30, 5), run('2026-06-02', 18, 2), run('2026-06-05', 1, 1)];
  const model = buildRunPage(records, 'week', '2026-07-01');
  assert.deepEqual(model.bests, { pace: { value: 6, date: '2026-06-03' }, duration: { value: 70, date: '2026-06-04' }, distance: { value: 7, date: '2026-06-04' } });
  assert.deepEqual(model.milestones.filter(item => item.kind === 'cumulative-distance').map(({ date, label }) => ({ date, label })), [{ date: '2026-06-03', label: '累計10km' }, { date: '2026-06-02', label: '累計5km' }]);
  assert.deepEqual(model.records.map(record => record.date), ['2026-06-05', '2026-06-04', '2026-06-03', '2026-06-02', '2026-06-01']);
  assert.equal(records[0].date, '2026-06-04');
});

test('欠測・ゼロ・無効な記録を安全に扱い、空期間は走行ゼロと未計測を区別する', () => {
  const empty = buildRunPage([], 'week', '2026-06-08');
  assert.deepEqual(empty.totals, { durationMinutes: 0, distanceKm: 0, pace: null });
  assert.deepEqual(empty.progress, { time: 0, distance: 0 });
  assert.deepEqual(empty.bests, { pace: null, duration: null, distance: null });
  assert.deepEqual(empty.records, []);
  const model = buildRunPage([run('2026-06-08', null, null), run('2026-06-09', 0, 0)], 'week', '2026-06-08');
  assert.deepEqual(model.totals, { durationMinutes: 0, distanceKm: 0, pace: null });
  assert.equal(model.buckets[0].durationMinutes, null);
  assert.equal(model.buckets[1].durationMinutes, 0);
  assert.equal(model.bests.pace, null);
  const unknown = buildRunPage([run('2026-06-08', null, 3)], 'week', '2026-06-08');
  assert.equal(unknown.progress.time, null);
  assert.equal(unknown.totals.pace, null);
  const invalid = buildRunPage([run('2026-02-30', 10, 3), run('2026-06-08', -1, NaN)], 'year', '2026-06-08');
  assert.deepEqual(invalid.records.map(record => [record.durationMinutes, record.distanceKm]), [[null, null]]);
});

test('期間移動は月末や年跨ぎでも対象期間を維持し、日誌リンクはパスを符号化する', async () => {
  const { shiftRunDate, runNoteUrl, formatRunPace } = await import('./run-model.ts');
  assert.equal(shiftRunDate('2026-01-31', 'month', 1), '2026-02-01');
  assert.equal(shiftRunDate('2026-01-31', 'month', -1), '2025-12-01');
  assert.equal(shiftRunDate('2028-02-29', 'year', -1), '2027-01-01');
  assert.equal(shiftRunDate('2026-12-28', 'week', 1), '2027-01-04');
  const link = new URL(runNoteUrl('2026-06-08'));
  assert.equal(link.protocol, 'obsidian:');
  assert.equal(link.hostname, 'open');
  assert.equal(link.searchParams.get('vault'), 'Documents');
  assert.equal(link.searchParams.get('file'), 'Obsidian倉庫/Health/ワークアウト日誌/2026-06-08.md');
  assert.equal(formatRunPace(6.999), '7:00');
  assert.equal(formatRunPace(null), '—');
});
