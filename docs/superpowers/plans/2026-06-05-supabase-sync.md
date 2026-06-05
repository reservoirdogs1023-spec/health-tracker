# Health Tracker — Supabase 同期化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** localStorage 保存の Health Tracker を Supabase 同期型に変え、スマホ・PC 間でデータを共有できるようにする。

**Architecture:** 既存の同期 `DataManager` を、注入された `backend`（データ操作の抽象）に依存する非同期 `DataManager` に置き換える。実運用は `SupabaseBackend`（supabase-js）、テストは `MemoryBackend`（インメモリ）。運動記録は「1日・種目ごとに1行（存在＝実施）」のモデルに変更。認証はマジックリンク、ホスティングは GitHub Pages。

**Tech Stack:** バニラ HTML/JS（単一 `index.html`）、supabase-js（CDN）、Supabase（Postgres + Auth + RLS）、GitHub Pages。ブラウザ内テストハーネス（既存 `test-datamanager.html` と同方式）。

設計の出典: [docs/superpowers/specs/2026-06-05-supabase-sync-design.md](../specs/2026-06-05-supabase-sync-design.md)

---

## File Structure

- `supabase-schema.sql` — **新規**。3テーブル + RLS ポリシー + デフォルト値。Supabase の SQL エディタで実行する。
- `js/backend-memory.js` — **新規**。テスト用インメモリ backend。`list/upsert/remove` を実装。
- `js/backend-supabase.js` — **新規**。実運用 backend。supabase-js をラップ。
- `js/data-manager.js` — **新規**。backend に依存する非同期ドメイン層（body / exercise / tasks）。
- `test-supabase-datamanager.html` — **新規**。`MemoryBackend` + `DataManager` のブラウザ内テスト。
- `index.html` — **改修**。旧同期 `DataManager` を削除し外部 JS を読込。起動時認証、各 render を async 化、運動 UI を5種目トグルへ。
- `SETUP.md` — **新規**。Supabase 作成〜GitHub Pages 公開の手順。

> 注: 既存 `index.html` は全ロジックがインライン。今回テスト対象のデータ層だけ外部 `js/*.js` に切り出し、`index.html` から `<script src>` で読む。UI 描画ロジックは `index.html` 内に残す（責務分離: データ層 vs 描画層）。

backend が満たす契約（全 backend 共通）:

```js
// すべて Promise を返す。RLS により行は自動的に本人スコープ。
backend.list(table)            // → Promise<row[]>   table の全行
backend.upsert(table, row, onConflict) // → Promise<row>  onConflict は "col,col" 文字列
backend.remove(table, match)   // → Promise<void>    match の全列が一致する行を削除
```

table 名: `"body_records" | "exercise_records" | "tasks"`

---

## Task 1: Supabase スキーマ SQL

**Files:**
- Create: `supabase-schema.sql`

- [ ] **Step 1: SQL ファイルを作成**

```sql
-- Health Tracker schema. Run in Supabase SQL Editor.

create table if not exists body_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  weight numeric,
  body_fat numeric,
  unique (user_id, date)
);

create table if not exists exercise_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  type text not null,
  unique (user_id, date, type)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  status text not null,
  date date
);

alter table body_records enable row level security;
alter table exercise_records enable row level security;
alter table tasks enable row level security;

-- One policy per table: owner can do everything on their own rows.
create policy "own rows" on body_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on exercise_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Supabase で実行して検証（手動）**

Supabase ダッシュボード → SQL Editor に貼り付けて Run。
Expected: エラーなく完了。Table Editor に `body_records` / `exercise_records` / `tasks` が表示され、各テーブルの RLS が「Enabled」。

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: add Supabase schema with RLS"
```

---

## Task 2: MemoryBackend（テスト用インメモリ backend）

**Files:**
- Create: `js/backend-memory.js`
- Test: `test-supabase-datamanager.html`

- [ ] **Step 1: テストハーネスの土台と失敗するテストを書く**

