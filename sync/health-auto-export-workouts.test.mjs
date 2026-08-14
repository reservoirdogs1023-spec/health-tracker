import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatWorkoutMarkdown } from './apple-health-workouts.mjs';
import {
  convertHealthAutoExportWorkouts,
  HEALTH_AUTO_EXPORT_ACTIVITY_NAMES,
  mergeWorkoutRows,
} from './health-auto-export-workouts.mjs';
import { addWorkoutRecordKeys, parseWorkout } from './parse.mjs';

test('Health Auto Export の歩行を既存ワークアウト行へ変換する', () => {
  const exported = {
    data: {
      metrics: [],
      workouts: [{
        name: '屋外 歩く',
        start: '2026-08-04 20:58:30 +0900',
        end: '2026-08-04 21:30:14 +0900',
        duration: 1903.3743,
        distance: { qty: 2.82236, units: 'km' },
        activeEnergyBurned: { qty: 784.459, units: 'kJ' },
      }],
    },
  };

  assert.deepEqual(convertHealthAutoExportWorkouts(exported), {
    rows: [{
      date: '2026-08-04',
      time: '20:58:30',
      species: 'Walking',
      duration_minutes: 31.72,
      distance_km: 2.82,
      calories_kcal: 187.49,
    }],
    unknownNames: new Map(),
  });
});

test('屋内サイクリングの欠けた距離を 0 で補完しない', () => {
  const exported = {
    data: {
      metrics: [],
      workouts: [{
        name: '屋内 サイクリング',
        start: '2026-08-05 06:07:08 +0900',
        duration: 1200,
        activeEnergyBurned: { qty: 418.4, units: 'kJ' },
      }],
    },
  };

  const { rows } = convertHealthAutoExportWorkouts(exported);
  assert.deepEqual(rows[0], {
    date: '2026-08-05',
    time: '06:07:08',
    species: 'Cycling',
    duration_minutes: 20,
    distance_km: null,
    calories_kcal: 100,
  });
});

test('未知のワークアウト名は除外して名前別件数を返す', () => {
  const exported = {
    data: {
      metrics: [],
      workouts: [
        { name: '屋外 ランニング', start: '2026-08-06 07:00:00 +0900' },
        { name: '屋外 ランニング', start: '2026-08-07 07:00:00 +0900' },
        { name: 'ヨガ', start: '2026-08-07 08:00:00 +0900' },
      ],
    },
  };

  assert.deepEqual(convertHealthAutoExportWorkouts(exported), {
    rows: [],
    unknownNames: new Map([
      ['屋外 ランニング', 2],
      ['ヨガ', 1],
    ]),
  });
});

test('実データで名前が判明した種目はマッピング表の拡張だけで追加できる', () => {
  const activityNames = new Map([
    ...HEALTH_AUTO_EXPORT_ACTIVITY_NAMES,
    ['確認済みのランニング名', 'Running'],
  ]);
  const exported = {
    data: {
      metrics: [],
      workouts: [{
        name: '確認済みのランニング名',
        start: '2026-08-07 07:00:00 +0900',
        duration: 600,
      }],
    },
  };

  const { rows, unknownNames } = convertHealthAutoExportWorkouts(exported, { activityNames });
  assert.deepEqual(
    { species: rows[0].species, unknownNames },
    { species: 'Running', unknownNames: new Map() },
  );
});

test('差分マージは一致行を更新し、新規行を挿入して、範囲外の既存行を残す', () => {
  const existingRows = [
    {
      date: '2026-08-05', time: '07:00:00', species: 'Walking',
      duration_minutes: 30, distance_km: 2, calories_kcal: 150,
    },
    {
      date: '2026-01-01', time: '09:00:00', species: 'Cycling',
      duration_minutes: 20, distance_km: null, calories_kcal: 100,
    },
  ];
  const importedRows = [
    {
      date: '2026-08-05', time: '07:00:00', species: 'Walking',
      duration_minutes: 31, distance_km: 2.5, calories_kcal: 160,
    },
    {
      date: '2026-08-07', time: '08:00:00', species: 'Cycling',
      duration_minutes: 45, distance_km: null, calories_kcal: 300,
    },
  ];

  assert.deepEqual(mergeWorkoutRows(existingRows, importedRows), [
    importedRows[1],
    importedRows[0],
    existingRows[1],
  ]);
});

test('マージ結果は既存の同期パーサと安定キー生成をそのまま通る', () => {
  const mergedRows = mergeWorkoutRows([], [{
    date: '2026-08-07', time: '08:00:00', species: 'Cycling',
    duration_minutes: 45, distance_km: null, calories_kcal: 300,
  }]);

  const syncedRows = addWorkoutRecordKeys(parseWorkout(formatWorkoutMarkdown(mergedRows)));
  assert.deepEqual(syncedRows, [{
    date: '2026-08-07', time: '08:00:00', species: 'Cycling',
    duration_minutes: 45, distance_km: null, calories_kcal: 300,
    record_key: '2026-08-07T08:00:00|Cycling|1',
  }]);
});
