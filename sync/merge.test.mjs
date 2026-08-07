import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBody, mergeSleep, mergeExercise, formatBodyRow, formatSleepRow } from './merge.mjs';

const bodyMd = [
  '# 体組成ログ',
  '',
  '| 日付 | 体重(kg) | 体脂肪率(%) | メモ |',
  '|------|---------|-----------|------|',
  '| 2026-06-23 | 71.65 | 16.5 | |',
  '| 2026-06-24 | 71.65 | 16.5 | |',
  '',
].join('\n');

test('mergeBody: 欠けている日付だけを日付順に挿入する', () => {
  const rows = [
    { date: '2026-06-23', weight: 99, body_fat: 99 }, // 既存 → 無視
    { date: '2026-06-25', weight: 72, body_fat: 16 }, // 新規
    { date: '2026-06-24', weight: 88, body_fat: 88 }, // 既存 → 無視
  ];
  const { markdown, added } = mergeBody(bodyMd, rows);
  assert.equal(added.length, 1);
  assert.equal(added[0], '| 2026-06-25 | 72 | 16 | |');
  // 既存行は書き換えない
  assert.ok(markdown.includes('| 2026-06-23 | 71.65 | 16.5 | |'));
  assert.ok(markdown.includes('| 2026-06-24 | 71.65 | 16.5 | |'));
  // 新規は末尾（24の後）に日付順で入る
  const idx24 = markdown.indexOf('2026-06-24');
  const idx25 = markdown.indexOf('2026-06-25');
  assert.ok(idx24 < idx25);
});

test('mergeBody: 中間の欠損日は正しい位置に挿入される', () => {
  const md = [
    '| 日付 | 体重(kg) | 体脂肪率(%) | メモ |',
    '|---|---|---|---|',
    '| 2026-06-20 | 71 | 16 | |',
    '| 2026-06-24 | 71.65 | 16.5 | |',
  ].join('\n');
  const { markdown } = mergeBody(md, [{ date: '2026-06-22', weight: 71.8, body_fat: 16.7 }]);
  const i20 = markdown.indexOf('2026-06-20');
  const i22 = markdown.indexOf('2026-06-22');
  const i24 = markdown.indexOf('2026-06-24');
  assert.ok(i20 < i22 && i22 < i24);
});

test('mergeBody: 欠損なしなら markdown も added も変化しない', () => {
  const rows = [{ date: '2026-06-24', weight: 71.65, body_fat: 16.5 }];
  const { markdown, added } = mergeBody(bodyMd, rows);
  assert.equal(added.length, 0);
  assert.equal(markdown, bodyMd);
});

test('formatBodyRow: body_fat が null なら空欄', () => {
  assert.equal(formatBodyRow({ date: '2026-07-01', weight: 72, body_fat: null }), '| 2026-07-01 | 72 |  | |');
});

const sleepMd = [
  '# 睡眠ログ',
  '',
  '| 日付 | 合計(h) | 夜(h) | 昼(h) | メモ |',
  '|------|--------|-------|-------|------|',
  '| 2026-07-03 | 6.5 |  |  | |',
  '| 2026-07-05 | 7.5 |  |  | |',
  '',
].join('\n');

test('mergeSleep: 欠けている日付だけを日付順に挿入する', () => {
  const rows = [
    { date: '2026-07-05', hours: 9 }, // 既存 → 無視
    { date: '2026-07-04', hours: 7, night_hours: 2, nap_hours: 5 }, // 新規
  ];
  const { markdown, added } = mergeSleep(sleepMd, rows);
  assert.equal(added.length, 1);
  assert.equal(added[0], '| 2026-07-04 | 7 | 2 | 5 | |');
  assert.ok(markdown.includes('| 2026-07-03 | 6.5 |  |  | |'));
  assert.ok(markdown.includes('| 2026-07-05 | 7.5 |  |  | |'));
  const i03 = markdown.indexOf('2026-07-03');
  const i04 = markdown.indexOf('2026-07-04');
  const i05 = markdown.indexOf('2026-07-05');
  assert.ok(i03 < i04 && i04 < i05);
});