`test-supabase-datamanager.html` を新規作成。既存 `test-datamanager.html` の `test()` ランナー方式を踏襲（ただし async 対応）。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Supabase DataManager Test</title>
  <style>
    body { font-family: monospace; padding: 2rem; background: #f5f5f5; }
    .test { margin: .5rem 0; padding: .75rem; background: #fff; border-radius: 4px; }
    .pass { border-left: 4px solid #4caf50; }
    .fail { border-left: 4px solid #f44336; }
    pre { background: #333; color: #4caf50; padding: 1rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Supabase DataManager Test Suite</h1>
  <div id="results"></div>

  <script src="js/backend-memory.js"></script>
  <script src="js/data-manager.js"></script>
  <script>
    const results = document.getElementById('results');
    const tests = [];
    const test = async (name, fn) => {
      try { await fn(); tests.push({ name, pass: true, error: null }); }
      catch (e) { tests.push({ name, pass: false, error: e.message }); }
    };

    async function run() {
      // ----- MemoryBackend contract -----
      await test('MemoryBackend.upsert then list returns the row', async () => {
        const b = createMemoryBackend();
        await b.upsert('body_records', { date: '2026-06-01', weight: 68 }, 'user_id,date');
        const rows = await b.list('body_records');
        if (rows.length !== 1) throw new Error('expected 1 row');
        if (rows[0].weight !== 68) throw new Error('wrong weight');
      });

      await test('MemoryBackend.upsert on same conflict keys overwrites', async () => {
        const b = createMemoryBackend();
        await b.upsert('body_records', { date: '2026-06-01', weight: 68 }, 'user_id,date');
        await b.upsert('body_records', { date: '2026-06-01', weight: 70 }, 'user_id,date');
        const rows = await b.list('body_records');
        if (rows.length !== 1) throw new Error('expected 1 row after overwrite');
        if (rows[0].weight !== 70) throw new Error('weight not overwritten');
      });

      await test('MemoryBackend.remove deletes matching rows', async () => {
        const b = createMemoryBackend();
        await b.upsert('exercise_records', { date: '2026-06-01', type: '筋トレ' }, 'user_id,date,type');
        await b.remove('exercise_records', { date: '2026-06-01', type: '筋トレ' });
        const rows = await b.list('exercise_records');
        if (rows.length !== 0) throw new Error('row not removed');
      });

      render();
    }

    function render() {
      results.innerHTML = tests.map(t => `
        <div class="test ${t.pass ? 'pass' : 'fail'}">
          <strong>${t.pass ? '✓' : '✗'} ${t.name}</strong>
          ${t.error ? `<pre>${t.error}</pre>` : ''}
        </div>`).join('');
      const passed = tests.filter(t => t.pass).length;
      results.innerHTML += `<div class="test ${passed === tests.length ? 'pass' : 'fail'}">
        <strong>Results: ${passed}/${tests.length} passed</strong></div>`;
    }
    run();
  </script>
</body>
</html>
```

- [ ] **Step 2: テストを開いて失敗を確認**

Run: ブラウザで `test-supabase-datamanager.html` を開く（`open test-supabase-datamanager.html`）。
Expected: `createMemoryBackend is not defined` 等で全テスト FAIL。

- [ ] **Step 3: MemoryBackend を実装**

`js/backend-memory.js` を新規作成。

```js
// In-memory backend test double. Mirrors the SupabaseBackend contract.
function createMemoryBackend(seed = {}) {
  const store = {
    body_records: seed.body_records ? [...seed.body_records] : [],
    exercise_records: seed.exercise_records ? [...seed.exercise_records] : [],
    tasks: seed.tasks ? [...seed.tasks] : [],
  };

  const list = async (table) => store[table].map(r => ({ ...r }));

  const upsert = async (table, row, onConflict) => {
    const keys = onConflict.split(',').map(k => k.trim()).filter(k => k !== 'user_id');
    const idx = store[table].findIndex(r => keys.every(k => r[k] === row[k]));
    if (idx >= 0) store[table][idx] = { ...store[table][idx], ...row };
    else store[table].push({ ...row });
    return { ...row };
  };

  const remove = async (table, match) => {
    const keys = Object.keys(match);
    store[table] = store[table].filter(r => !keys.every(k => r[k] === match[k]));
  };

  return { list, upsert, remove, _store: store };
}

if (typeof window !== 'undefined') window.createMemoryBackend = createMemoryBackend;
```

> 注: `onConflict` に含まれる `user_id` はテストでは無視（MemoryBackend は単一ユーザー前提）。実 backend では Supabase が `user_id` を含めて衝突解決する。

- [ ] **Step 4: テストを再実行して合格を確認**

Run: ブラウザで `test-supabase-datamanager.html` を再読込。
Expected: MemoryBackend の3テストが PASS（`3/3 passed`、DataManager テストは Task 3 以降で追加）。

- [ ] **Step 5: Commit**

```bash
git add js/backend-memory.js test-supabase-datamanager.html
git commit -m "test: add MemoryBackend test double and harness"
```

---

## Task 3: DataManager — body records

**Files:**
- Create: `js/data-manager.js`
- Test: `test-supabase-datamanager.html`（テスト追加）

- [ ] **Step 1: 失敗するテストを追加**

`test-supabase-datamanager.html` の `run()` 内、MemoryBackend テストの後に追加:

```js
      // ----- DataManager: body -----
      await test('setBody then getBody returns weight/bodyFat', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.setBody('2026-06-01', 68.5, 18.2);
        const b = await dm.getBody('2026-06-01');
        if (b.weight !== 68.5) throw new Error('wrong weight');
        if (b.bodyFat !== 18.2) throw new Error('wrong bodyFat');
      });

      await test('setBody twice on same date overwrites', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.setBody('2026-06-01', 68, 18);
        await dm.setBody('2026-06-01', 70, 20);
        const b = await dm.getBody('2026-06-01');
        if (b.weight !== 70) throw new Error('not overwritten');
      });

      await test('getBody for unknown date returns null', async () => {
        const dm = createDataManager(createMemoryBackend());
        const b = await dm.getBody('2099-01-01');
        if (b !== null) throw new Error('expected null');
      });
```

- [ ] **Step 2: テストを開いて失敗を確認**

Run: ブラウザで `test-supabase-datamanager.html` を再読込。
Expected: `createDataManager is not defined` で body テストが FAIL。

- [ ] **Step 3: DataManager に body を実装**

`js/data-manager.js` を新規作成（このタスクでは body のみ。exercise/tasks は Task 4/5 で追記）。

```js
// Async domain layer. Depends on an injected backend (Memory or Supabase).
function createDataManager(backend) {
  // ----- Body records -----
  const getBody = async (date) => {
    const rows = await backend.list('body_records');
    const r = rows.find(x => x.date === date);
    if (!r) return null;
    return { date: r.date, weight: r.weight, bodyFat: r.body_fat };
  };

  const setBody = async (date, weight, bodyFat) => {
    const row = { date, weight: Number(weight), body_fat: Number(bodyFat) };
    await backend.upsert('body_records', row, 'user_id,date');
    return { date, weight: row.weight, bodyFat: row.body_fat };
  };

  return { getBody, setBody };
}

if (typeof window !== 'undefined') window.createDataManager = createDataManager;
```

> 注: DB 列は `body_fat`（snake_case）、アプリ側は `bodyFat`。DataManager が変換を担う。

- [ ] **Step 4: テストを再実行して合格を確認**

Run: ブラウザで `test-supabase-datamanager.html` を再読込。
Expected: MemoryBackend 3 + body 3 = `6/6 passed`。

- [ ] **Step 5: Commit**

```bash
git add js/data-manager.js test-supabase-datamanager.html
git commit -m "feat: add async DataManager body records (TDD)"
```

---

## Task 4: DataManager — exercise（存在ベース・5種目）

**Files:**
- Modify: `js/data-manager.js`
- Test: `test-supabase-datamanager.html`（テスト追加）

- [ ] **Step 1: 失敗するテストを追加**

`run()` 内、body テストの後に追加:

```js
      // ----- DataManager: exercise (presence model) -----
      await test('toggleExercise(on) adds a type for that date', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.toggleExercise('2026-06-01', '筋トレ', true);
        const types = await dm.getExerciseTypes('2026-06-01');
        if (!types.includes('筋トレ')) throw new Error('type not added');
      });

      await test('multiple types can exist on the same date', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.toggleExercise('2026-06-01', '筋トレ', true);
        await dm.toggleExercise('2026-06-01', 'RUN', true);
        const types = await dm.getExerciseTypes('2026-06-01');
        if (types.length !== 2) throw new Error('expected 2 types');
      });

      await test('toggleExercise(off) removes that type only', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.toggleExercise('2026-06-01', '筋トレ', true);
        await dm.toggleExercise('2026-06-01', 'RUN', true);
        await dm.toggleExercise('2026-06-01', '筋トレ', false);
        const types = await dm.getExerciseTypes('2026-06-01');
        if (types.includes('筋トレ')) throw new Error('筋トレ not removed');
        if (!types.includes('RUN')) throw new Error('RUN wrongly removed');
      });

      await test('toggleExercise(on) twice does not duplicate', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.toggleExercise('2026-06-01', '筋トレ', true);
        await dm.toggleExercise('2026-06-01', '筋トレ', true);
        const types = await dm.getExerciseTypes('2026-06-01');
        if (types.length !== 1) throw new Error('duplicated');
      });

      await test('hasExercise reflects type presence', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.toggleExercise('2026-06-01', 'BIKE', true);
        if (await dm.hasExercise('2026-06-01', 'BIKE') !== true) throw new Error('should be true');
        if (await dm.hasExercise('2026-06-01', 'HIIT') !== false) throw new Error('should be false');
      });
