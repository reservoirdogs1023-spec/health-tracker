import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sevenDayChange } from './flowsheet-model.ts';

test('7日前からの差は欠測時に8日前・9日前を探し、現在値や比較値の欠測を0にしない', () => {
  const body = [
    { date: '2026-01-10', weight: 60, bodyFat: null },
    { date: '2026-01-02', weight: 62, bodyFat: 20 },
    { date: '2026-01-01', weight: 65, bodyFat: 21 },
  ];
  assert.equal(sevenDayChange(body, '2026-01-10', 'weight'), -2);
  assert.equal(sevenDayChange(body, '2026-01-10', 'bodyFat'), null);
  assert.equal(sevenDayChange(body, '2026-01-09', 'weight'), null);
});

test('種目別割合は既知の時間から算出し、距離・時間の欠測と0を区別する', async () => {
  const { workoutTotals } = await import('./flowsheet-model.ts');
  const records = [work('a', 'Running', 30, 5), work('b', 'Walking', 90, 0), work('c', 'Cycling', null, null)];
  const result = workoutTotals(records);
  assert.equal(result.durationMinutes, 120);
  assert.equal(result.distanceKm, 5);
  assert.equal(result.count, 3);
  assert.equal(result.species[0].share, 75);
  assert.equal(result.species[1].share, 25);
  assert.equal(result.species[2].durationMinutes, null);
  assert.equal(result.species[2].distanceKm, null);
  assert.equal(result.species[2].share, null);
  assert.equal(workoutTotals([records[2]]).distanceKm, null);
});

function work(recordKey: string, species: 'Walking' | 'Running' | 'Cycling', durationMinutes: number | null, distanceKm: number | null) {
  return { recordKey, date: '2026-01-10', time: '10:00', species, durationMinutes, distanceKm, caloriesKcal: null };
}

test('日別積み上げは同日複数回を保持し、時間なしと運動記録も可視にする', async () => {
  const { stackWorkoutDays } = await import('./flowsheet-model.ts');
  const [day] = stackWorkoutDays([work('b', 'Running', 30, 5), work('a', 'Walking', 15, 1), work('c', 'Cycling', null, null)], [{ date: '2026-01-10', type: '筋トレ' }]);
  assert.equal(day.date, '2026-01-10');
  assert.equal(day.durationMinutes, 45);
  assert.equal(day.blocks.length, 3);
  assert.deepEqual(day.blocks.map(b => b.offset), [0, 15, 45]);
  assert.equal(day.blocks[2].record.durationMinutes, null);
  assert.ok(day.blocks[2].size > 0);
  assert.deepEqual(day.exercise, [{ date: '2026-01-10', type: '筋トレ' }]);
});
