import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DIR = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(DIR, 'exercise-heatmap.js'), 'utf8');
const load = new Function(`${src}\nreturn { aggregateExerciseEventsByDay, buildExerciseHeatmapDays };`);
const { aggregateExerciseEventsByDay, buildExerciseHeatmapDays } = load();

test('筋トレとApple Healthを日別のイベント件数・種目別内訳へまとめる', () => {
  const exercise = [
    { date: '2026-08-03', type: '腕立て' },
    { date: '2026-08-03', type: 'スクワット' },
  ];
  const workout = [
    { date: '2026-08-03', species: 'Walking' },
    { date: '2026-08-03', species: 'Walking' },
    { date: '2026-08-04', species: 'Cycling' },
  ];

  assert.deepEqual(aggregateExerciseEventsByDay(exercise, workout, 2026), [
    {
      date: '2026-08-03',
      count: 4,
      breakdown: [
        { type: 'Walking', count: 2 },
        { type: 'スクワット', count: 1 },
        { type: '腕立て', count: 1 },
      ],
    },
    {
      date: '2026-08-04',
      count: 1,
      breakdown: [{ type: 'Cycling', count: 1 }],
    },
  ]);
});

test('指定年の外側と種目のない不完全な行を集約へ混ぜない', () => {
  const exercise = [
    { date: '2025-12-31', type: '腕立て' },
    { date: '2026-01-01', type: '腕立て' },
    { date: '2026-01-02', type: null },
  ];
  const workout = [
    { date: '2026-12-31', species: 'Running' },
    { date: '2027-01-01', species: 'Walking' },
  ];

  assert.deepEqual(aggregateExerciseEventsByDay(exercise, workout, 2026), [
    { date: '2026-01-01', count: 1, breakdown: [{ type: '腕立て', count: 1 }] },
    { date: '2026-12-31', count: 1, breakdown: [{ type: 'Running', count: 1 }] },
  ]);
});

test('通常年をJan 1からDec 31まで並べ、イベントなしの日は0件にする', () => {
  const aggregated = aggregateExerciseEventsByDay(
    [{ date: '2026-01-01', type: '腕立て' }],
    [{ date: '2026-12-31', species: 'Walking' }],
    2026,
  );
  const grid = buildExerciseHeatmapDays(2026, aggregated);

  assert.equal(grid.days.length, 365);
  assert.equal(grid.weekCount, 53);
  assert.deepEqual(grid.days[0], {
    date: '2026-01-01', dayOfWeek: 4, weekIndex: 0,
    count: 1, breakdown: [{ type: '腕立て', count: 1 }],
  });
  assert.equal(grid.days[1].date, '2026-01-02');
  assert.equal(grid.days[1].count, 0);
  assert.equal(grid.days[364].date, '2026-12-31');
  assert.equal(grid.days[364].weekIndex, 52);
  assert.equal(grid.days[364].count, 1);
});

test('うるう年で部分週が両端にある場合もDec 31の列を保持する', () => {
  const grid = buildExerciseHeatmapDays(2028, []);

  assert.equal(grid.days.length, 366);
  assert.equal(grid.weekCount, 54);
  assert.equal(grid.days[0].date, '2028-01-01');
  assert.equal(grid.days[0].dayOfWeek, 6);
  assert.equal(grid.days[365].date, '2028-12-31');
  assert.equal(grid.days[365].weekIndex, 53);
});