```

- [ ] **Step 2: テストを開いて失敗を確認**

Run: ブラウザで再読込。
Expected: `dm.toggleExercise is not a function` で exercise テストが FAIL。

- [ ] **Step 3: exercise を実装**

`js/data-manager.js` の `createDataManager` 内、`setBody` の後・`return` の前に追加し、`return` に公開:

```js
  // ----- Exercise records (presence model: one row per date+type) -----
  const EXERCISE_TYPES = ['筋トレ', 'RUN', 'WALKING', 'BIKE', 'HIIT'];

  const getExerciseTypes = async (date) => {
    const rows = await backend.list('exercise_records');
    return rows.filter(r => r.date === date).map(r => r.type);
  };

  const hasExercise = async (date, type) => {
    const types = await getExerciseTypes(date);
    return types.includes(type);
  };

  const toggleExercise = async (date, type, on) => {
    if (on) await backend.upsert('exercise_records', { date, type }, 'user_id,date,type');
    else await backend.remove('exercise_records', { date, type });
  };
```

そして `return { getBody, setBody };` を次に変更:

```js
  return { getBody, setBody, EXERCISE_TYPES, getExerciseTypes, hasExercise, toggleExercise };
```

- [ ] **Step 4: テストを再実行して合格を確認**

Run: ブラウザで再読込。
Expected: `11/11 passed`。

- [ ] **Step 5: Commit**

```bash
git add js/data-manager.js test-supabase-datamanager.html
git commit -m "feat: add exercise presence model with 5 types (TDD)"
```

---

## Task 5: DataManager — tasks

**Files:**
- Modify: `js/data-manager.js`
- Test: `test-supabase-datamanager.html`（テスト追加）

- [ ] **Step 1: 失敗するテストを追加**

`run()` 内、exercise テストの後に追加:

```js
      // ----- DataManager: tasks -----
      await test('addTask creates task with id/name/status/date', async () => {
        const dm = createDataManager(createMemoryBackend());
        const t = await dm.addTask('テスト', null);
        if (!t.id) throw new Error('no id');
        if (t.name !== 'テスト') throw new Error('wrong name');
        if (t.status !== 'idea') throw new Error('wrong status');
      });

      await test('getTasks returns added task', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.addTask('A', null);
        const tasks = await dm.getTasks();
        if (tasks.length !== 1) throw new Error('expected 1');
      });

      await test('updateTask changes status', async () => {
        const dm = createDataManager(createMemoryBackend());
        const t = await dm.addTask('A', null);
        await dm.updateTask(t.id, { status: 'todo' });
        const tasks = await dm.getTasks();
        if (tasks[0].status !== 'todo') throw new Error('not updated');
      });

      await test('deleteTask removes task', async () => {
        const dm = createDataManager(createMemoryBackend());
        const t = await dm.addTask('A', null);
        await dm.deleteTask(t.id);
        const tasks = await dm.getTasks();
        if (tasks.length !== 0) throw new Error('not deleted');
      });

      await test('getTasksByStatus filters', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.addTask('A', null);             // idea
        const t = await dm.addTask('B', null);
        await dm.updateTask(t.id, { status: 'todo' });
        const idea = await dm.getTasksByStatus('idea');
        if (idea.length !== 1) throw new Error('wrong idea count');
      });

      await test('getTasksByDate filters', async () => {
        const dm = createDataManager(createMemoryBackend());
        await dm.addTask('A', '2026-06-01');
        await dm.addTask('B', null);
        const dated = await dm.getTasksByDate('2026-06-01');
        if (dated.length !== 1) throw new Error('wrong dated count');
      });
