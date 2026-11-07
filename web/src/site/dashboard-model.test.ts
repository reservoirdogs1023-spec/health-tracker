import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateExerciseDays,
  aggregateWorkoutDays,
  buildHeatmapDays,
  summarizeWorkout,
} from './dashboard-model.ts';

test('workoutは0件を0値にせず、Cyclingの距離欠損も保つ', () => {
  assert.deepEqual(summarizeWorkout([], 'Running'), {
    count: null,
    durationMinutes: null,
    distanceKm: null,
    caloriesKcal: null,
  });
  assert.deepEqual(summarizeWorkout([{
    recordKey: 'cycling-1', date: '2026-06-10', time: '09:30:00',
    species: 'Cycling', durationMinutes: 45, distanceKm: null, caloriesKcal: 350,
  }], 'Cycling'), {
    count: 1,
    durationMinutes: 45,
    distanceKm: null,
    caloriesKcal: 350,
  });
});

test('すべての種目では各workoutの時間・距離・消費をまとめる', () => {
  assert.deepEqual(summarizeWorkout([
    { recordKey: 'walk-1', date: '2026-06-10', time: '07:00:00', species: 'Walking', durationMinutes: 20, distanceKm: 1.5, caloriesKcal: 80 },
    { recordKey: 'run-1', date: '2026-06-11', time: '07:00:00', species: 'Running', durationMinutes: 30, distanceKm: 4.2, caloriesKcal: 260 },
    { recordKey: 'cycling-1', date: '2026-06-12', time: '09:30:00', species: 'Cycling', durationMinutes: 45, distanceKm: null, caloriesKcal: 350 },
  ], 'All'), {
    count: 3,
    durationMinutes: 95,
    distanceKm: 5.7,
    caloriesKcal: 690,
  });
});

test('ヒートマップは筋トレと同日複数workoutをイベント件数で集計する', () => {
  const aggregated = aggregateExerciseDays(
    [{ date: '2026-06-03', type: '腕立て' }],
    [
      { recordKey: 'walk-1', date: '2026-06-03', time: '07:00:00', species: 'Walking', durationMinutes: 20, distanceKm: 1.5, caloriesKcal: 80 },
      { recordKey: 'walk-2', date: '2026-06-03', time: '18:00:00', species: 'Walking', durationMinutes: 25, distanceKm: 2, caloriesKcal: 100 },
    ],
    2026,
  );

  assert.deepEqual(aggregated, [{
    date: '2026-06-03',
    count: 3,
    breakdown: [
      { type: 'Walking', count: 2 },
      { type: '腕立て', count: 1 },
    ],
  }]);
  const heatmap = buildHeatmapDays(2026, aggregated);
  assert.equal(heatmap.days.length, 365);
  assert.equal(heatmap.days.find(day => day.date === '2026-06-02')?.count, 0);
  assert.equal(heatmap.days.find(day => day.date === '2026-06-03')?.count, 3);
});


test('すべてのワークアウトを1日1本にまとめ、種目別の時間と距離を保つ', () => {
  assert.deepEqual(aggregateWorkoutDays([
    { recordKey: 'r1', date: '2026-06-10', time: '06:00:00', species: 'Running', durationMinutes: 30, distanceKm: 4, caloriesKcal: 200 },
    { recordKey: 'w1', date: '2026-06-10', time: '07:00:00', species: 'Walking', durationMinutes: 20, distanceKm: 1.5, caloriesKcal: 80 },
    { recordKey: 'w2', date: '2026-06-10', time: '18:00:00', species: 'Walking', durationMinutes: 10, distanceKm: 0.5, caloriesKcal: 40 },
    { recordKey: 'w3', date: '2026-06-09', time: '07:00:00', species: 'Walking', durationMinutes: 15, distanceKm: 1, caloriesKcal: 60 },
  ]), [
    { date: '2026-06-09', durationMinutes: 15, distanceKm: 1, breakdown: [
      { species: 'Walking', durationMinutes: 15, distanceKm: 1 },
    ] },
    { date: '2026-06-10', durationMinutes: 60, distanceKm: 6, breakdown: [
      { species: 'Walking', durationMinutes: 30, distanceKm: 2 },
      { species: 'Running', durationMinutes: 30, distanceKm: 4 },
    ] },
  ]);
});

test('日別グラフは自転車を一番上に置き、距離未記録をゼロにしない', () => {
  assert.deepEqual(aggregateWorkoutDays([
    { recordKey: 'c1', date: '2026-06-10', time: '09:00:00', species: 'Cycling', durationMinutes: 45, distanceKm: null, caloriesKcal: 300 },
    { recordKey: 'w1', date: '2026-06-10', time: '06:00:00', species: 'Walking', durationMinutes: 20, distanceKm: 1.5, caloriesKcal: 80 },
    { recordKey: 'c2', date: '2026-06-11', time: '09:00:00', species: 'Cycling', durationMinutes: 0, distanceKm: null, caloriesKcal: 0 },
  ]), [
    { date: '2026-06-10', durationMinutes: 65, distanceKm: 1.5, breakdown: [
      { species: 'Walking', durationMinutes: 20, distanceKm: 1.5 },
      { species: 'Cycling', durationMinutes: 45, distanceKm: null },
    ] },
    { date: '2026-06-11', durationMinutes: 0, distanceKm: null, breakdown: [
      { species: 'Cycling', durationMinutes: 0, distanceKm: null },
    ] },
  ]);
  assert.deepEqual(aggregateWorkoutDays([]), []);
});