test('formatSleepRow: 値が null なら空欄（0 で埋めない）', () => {
  assert.equal(
    formatSleepRow({ date: '2026-07-01', hours: null, night_hours: null, nap_hours: null }),
    '| 2026-07-01 |  |  |  | |');
});

test('formatSleepRow: 内訳があれば夜・昼を書き出す', () => {
  assert.equal(
    formatSleepRow({ date: '2026-07-01', hours: 7, night_hours: 2, nap_hours: 5 }),
    '| 2026-07-01 | 7 | 2 | 5 | |');
});

const exMd = [
  '| 日付 | 種目 | 詳細 | メモ |',
  '| ---- | ---- | ---- | ---- |',
  '| 2026-06-28 | 腕立て | 30回 | |',
  '| 2026-06-28 | スクワット | 70回 | |',
].join('\n');

test('mergeExercise: (日付, 種目) 単位で欠けている行だけ追加', () => {
  const rows = [
    { date: '2026-06-28', type: '腕立て', detail: '99回' },   // 既存キー → 無視
    { date: '2026-06-29', type: 'スクワット', detail: '60回' }, // 新規
    { date: '2026-06-28', type: 'RUN', detail: '5km' },        // 同日・別種目 → 新規
  ];
  const { markdown, added } = mergeExercise(exMd, rows);
  assert.equal(added.length, 2);
  assert.ok(added.includes('| 2026-06-29 | スクワット | 60回 | |'));
  assert.ok(added.includes('| 2026-06-28 | RUN | 5km | |'));
  assert.ok(markdown.includes('| 2026-06-28 | 腕立て | 30回 | |')); // 既存温存
});

// ----- 並び順（実データは health.py が日付降順に整列している） -----

const datesOf = markdown =>
  markdown.split('\n')
    .filter(l => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l))
    .map(l => l.split('|')[1].trim());

const descMd = [
  '| 日付 | 体重(kg) | 体脂肪率(%) | メモ |',
  '|---|---|---|---|',
  '| 2026-08-02 | 71.85 | 16.3 | |',
  '| 2026-07-30 | 72 | 16 | |',
  '| 2026-07-28 | 72.1 | 16.2 | |',
].join('\n');

test('mergeBody: 降順の表には降順のまま差し込む（並びを反転させない）', () => {
  const { markdown, added } = mergeBody(descMd, [{ date: '2026-08-05', weight: 71.9, body_fat: 16.6 }]);
  assert.equal(added.length, 1);
  assert.deepEqual(datesOf(markdown), ['2026-08-05', '2026-08-02', '2026-07-30', '2026-07-28']);
});

test('mergeBody: 降順の表でも中間の欠損日は正しい位置に入る', () => {
  const { markdown } = mergeBody(descMd, [{ date: '2026-07-29', weight: 72.05, body_fat: 16.1 }]);
  assert.deepEqual(datesOf(markdown), ['2026-08-02', '2026-07-30', '2026-07-29', '2026-07-28']);
});

test('mergeExercise: 降順の表で同日に別種目を足しても並びが崩れない', () => {
  const md = [
    '| 日付 | 種目 | 詳細 | メモ |',
    '|---|---|---|---|',
    '| 2026-08-05 | WALKING | 31分 | |',
    '| 2026-08-03 | WALKING | 78分 | |',
  ].join('\n');
  const { markdown } = mergeExercise(md, [{ date: '2026-08-05', type: 'RUN', detail: '5km' }]);
  assert.deepEqual(datesOf(markdown), ['2026-08-05', '2026-08-05', '2026-08-03']);
});