```

- [ ] **Step 2: テストを開いて失敗を確認**

Run: ブラウザで再読込。
Expected: `dm.addTask is not a function` で tasks テストが FAIL。

- [ ] **Step 3: tasks を実装**

`js/data-manager.js` の `createDataManager` 内、exercise の後・`return` の前に追加:

```js
  // ----- Tasks -----
  const uuid = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

  const getTasks = async () => backend.list('tasks');
  const getTasksByStatus = async (status) =>
    (await backend.list('tasks')).filter(t => t.status === status);
  const getTasksByDate = async (date) =>
    (await backend.list('tasks')).filter(t => t.date === date);

  const addTask = async (name, date = null) => {
    const task = { id: uuid(), name, status: 'idea', date };
    await backend.upsert('tasks', task, 'id');
    return task;
  };

  const updateTask = async (id, updates) => {
    const rows = await backend.list('tasks');
    const cur = rows.find(t => t.id === id);
    if (!cur) throw new Error(`Task ${id} not found`);
    const next = { ...cur, ...updates };
    await backend.upsert('tasks', next, 'id');
    return next;
  };

  const deleteTask = async (id) => { await backend.remove('tasks', { id }); };
```

`return` を次に更新:

```js
  return {
    getBody, setBody,
    EXERCISE_TYPES, getExerciseTypes, hasExercise, toggleExercise,
    getTasks, getTasksByStatus, getTasksByDate, addTask, updateTask, deleteTask,
  };
