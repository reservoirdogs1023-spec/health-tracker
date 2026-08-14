// ブラウザ用の js/*.js（module ではない素のスクリプト）を node で読み込んでテストする。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DIR = dirname(fileURLToPath(import.meta.url));
const src = ['backend-memory.js', 'data-manager.js']
  .map(f => readFileSync(join(DIR, f), 'utf8'))
  .join('\n');
const load = new Function(`${src}\nreturn { createMemoryBackend, createDataManager };`);
const { createMemoryBackend, createDataManager } = load();

const dm = () => createDataManager(createMemoryBackend());

test('体重だけ保存できる（体脂肪は空欄のまま）', async () => {
  const d = dm();
  await d.setBody('2026-08-07', '71.5', '');
  assert.deepEqual(await d.getBody('2026-08-07'), { date: '2026-08-07', weight: 71.5, bodyFat: null });
});

test('体脂肪だけ保存できる', async () => {
  const d = dm();
  await d.setBody('2026-08-07', '', '16.2');
  assert.deepEqual(await d.getBody('2026-08-07'), { date: '2026-08-07', weight: null, bodyFat: 16.2 });
});

test('あとから片方だけ入れても、もう片方の既存値が消えない', async () => {
  const d = dm();
  await d.setBody('2026-08-07', '71.5', '16.2');
  await d.setBody('2026-08-07', '72.0', ''); // 体重だけ直す
  assert.deepEqual(await d.getBody('2026-08-07'), { date: '2026-08-07', weight: 72.0, bodyFat: 16.2 });
});

test('空欄で上書きしても 0 にならない（旧実装は Number("") で 0 になっていた）', async () => {
  const d = dm();
  await d.setBody('2026-08-07', '71.5', '16.2');
  await d.setBody('2026-08-07', '', '');
  const r = await d.getBody('2026-08-07');
  assert.equal(r.weight, 71.5);
  assert.equal(r.bodyFat, 16.2);
});

test('両方そろっていれば普通に保存できる', async () => {
  const d = dm();
  await d.setBody('2026-08-07', '71.5', '16.2');
  assert.deepEqual(await d.getBody('2026-08-07'), { date: '2026-08-07', weight: 71.5, bodyFat: 16.2 });
});

test('体組成の一覧は片方だけの記録も欠落させず返す', async () => {
  const d = dm();
  await d.setBody('2026-08-06', '71.5', '');
  await d.setBody('2026-08-07', '', '16.2');
  assert.deepEqual(await d.getBodyRecords(), [
    { date: '2026-08-06', weight: 71.5, bodyFat: null },
    { date: '2026-08-07', weight: null, bodyFat: 16.2 },
  ]);
});

test('睡眠・運動は従来どおり動く', async () => {
  const d = dm();
  await d.setSleep('2026-08-07', '6.5');
  assert.equal((await d.getSleep('2026-08-07')).hours, 6.5);
  await d.setExercise('2026-08-07', 'RUN', '5km');
  assert.deepEqual(await d.getExerciseDetails('2026-08-07'), [{ type: 'RUN', detail: '5km' }]);
});

// ----- 睡眠の夜/昼の内訳 -----

test('合計だけ入れた日は内訳が null（昼寝ゼロと決めつけない）', async () => {
  const d = dm();
  await d.setSleep('2026-08-07', '6.5');
  const r = await d.getSleep('2026-08-07');
  assert.equal(r.night_hours, null);
  assert.equal(r.nap_hours, null);
});

test('夜と昼だけ入れると合計が自動計算される', async () => {
  const d = dm();
  await d.setSleep('2026-08-07', '', '1.5', '5');
  const r = await d.getSleep('2026-08-07');
  assert.equal(r.hours, 6.5);
  assert.equal(r.night_hours, 1.5);
  assert.equal(r.nap_hours, 5);
});

test('合計と内訳が食い違うと保存できない', async () => {
  const d = dm();
  await assert.rejects(
    () => d.setSleep('2026-08-07', '7', '2', '6'),
    /合計と内訳が合いません/);
});

test('合計と内訳が一致していれば保存できる', async () => {
  const d = dm();
  await d.setSleep('2026-08-07', '8', '7', '1');
  assert.deepEqual(await d.getSleep('2026-08-07'), {
    date: '2026-08-07', hours: 8, night_hours: 7, nap_hours: 1,
  });
});

test('睡眠の一覧は内訳不明を null のまま返す', async () => {
  const d = dm();
  await d.setSleep('2026-08-06', '6.5');
  await d.setSleep('2026-08-07', '8', '7', '1');
  assert.deepEqual(await d.getSleepRecords(), [
    { date: '2026-08-06', hours: 6.5, night_hours: null, nap_hours: null },
    { date: '2026-08-07', hours: 8, night_hours: 7, nap_hours: 1 },
  ]);
});

