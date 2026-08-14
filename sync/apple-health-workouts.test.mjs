import { Readable } from 'node:stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWorkoutMarkdown,
  parseWorkoutElement,
  parseWorkoutXmlStream,
} from './apple-health-workouts.mjs';

const workout = ({ type = 'Walking', date = '2026-06-02', statistics = '' } = {}) => `
<Workout workoutActivityType="HKWorkoutActivityType${type}" duration="41.4638" durationUnit="min" startDate="${date} 07:08:09 +0900" endDate="${date} 07:49:37 +0900">
  ${statistics}
</Workout>`;

test('WorkoutStatistics の距離とカロリーを子要素から読む', () => {
  const xml = workout({ statistics: `
    <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="x" endDate="x" sum="5.678" unit="km"/>
    <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="x" endDate="x" sum="321.45" unit="kcal"/>` });
  assert.deepEqual(parseWorkoutElement(xml), {
    date: '2026-06-02', time: '07:08:09', species: 'Walking',
    duration_minutes: 41.46, distance_km: 5.68, calories_kcal: 321.45,
  });
});

test('Cycling の距離は統計が無くても 0 で補完しない', () => {
  const row = parseWorkoutElement(workout({
    type: 'Cycling',
    statistics: '<WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="100" unit="kcal"/>',
  }));
  assert.equal(row.distance_km, null);
  assert.equal(row.calories_kcal, 100);
});

test('期間前と未対応種目は取り込まず Running は対応する', async () => {
  const xml = [
    workout({ date: '2025-12-31' }),   // WORKOUT_START_DATE（今年の元日）より前は取り込まない
    workout({ type: 'JumpRope' }),
    workout({ type: 'Running', date: '2026-06-03' }),
  ].join('');
  const chunks = [...xml].map(character => Buffer.from(character));
  const rows = await parseWorkoutXmlStream(Readable.from(chunks));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].species, 'Running');
});

test('同日の複数ワークアウトを集約せず全件保持する', async () => {
  const xml = workout() + workout();
  const rows = await parseWorkoutXmlStream(Readable.from([xml.slice(0, 71), xml.slice(71)]));
  assert.equal(rows.length, 2);
});

test('Markdown は距離 null を空欄として書く', () => {
  const markdown = formatWorkoutMarkdown([{
    date: '2026-06-02', time: '07:08:09', species: 'Cycling',
    duration_minutes: 20, distance_km: null, calories_kcal: 100,
  }]);
  assert.match(markdown, /\| 2026-06-02 \| 07:08:09 \| Cycling \| 20 \|  \| 100 \|/);
  assert.doesNotMatch(markdown, /Cycling \| 20 \| 0 \|/);
});