```

- [ ] **Step 4: テストを再実行して合格を確認**

Run: ブラウザで再読込。
Expected: `17/17 passed`。

- [ ] **Step 5: Commit**

```bash
git add js/data-manager.js test-supabase-datamanager.html
git commit -m "feat: add async task CRUD to DataManager (TDD)"
```

---

## Task 6: SupabaseBackend（実 backend）

**Files:**
- Create: `js/backend-supabase.js`

> ネットワーク/認証が必要なため自動テストは行わず、Task 9 の手動 e2e で検証する。契約は MemoryBackend と同一なので、Task 2-5 のテストがドメイン層の正しさを既に担保している。

- [ ] **Step 1: SupabaseBackend を実装**

`js/backend-supabase.js` を新規作成。

```js
// Real backend backed by supabase-js. Same contract as MemoryBackend.
// `supabaseClient` is a client created via supabase.createClient(url, anonKey).
function createSupabaseBackend(supabaseClient) {
  const list = async (table) => {
    const { data, error } = await supabaseClient.from(table).select('*');
    if (error) throw new Error(error.message);
    return data || [];
  };

  const upsert = async (table, row, onConflict) => {
    const { data, error } = await supabaseClient
      .from(table)
      .upsert(row, { onConflict })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  };

  const remove = async (table, match) => {
    let q = supabaseClient.from(table).delete();
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw new Error(error.message);
  };

  return { list, upsert, remove };
}

