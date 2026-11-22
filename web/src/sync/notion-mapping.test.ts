// Synthetic values only: this repository is public.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, mapBody, mapExercise, mapSleep, mapVo2, mapWorkouts, toJst, type NotionPage } from './notion-mapping.ts';

let id = 0;
const page = (properties: NotionPage['properties']): NotionPage => ({ id: `p${++id}`, properties });
const title = (s: string) => ({ type: 'title', title: [{ plain_text: s }] });
const rich = (s: string) => ({ type: 'rich_text', rich_text: [{ plain_text: s }] });
const n = (v: number | null) => ({ type: 'number', number: v });
const date = (start: string) => ({ type: 'date', date: { start } });
const sel = (name: string) => ({ type: 'select', select: { name } });

test('body keeps missing values as null and skips empty rows', () => {
  assert.deepEqual(mapBody(page({ 日付: title('2026-01-02'), 測定日: date('2026-01-02'), '体重(kg)': n(60) })),
    { category: 'body', key: '2026-01-02', payload: { date: '2026-01-02', weight: 60, bodyFat: null } });
  assert.equal(mapBody(page({ 日付: title('2026-01-02') })), null);
});

test('sleep fills the missing half with 0 and derives the total when absent', () => {
  assert.deepEqual(mapSleep(page({ 日付: title('2026-01-02'), '合計(h)': n(6), '夜(h)': n(6) }))?.payload,
    { date: '2026-01-02', hours: 6, nightHours: 6, napHours: 0 });
  assert.deepEqual(mapSleep(page({ 日付: title('2026-01-02'), '合計(h)': n(5) }))?.payload,
    { date: '2026-01-02', hours: 5, nightHours: null, napHours: null });
  assert.deepEqual(mapSleep(page({ 日付: title('2026-01-02'), '夜(h)': n(4), '昼(h)': n(1.5) }))?.payload,
    { date: '2026-01-02', hours: 5.5, nightHours: 4, napHours: 1.5 });
});

test('exercise type is the first word of the title', () => {
  assert.equal(mapExercise(page({ 内容: title('スクワット 10回'), 日付: date('2026-01-02') }))?.key, '2026-01-02|スクワット');
  assert.equal(mapExercise(page({ 内容: title('RUN 1.0km'), 日付: date('2026-01-02') }))?.key, '2026-01-02|RUN');
});

test('vo2 source is journal only for workout-journal rows', () => {
  assert.equal(mapVo2(page({ 日付: title('2026-01-02'), VO2max: n(30), 出典: rich('[[ワークアウト日誌/x]]') }))?.payload.source, 'journal');
  assert.equal(mapVo2(page({ 日付: title('2026-01-02'), VO2max: n(30), 出典: rich('HealthAutoExport.zip') }))?.payload.source, 'export');
});

test('workout datetimes become Japan local time and repeated starts get a counter', () => {
  assert.deepEqual(toJst('2026-01-02T01:00:05.000Z'), { date: '2026-01-02', time: '10:00:05' });
  assert.deepEqual(toJst('2026-01-02T23:30:00+09:00'), { date: '2026-01-02', time: '23:30:00' });
  const rows = mapWorkouts([
    page({ 日時: date('2026-01-02T08:00:00.000+09:00'), 種目: sel('Walking'), '時間(分)': n(5), '距離(km)': n(0.5), kcal: n(null) }),
    page({ 日時: date('2026-01-02T08:00:00.000+09:00'), 種目: sel('Walking'), '時間(分)': n(6), '距離(km)': n(0.6), kcal: n(20) }),
    page({ 日時: date('2026-01-02T09:00:00.000+09:00'), 種目: sel('Other') }),
  ]);
  assert.deepEqual(rows.map(r => r.key), ['2026-01-02T08:00:00|Walking|1', '2026-01-02T08:00:00|Walking|2']);
  assert.deepEqual(rows[0].payload, {
    recordKey: '2026-01-02T08:00:00|Walking|1', date: '2026-01-02', time: '08:00:00', species: 'Walking',
    durationMinutes: 5, distanceKm: 0.5, caloriesKcal: null,
  });
});

test('snapshot drops duplicate keys and counts skipped rows', () => {
  const s = buildSnapshot({
    body: [page({ 日付: title('2026-01-02'), '体重(kg)': n(60) }), page({ 日付: title('2026-01-02'), '体重(kg)': n(61) })],
    sleep: [page({ 日付: title('bad') })],
    exercise: [], workout: [], vo2: [],
  });
  assert.equal(s.records.length, 1);
  assert.equal(s.duplicates, 1);
  assert.equal(s.skipped, 1);
});