// ----- 衝突検出（同じ日が両側にあり、値が食い違う） -----
// 既存行は書き換えない方針は変えず、「食い違っている事実」だけを報告する。

test('mergeBody: 同じ日で値が違えば conflicts に出る（markdown は変えない）', () => {
  const rows = [{ date: '2026-06-24', weight: 72.8, body_fat: 16.5 }];
  const { markdown, added, conflicts } = mergeBody(bodyMd, rows);
  assert.equal(added.length, 0);
  assert.equal(markdown, bodyMd); // 自動では直さない
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].date, '2026-06-24');
  assert.deepEqual(conflicts[0].diffs, [
    { label: '体重', local: 71.65, remote: 72.8 },
  ]); // 体脂肪は一致しているので差分に含めない
});

test('mergeBody: 値が一致していれば衝突にしない', () => {
  const rows = [{ date: '2026-06-24', weight: 71.65, body_fat: 16.5 }];
  const { conflicts } = mergeBody(bodyMd, rows);
  assert.equal(conflicts.length, 0);
});

test('mergeBody: Web 側が空欄なら衝突にしない（未入力であって食い違いではない）', () => {
  const rows = [{ date: '2026-06-24', weight: 71.65, body_fat: null }];
  const { conflicts } = mergeBody(bodyMd, rows);
  assert.equal(conflicts.length, 0);
});

test('mergeBody: Obsidian 側が空欄で Web に値があれば衝突として報告する', () => {
  const md = [
    '| 日付 | 体重(kg) | 体脂肪率(%) | メモ |',
    '|---|---|---|---|',
    '| 2026-06-24 | 71.65 |  | |',
  ].join('\n');
  const { conflicts } = mergeBody(md, [{ date: '2026-06-24', weight: 71.65, body_fat: 16.5 }]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].diffs, [
    { label: '体脂肪', local: null, remote: 16.5 },
  ]);
});

test('mergeBody: 新規追加された行は衝突に数えない', () => {
  const { added, conflicts } = mergeBody(bodyMd, [{ date: '2026-06-25', weight: 72, body_fat: 16 }]);
  assert.equal(added.length, 1);
  assert.equal(conflicts.length, 0);
});

test('mergeSleep: 同じ日で合計が違えば conflicts に出る', () => {
  const { markdown, conflicts } = mergeSleep(sleepMd, [{ date: '2026-07-05', hours: 9 }]);
  assert.equal(markdown, sleepMd);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].date, '2026-07-05');
  assert.deepEqual(conflicts[0].diffs, [{ label: '合計', local: 7.5, remote: 9 }]);
});

test('mergeSleep: Obsidian に内訳が無く Web にあれば、夜・昼が衝突として出る', () => {
  const { conflicts } = mergeSleep(sleepMd, [
    { date: '2026-07-05', hours: 7.5, night_hours: 2, nap_hours: 5.5 },
  ]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].diffs, [
    { label: '夜', local: null, remote: 2 },
    { label: '昼', local: null, remote: 5.5 },
  ]); // 合計は一致しているので差分に含めない
});

test('mergeExercise: 同じ日・同じ種目で詳細が違えば conflicts に出る', () => {
  const rows = [{ date: '2026-06-28', type: '腕立て', detail: '99回' }];
  const { markdown, conflicts } = mergeExercise(exMd, rows);
  assert.ok(markdown.includes('| 2026-06-28 | 腕立て | 30回 | |')); // 既存温存
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].date, '2026-06-28');
  assert.equal(conflicts[0].key, '2026-06-28 腕立て');
  assert.deepEqual(conflicts[0].diffs, [{ label: '詳細', local: '30回', remote: '99回' }]);
});

test('mergeExercise: Web 側の詳細が空なら衝突にしない', () => {
  const rows = [{ date: '2026-06-28', type: '腕立て', detail: null }];
  const { conflicts } = mergeExercise(exMd, rows);
  assert.equal(conflicts.length, 0);
});