if (typeof window !== 'undefined') window.createSupabaseBackend = createSupabaseBackend;
```

> 注: `user_id` は INSERT 時に DB 側 `default auth.uid()` が入るため、クライアントから送らない。RLS が読み書きを本人行に限定する。

- [ ] **Step 2: 構文を確認（手動）**

Run: `node --check js/backend-supabase.js`
Expected: 出力なし（構文エラーなし）。

- [ ] **Step 3: Commit**

```bash
git add js/backend-supabase.js
git commit -m "feat: add SupabaseBackend implementation"
```

---

## Task 7: 認証とアプリ初期化（index.html）

**Files:**
- Modify: `index.html`（`<head>` と起動スクリプト、旧 DataManager 削除）

> 認証フローは手動検証（Task 9）。ここでは配線を行う。

- [ ] **Step 1: supabase-js と自作 JS を読み込む**

`index.html` の `</head>` 直前に追加:

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    // === Supabase config (fill in after Task 1 / SETUP.md) ===
    const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
    const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
  </script>
  <script src="js/backend-memory.js"></script>
  <script src="js/backend-supabase.js"></script>
  <script src="js/data-manager.js"></script>
```

- [ ] **Step 2: 旧インライン DataManager を削除**

`index.html` の `const DataManager = (() => { ... })();`（おおよそ 856–945 行、`// ===== DATA MANAGER =====` から閉じ `})();` まで）を削除する。
以降この計画では、グローバル `let DataManager;` を起動時に `createDataManager(...)` で代入して使う。

- [ ] **Step 3: ログイン UI を追加**

`<body>` の先頭（既存アプリ ルート要素の前）に追加:

```html
  <div id="auth-screen" style="display:none; max-width:360px; margin:15vh auto; font-family:sans-serif; text-align:center;">
    <h2>Health Tracker</h2>
    <p>メールアドレスを入力し、届いたリンクからログインしてください。</p>
    <input id="auth-email" type="email" placeholder="you@example.com"
           style="width:100%; padding:.6rem; margin:.5rem 0; box-sizing:border-box;" />
    <button id="auth-send" style="width:100%; padding:.6rem;">ログインリンクを送る</button>
    <p id="auth-msg" style="color:#1d5be0; min-height:1.2em;"></p>
  </div>
  <div id="app-error" style="display:none; position:fixed; top:0; left:0; right:0;
       background:#cf3a3a; color:#fff; padding:.6rem; text-align:center; z-index:9999;"></div>
```

- [ ] **Step 4: 起動スクリプトを書く**

`index.html` 末尾の既存 `DOMContentLoaded` / 初期化呼び出し（`renderAll()` などを最初に呼ぶ箇所、おおよそ 1496 行付近の `renderAll` 定義の後にある起動処理）を、次の起動フローに置き換える:

```js
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'block';
  }
  function showError(msg) {
    const el = document.getElementById('app-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  async function startApp() {
    DataManager = createDataManager(createSupabaseBackend(sb));
    try {
      await renderAll();   // renderAll は Task 8 で async 化済み
    } catch (e) {
      showError('接続できません。通信環境を確認してください');
      console.error(e);
    }
  }

  document.getElementById('auth-send').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return;
    const { error } = await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: window.location.href }
    });
    document.getElementById('auth-msg').textContent =
      error ? `エラー: ${error.message}` : 'メールを確認してリンクをタップしてください';
  });

  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) { await startApp(); }
    else { showAuthScreen(); }
    sb.auth.onAuthStateChange((_event, s) => {
      if (s) {
        document.getElementById('auth-screen').style.display = 'none';
        startApp();
      }
    });
  })();
```

- [ ] **Step 5: 構文を確認（手動）**

Run: `node --check` は HTML 不可のため、ブラウザの DevTools コンソールで読み込みエラーがないことを確認（この時点では Task 8 未了のため描画は不完全でよい。`renderAll is not defined` 等の論理エラーは Task 8 で解消）。
Expected: `supabase` グローバルが読め、構文エラーが出ない。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: wire Supabase auth and app startup"
```

---

## Task 8: 描画層を async 化 ＋ 運動 UI を5種目トグルへ（index.html）

**Files:**
- Modify: `index.html`（`renderCalendar` / `renderRecordsPanel` / `renderTaskPanel` / `renderStreaks` / `renderAll` ほか DataManager 呼び出し箇所）

> DataManager が全メソッド async になったため、呼び出し側を `await` 対応にする。運動の3ブール → 5種目トグルへ変更。

- [ ] **Step 1: renderAll と各 render を async 化**

`renderAll`（おおよそ 1496 行）を:

```js
  async function renderAll() {
    await renderCalendar();
    await renderTaskPanel();
    await renderRecordsPanel();
    await renderStreaks();
  }
