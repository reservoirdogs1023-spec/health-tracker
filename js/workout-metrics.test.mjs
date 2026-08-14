import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DIR = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(DIR, 'workout-metrics.js'), 'utf8');
const load = new Function(`${src}\nreturn { WORKOUT_SPECIES, selectWorkoutRecords, summarizeWorkoutRecords };`);
const { WORKOUT_SPECIES, selectWorkoutRecords, summarizeWorkoutRecords } = load();

test('Running は0件でも選択肢として残し、集計値を0で作らない', () => {
  assert.ok(WORKOUT_SPECIES.includes('Running'));
  assert.deepEqual(summarizeWorkoutRecords([], 'Running'), {
    hasRecords: false,
    count: null,
    durationMinutes: null,
    distanceKm: null,
    caloriesKcal: null,
  });
});

test('Cycling は距離ベース集計から除外する', () => {
  const summary = summarizeWorkoutRecords([{
    date: '2026-08-02', time: '09:00:00', species: 'Cycling',
    durationMinutes: 45, distanceKm: null, caloriesKcal: 350,
  }], 'Cycling');
  assert.equal(summary.count, 1);
  assert.equal(summary.durationMinutes, 45);
  assert.equal(summary.distanceKm, null);
  assert.equal(summary.caloriesKcal, 350);
});

test('同日複数回はチャート用一覧でも集約しない', () => {
  const rows = [
    { date: '2026-08-03', time: '18:00:00', species: 'Walking' },
    { date: '2026-08-03', time: '07:00:00', species: 'Walking' },
  ];
  assert.deepEqual(selectWorkoutRecords(rows, 'Walking').map(row => row.time), ['07:00:00', '18:00:00']);
});
