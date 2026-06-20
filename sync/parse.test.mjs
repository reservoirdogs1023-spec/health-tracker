import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBody } from './parse.mjs';

const BODY_MD = `# 体組成ログ

> 説明文。無視される。

| 日付 | 体重(kg) | 体脂肪率(%) | メモ |
|------|---------|-----------|------|
| 2026-06-19 | 72.2 | 16.4 | |
| 2026-06-20 | 72.65 | 16.6 | 朝 |
`;

test('parseBody はデータ行だけを抽出する', () => {
  const rows = parseBody(BODY_MD);
  assert.equal(rows.length, 2);
});

test('parseBody は日付・体重・体脂肪を数値で返す', () => {
  const rows = parseBody(BODY_MD);
  assert.deepEqual(rows[0], { date: '2026-06-19', weight: 72.2, body_fat: 16.4 });
  assert.deepEqual(rows[1], { date: '2026-06-20', weight: 72.65, body_fat: 16.6 });
});

test('parseBody は空セルを null にする', () => {
  const md = `| 日付 | 体重(kg) | 体脂肪率(%) | メモ |
|------|---------|-----------|------|
| 2026-06-21 |  | 16.0 | |
`;
  const rows = parseBody(md);
  assert.equal(rows[0].weight, null);
  assert.equal(rows[0].body_fat, 16.0);
});

import { parseExercise } from './parse.mjs';

const EX_MD = `# トレーニングログ

| 日付 | 種目 | 詳細 | メモ |
|------|------|------|------|
| 2026-06-13 | 腕立て | 30回 | |
| 2026-06-13 | BIKE | 30分 | |
| 2026-06-15 | スクワット | ブルガリアン 30回 | |
| 2026-06-15 | スクワット | 追い込み | |
| 2026-06-16 | RUN |  | |
`;

test('parseExercise は種目をそのまま type にする（8種目保持）', () => {
  const rows = parseExercise(EX_MD);
  const r0 = rows.find(r => r.date === '2026-06-13' && r.type === '腕立て');
  assert.deepEqual(r0, { date: '2026-06-13', type: '腕立て', detail: '30回' });
});

test('parseExercise は同日同種目を1件に集約し詳細を連結する', () => {
  const rows = parseExercise(EX_MD);
  const sq = rows.filter(r => r.date === '2026-06-15' && r.type === 'スクワット');
  assert.equal(sq.length, 1);
  assert.equal(sq[0].detail, 'ブルガリアン 30回 / 追い込み');
});

test('parseExercise は空詳細を null にする', () => {
  const rows = parseExercise(EX_MD);
  const run = rows.find(r => r.date === '2026-06-16' && r.type === 'RUN');
  assert.equal(run.detail, null);
});