```

各 `function renderCalendar()` → `async function renderCalendar()` のように、`DataManager.*` を呼ぶ全 render 関数を `async` 化し、内部の `DataManager.xxx(...)` 呼び出しを `await DataManager.xxx(...)` にする。対象（grep 済み行）:
- `renderCalendar`（1029: `DataManager.getExercise` → 下記 Step 2 で置換）
- `renderRecordsPanel`（1371-1372: `getBody` / 運動取得）
- `renderTaskPanel`（タスク取得）
- `renderStreaks`（1481-1483: 運動連続）

> ループ内で `await` する箇所（カレンダー各日）は `for...of` に変換する（`forEach` 内 `await` は効かない）。

- [ ] **Step 2: 運動の取得を新モデルに置換**

旧: `const exRec = DataManager.getExercise(dateStr); ... exRec.muscleTraining` 形式を、種目配列ベースに置換。

`renderCalendar` のカレンダーセル生成（1029 付近）:

```js
      const types = await DataManager.getExerciseTypes(dateStr);
      // types は ['筋トレ','RUN',...]。アイコン表示に使う。
```

カレンダーのアイコン行（旧 `cal-exercise-icons`）は種目→絵文字で描画:

```js
      const EX_ICON = { '筋トレ': '💪', 'RUN': '🏃', 'WALKING': '🚶', 'BIKE': '🚴', 'HIIT': '⚡' };
      if (types.length) {
        const iconRow = document.createElement('div');
        iconRow.className = 'cal-exercise-icons';
        iconRow.textContent = types.map(t => EX_ICON[t] || '•').join('');
        // ... 既存の append 先に合わせて追加
      }
```

- [ ] **Step 3: records パネルの運動トグルを5種目に置換**

`renderRecordsPanel`（1397-1401 の3ボタン）を、5種目ループに置換:

```js
      const exTypes = DataManager.EXERCISE_TYPES; // ['筋トレ','RUN','WALKING','BIKE','HIIT']
      const activeTypes = await DataManager.getExerciseTypes(selectedDate);
      const exButtons = exTypes.map(t => `
        <button class="ex-btn-top${activeTypes.includes(t) ? ' active' : ''}"
                data-ex="${t}" data-date="${selectedDate}">${t}</button>
      `).join('');
      // 既存の運動ボタン領域の innerHTML に exButtons を差し込む
```

トグルのクリックハンドラ（旧 `toggleExercise` 相当、1448-1453 付近）を:

```js
  async function onExerciseToggle(btn) {
    const date = btn.dataset.date;
    const type = btn.dataset.ex;
    const isActive = btn.classList.contains('active');
    await DataManager.toggleExercise(date, type, !isActive);
    await renderRecordsPanel();
    await renderCalendar();
  }
```

ボタンへのイベント割当（イベント委譲）を records パネル生成後に設定:

```js
      document.querySelectorAll('.ex-btn-top').forEach(b =>
        b.addEventListener('click', () => onExerciseToggle(b)));
```

- [ ] **Step 4: streaks を種目ベースに置換**

`renderStreaks`（1481-1483）の `calcStreak` 呼び出しを種目名で:

```js
    const cards = [
      { icon: '💪', label: '筋トレ連続', count: await calcStreak(d => DataManager.hasExercise(d, '筋トレ')) },
      { icon: '🏃', label: 'RUN連続',    count: await calcStreak(d => DataManager.hasExercise(d, 'RUN')) },
      { icon: '⚡', label: 'HIIT連続',   count: await calcStreak(d => DataManager.hasExercise(d, 'HIIT')) },
    ];
