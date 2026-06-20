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