test('運動の一覧は種目と任意詳細を返す', async () => {
  const d = dm();
  await d.setExercise('2026-08-07', 'RUN', '5km');
  await d.setExercise('2026-08-07', 'HIIT');
  assert.deepEqual(await d.getExerciseRecords(), [
    { date: '2026-08-07', type: 'RUN', detail: '5km' },
    { date: '2026-08-07', type: 'HIIT', detail: null },
  ]);
});

test('Apple Health ワークアウト一覧は距離なしを null のまま返す', async () => {
  const d = createDataManager(createMemoryBackend({
    workout_records: [{
      date: '2026-08-02', time: '09:30:00', species: 'Cycling',
      duration_minutes: 45, distance_km: null, calories_kcal: 350,
    }],
  }));
  assert.deepEqual(await d.getWorkoutRecords(), [{
    date: '2026-08-02', time: '09:30:00', species: 'Cycling',
    durationMinutes: 45, distanceKm: null, caloriesKcal: 350,
  }]);
});

test('workout_records が未作成でも一覧は空配列になり他機能を止めない', async () => {
  const inner = createMemoryBackend();
  const d = createDataManager({
    ...inner,
    list: async table => {
      if (table === 'workout_records') throw new Error("Could not find the table 'public.workout_records' in the schema cache");
      return inner.list(table);
    },
  });
  assert.deepEqual(await d.getWorkoutRecords(), []);
  await d.setBody('2026-08-07', '71.5', '');
  assert.equal((await d.getBody('2026-08-07')).weight, 71.5);
});

test('あとから合計だけ直しても内訳が消えない…が、食い違えば弾く', async () => {
  const d = dm();
  await d.setSleep('2026-08-07', '8', '7', '1');
  await assert.rejects(() => d.setSleep('2026-08-07', '9', '', ''), /合計と内訳が合いません/);
  // 既存の内訳が温存されているため、9 ≠ 7+1 で正しく弾かれる
  assert.equal((await d.getSleep('2026-08-07')).hours, 8);
});

// sleep_records が未作成の Supabase を模した backend。
// この状態でカレンダーが落ちると「接続できません」しか出ず、原因が分からなくなる。
const backendWithoutSleepTable = () => {
  const inner = createMemoryBackend();
  const missing = () => {
    throw new Error("Could not find the table 'public.sleep_records' in the schema cache");
  };
  return {
    list: async (t) => (t === 'sleep_records' ? missing() : inner.list(t)),
    upsert: async (t, row, oc) => (t === 'sleep_records' ? missing() : inner.upsert(t, row, oc)),
    remove: async (t, m) => (t === 'sleep_records' ? missing() : inner.remove(t, m)),
  };
};

test('睡眠テーブルが無くても getSleep は落ちずに null を返す', async () => {
  const d = createDataManager(backendWithoutSleepTable());
  assert.equal(await d.getSleep('2026-08-07'), null);
});

test('睡眠テーブルが無くても睡眠一覧は空配列を返す', async () => {
  const d = createDataManager(backendWithoutSleepTable());
  assert.deepEqual(await d.getSleepRecords(), []);
});

test('睡眠テーブルが無くても体組成・運動は普通に使える', async () => {
  const d = createDataManager(backendWithoutSleepTable());
  await d.setBody('2026-08-07', '71.5', '16.2');
  assert.equal((await d.getBody('2026-08-07')).weight, 71.5);
  await d.setExercise('2026-08-07', 'RUN', '5km');
  assert.deepEqual(await d.getExerciseTypes('2026-08-07'), ['RUN']);
});

test('睡眠テーブルが無いとき setSleep は原因の分かるエラーを投げる', async () => {
  const d = createDataManager(backendWithoutSleepTable());
  await assert.rejects(() => d.setSleep('2026-08-07', '6.5'), /まだ用意されていません/);
});

test('通信エラーは握りつぶさずそのまま投げる', async () => {
  const inner = createMemoryBackend();
  const d = createDataManager({
    ...inner,
    list: async (t) => { if (t === 'sleep_records') throw new Error('Failed to fetch'); return inner.list(t); },
  });
  await assert.rejects(() => d.getSleep('2026-08-07'), /Failed to fetch/);
});

test('タスクAPIは分離済みで存在しない', () => {
  const d = dm();
  for (const fn of ['getTasks', 'addTask', 'updateTask', 'deleteTask', 'getTasksByStatus', 'getTasksByDate']) {
    assert.equal(d[fn], undefined, `${fn} が残っている`);
  }
});