```

`calcStreak` も `async` 化し、内部で `await pred(d)` を使う（`for` ループで日付を遡る形に）。

- [ ] **Step 5: body / task 呼び出しを await 化**

`renderRecordsPanel` の `DataManager.getBody(...)`、body 保存ハンドラ、`renderTaskPanel` のタスク取得・追加・更新・削除ハンドラを、それぞれ `await` 付きに修正し、ハンドラ関数を `async` 化する。各保存後は対応する `await render...()` を呼ぶ。

- [ ] **Step 6: ブラウザで手動確認（Supabase 設定後）**

> このステップは Task 9 で Supabase 設定と GitHub Pages を済ませた後にまとめて検証する。ここではコード反映のみ。

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: make render layer async and switch exercise UI to 5 toggles"
```

---

## Task 9: セットアップ手順書 ＋ 手動 e2e ＋ デプロイ

**Files:**
- Create: `SETUP.md`

- [ ] **Step 1: SETUP.md を作成**

```markdown
# Health Tracker セットアップ

## 1. Supabase
1. https://supabase.com で無料プロジェクト作成
2. SQL Editor で `supabase-schema.sql` を実行
3. Authentication → Providers → Email を有効化（Confirm email: ON）
4. Authentication → URL Configuration → Site URL / Redirect URLs に
   GitHub Pages の公開 URL を追加（例: https://USER.github.io/health-tracker/）
5. Project Settings → API から Project URL と anon public key を控える

## 2. アプリ設定
- `index.html` の `SUPABASE_URL` と `SUPABASE_ANON_KEY` を 1-5 の値に書き換える

## 3. GitHub Pages
1. GitHub に `health-tracker` リポジトリを作成し push
2. Settings → Pages → Source: main / root を選び保存
3. 発行された URL を Supabase の Redirect URLs（1-4）にも反映

## 4. スマホ
- 公開 URL を開き「ホーム画面に追加」
```

- [ ] **Step 2: Supabase 設定を実施（手動・SETUP.md 1-2章）**

`index.html` に URL と anon key を記入。
Expected: コンソールに Supabase 関連エラーが出ない。

- [ ] **Step 3: GitHub Pages へデプロイ（手動・SETUP.md 3章）**

Run:
```bash
git remote add origin git@github.com:USER/health-tracker.git
git push -u origin main
```
GitHub の Settings → Pages で公開。
Expected: 公開 URL でアプリが開く。

- [ ] **Step 4: 手動 e2e テスト（設計のテスト項目）**

1. PC でログイン（メールリンク）→ 体重・運動・タスクを入力
2. スマホで開く → 同じデータが見える
3. スマホで入力 → PC 再読込で反映
4. 運動5種目トグルの ON/OFF が保存される（再読込後も保持）
5. 別ブラウザ（未ログイン）で公開 URL → データが見えない（RLS）

Expected: 全項目 OK。

- [ ] **Step 5: Commit**

```bash
git add SETUP.md
git commit -m "docs: add setup and deploy guide"
```

---

## Self-Review メモ

- **Spec coverage:** データ構造(Task1,3,4,5) / マジックリンク認証(Task7) / RLS(Task1,9-5) / 改修ポイント=DataManager async・呼出側await・起動時認証・運動5トグル・設定追加(Task6,7,8) / エラー処理(Task7 showError, Task8) / テスト(Task2-5自動 + Task9手動) / セットアップ(Task9) — すべて対応。
- **運動モデル変更:** 旧 boolean 3種(muscleTraining/cardio/hiit) → 種目presence 5種。カレンダーアイコン・streaks・records トグルの3箇所すべて Task8 で置換。
- **型整合:** backend 契約 `list/upsert/remove` は Memory/Supabase 両実装で一致。DataManager 公開 API（getBody/setBody/EXERCISE_TYPES/getExerciseTypes/hasExercise/toggleExercise/getTasks/getTasksByStatus/getTasksByDate/addTask/updateTask/deleteTask）は Task3-5 で定義し Task8 の呼出と一致。
- **既知の限界:** SupabaseBackend と認証/デプロイは自動テスト対象外、Task9 の手動 e2e で担保。
