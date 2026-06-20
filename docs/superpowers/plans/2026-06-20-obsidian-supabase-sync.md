# Obsidian→Supabase 同期 & Web再公開 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian の Markdown（体組成・トレーニング）を Supabase に一方向自動同期し、閲覧専用の Health Tracker Web版を GitHub Pages で再公開する。

**Architecture:** Node スクリプト（`sync-to-supabase.mjs`）が Markdown テーブルをパースし、service_role key で Supabase に全件 UPSERT する。Web版（既存 SPA）は8種目＋詳細を表示できるよう最小改修し、入力UIを閲覧専用化する。記録ワークフロー（CLAUDE.md）に同期実行を組み込む。

**Tech Stack:** Node.js (ESM, `node:test`), `@supabase/supabase-js`, 既存の静的 HTML/JS SPA, Supabase (Postgres + RLS), GitHub Pages, gh CLI。

## Global Constraints

- 同期方向は一方向（Obsidian → Supabase）。Web版は閲覧専用。
- Source of Truth は Markdown。Supabase は毎回全件 UPSERT で揃える（冪等）。
- service_role key は `.env` のみに置き、絶対に git に入れない（`.gitignore` 必須）。
- トレーニングは8種目をそのまま格納し詳細も保持（情報を捨てない）。
- 8種目と絵文字（Obsidian統一）: 💪腕立て / 🛞アブローラー / 🦵スクワット / 🧗斜め懸垂 / 🏃RUN / 🚶WALKING / 🚲BIKE / 🔥HIIT
- 筋トレ系（strength）= 腕立て / アブローラー / スクワット / 斜め懸垂。
- Markdown パス:
  - 体組成: `/Users/moromizatomasaru/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian倉庫/Health/体組成.md`
  - トレーニング: `/Users/moromizatomasaru/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian倉庫/Health/トレーニング.md`
- 作業ディレクトリ: `apps/health-tracker`（ブランチ `feat/supabase-sync`）。

---

## File Structure

- `sync/parse.mjs` (新規) — Markdown テーブルのパース関数（純粋関数・テスト対象）
- `sync/parse.test.mjs` (新規) — parse.mjs の node:test ユニットテスト
- `sync-to-supabase.mjs` (新規) — エントリポイント。parse → Supabase UPSERT
- `package.json` (新規) — ESM 宣言・依存・test スクリプト
- `.env.example` (新規) — 設定テンプレ（実値は `.env`、gitignore）
- `.gitignore` (修正) — `.env` / `node_modules` 追加
- `supabase-schema.sql` (修正) — `exercise_records.detail` 追加
- `js/data-manager.js` (修正) — 8種目・strength グループ・詳細取得を追加
- `index.html` (修正) — EX_ICON 8種目化、records パネルを閲覧専用（詳細リスト）化、チャート/ストリークの strength 対応、Supabase 接続値

---

## Task 1: package.json と .gitignore のセットアップ

**Files:**
- Create: `apps/health-tracker/package.json`
- Modify: `apps/health-tracker/.gitignore`

**Interfaces:**
- Produces: `npm test` が `node --test sync/` を走らせる。`@supabase/supabase-js` が依存に入る。

- [ ] **Step 1: package.json を作成**

```json
{
  "name": "health-tracker-sync",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test sync/",
    "sync": "node sync-to-supabase.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

- [ ] **Step 2: .gitignore を更新**

`.gitignore` の内容を以下にする（既存の `.DS_Store` を残す）:

```
.DS_Store
node_modules/
.env
```

- [ ] **Step 3: 依存をインストール**

Run: `cd apps/health-tracker && npm install`
Expected: `node_modules/@supabase/supabase-js` が作成され、エラーなく完了。

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add node package config and ignore env/node_modules"
```

---

## Task 2: 体組成 Markdown パーサ

**Files:**
- Create: `apps/health-tracker/sync/parse.mjs`
- Test: `apps/health-tracker/sync/parse.test.mjs`

**Interfaces:**
- Produces: `parseBody(markdown: string) => Array<{ date: string, weight: number|null, body_fat: number|null }>`
  - データ行（`| YYYY-MM-DD | ... |`）のみ抽出。ヘッダ行（`日付` を含む）・区切り行（`---` を含む）・タイトル/引用行は無視。
  - 空セルは `null`。数値はパースして number。

- [ ] **Step 1: 失敗するテストを書く**

`sync/parse.test.mjs`:

```js
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd apps/health-tracker && node --test sync/parse.test.mjs`
Expected: FAIL（`parseBody` が未定義 / モジュール解決エラー）。

- [ ] **Step 3: parse.mjs に parseBody と共通ヘルパを実装**

`sync/parse.mjs`:

```js
// Markdown テーブルのデータ行だけを {cells: string[]} で返す共通ヘルパ。
// 先頭が "|" の行のうち、ヘッダ行（"日付" を含む）と区切り行（"---" を含む）を除外する。
function tableRows(markdown) {
  return markdown
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|'))
    .filter(l => !l.includes('日付'))   // header
    .filter(l => !l.includes('---'))    // separator
    .map(l => l.slice(1, l.endsWith('|') ? -1 : undefined)
                .split('|')
                .map(c => c.trim()));
}

function num(s) {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

export function parseBody(markdown) {
  return tableRows(markdown).map(cells => ({
    date: cells[0],
    weight: num(cells[1]),
    body_fat: num(cells[2]),
  }));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd apps/health-tracker && node --test sync/parse.test.mjs`
Expected: PASS（3 tests）。

- [ ] **Step 5: Commit**

```bash
git add sync/parse.mjs sync/parse.test.mjs
git commit -m "feat: add body markdown parser"
```

---

## Task 3: トレーニング Markdown パーサ（8種目＋詳細・同日同種目の集約）

**Files:**
- Modify: `apps/health-tracker/sync/parse.mjs`
- Modify: `apps/health-tracker/sync/parse.test.mjs`

**Interfaces:**
- Consumes: `tableRows` （Task 2 の共通ヘルパ）
- Produces: `parseExercise(markdown: string) => Array<{ date: string, type: string, detail: string|null }>`
  - 行: `| 日付 | 種目 | 詳細 | メモ |`。種目は8種目をそのまま `type` に。
  - 同一 `(date, type)` が複数行ある場合は1件に集約し、`detail` を ` / ` で連結（空詳細は除外）。連結結果が空なら `null`。

- [ ] **Step 1: 失敗するテストを追記**

`sync/parse.test.mjs` の末尾に追記:

```js
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd apps/health-tracker && node --test sync/parse.test.mjs`
Expected: FAIL（`parseExercise` が未定義）。

- [ ] **Step 3: parseExercise を実装**

`sync/parse.mjs` の末尾に追記:

```js
export function parseExercise(markdown) {
  const map = new Map(); // key: `${date} ${type}` -> { date, type, details: string[] }
  for (const cells of tableRows(markdown)) {
    const date = cells[0];
    const type = cells[1];
    const detail = cells[2];
    if (!date || !type) continue;
    const key = `${date} ${type}`;
    if (!map.has(key)) map.set(key, { date, type, details: [] });
    if (detail) map.get(key).details.push(detail);
  }
  return [...map.values()].map(({ date, type, details }) => ({
    date,
    type,
    detail: details.length ? details.join(' / ') : null,
  }));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd apps/health-tracker && node --test sync/parse.test.mjs`
Expected: PASS（全 6 tests）。

- [ ] **Step 5: Commit**

```bash
git add sync/parse.mjs sync/parse.test.mjs
git commit -m "feat: add exercise markdown parser with 8 types and detail merge"
```

---

## Task 4: スキーマに detail カラムを追加

**Files:**
- Modify: `apps/health-tracker/supabase-schema.sql`

**Interfaces:**
- Produces: `exercise_records.detail text`（nullable）。`unique (user_id, date, type)` は維持。

- [ ] **Step 1: supabase-schema.sql を修正**

`create table if not exists exercise_records (...)` の `type text not null,` の直後に次の行を追加:

```sql
  detail text,
```

加えて、既存プロジェクトにも適用できるよう、`create table` 群の直後（`alter table ... enable row level security;` の前）に冪等な ALTER を追加:

```sql
-- 既存環境向け: detail 列を後付け（新規 create では既に存在するため no-op）
alter table exercise_records add column if not exists detail text;
```

- [ ] **Step 2: SQL の妥当性を目視確認**

Run: `cd apps/health-tracker && grep -n "detail" supabase-schema.sql`
Expected: 2 箇所（create 内の `detail text,` と `add column if not exists detail text;`）がヒット。

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: add detail column to exercise_records schema"
```

> 注: 実際の Supabase への適用（SQL Editor で実行）は Task 9 のデプロイ作業で本人が行う。

---

## Task 5: 同期エントリポイント `sync-to-supabase.mjs`

**Files:**
- Create: `apps/health-tracker/sync-to-supabase.mjs`
- Create: `apps/health-tracker/.env.example`

**Interfaces:**
- Consumes: `parseBody`, `parseExercise`（Task 2,3）、環境変数 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `USER_ID` / 任意 `OBSIDIAN_HEALTH_DIR`。
- 動作: 2ファイルを読み込み → パース → `user_id` を付与して body_records / exercise_records に全件 UPSERT。件数を stdout に出力。

このタスクは外部 I/O（ファイル + Supabase）が主で、ユニットテストの対象は Task 2,3 のパーサで担保済み。ここは実行確認で検証する。

- [ ] **Step 1: .env.example を作成**

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
USER_ID=YOUR-AUTH-USER-UUID
# 省略時は既定の Obsidian Health ディレクトリを使用
OBSIDIAN_HEALTH_DIR=/Users/moromizatomasaru/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian倉庫/Health
```

- [ ] **Step 2: sync-to-supabase.mjs を作成**

```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseBody, parseExercise } from './sync/parse.mjs';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  USER_ID,
  OBSIDIAN_HEALTH_DIR = '/Users/moromizatomasaru/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian倉庫/Health',
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`環境変数 ${name} が未設定です（.env を確認）`);
    process.exit(1);
  }
}
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
requireEnv('USER_ID', USER_ID);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const bodyMd = await readFile(join(OBSIDIAN_HEALTH_DIR, '体組成.md'), 'utf8');
  const exMd = await readFile(join(OBSIDIAN_HEALTH_DIR, 'トレーニング.md'), 'utf8');

  const bodyRows = parseBody(bodyMd).map(r => ({ ...r, user_id: USER_ID }));
  const exRows = parseExercise(exMd).map(r => ({ ...r, user_id: USER_ID }));

  const body = await supabase
    .from('body_records')
    .upsert(bodyRows, { onConflict: 'user_id,date' });
  if (body.error) throw new Error(`body_records: ${body.error.message}`);

  const ex = await supabase
    .from('exercise_records')
    .upsert(exRows, { onConflict: 'user_id,date,type' });
  if (ex.error) throw new Error(`exercise_records: ${ex.error.message}`);

  console.log(`同期完了: body_records ${bodyRows.length}件 / exercise_records ${exRows.length}件`);
}

main().catch(err => {
  console.error('同期に失敗しました:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: 環境変数未設定で安全に停止することを確認**

Run: `cd apps/health-tracker && node sync-to-supabase.mjs`
Expected: `環境変数 SUPABASE_URL が未設定です（.env を確認）` と表示され exit 1（Supabase 認証情報が揃う Task 9 まで実行はここまで）。

- [ ] **Step 4: Commit**

```bash
git add sync-to-supabase.mjs .env.example
git commit -m "feat: add obsidian-to-supabase sync entrypoint"
```

---

## Task 6: data-manager に8種目・strength グループ・詳細取得を追加

**Files:**
- Modify: `apps/health-tracker/js/data-manager.js`

**Interfaces:**
- Consumes: `backend.list('exercise_records')`（既存）。行は `{ date, type, detail }` を持つ。
- Produces（`createDataManager` の戻り値に追加 / 既存を変更）:
  - `EXERCISE_TYPES = ['腕立て','アブローラー','スクワット','斜め懸垂','RUN','WALKING','BIKE','HIIT']`
  - `STRENGTH_TYPES = ['腕立て','アブローラー','スクワット','斜め懸垂']`
  - `getExerciseDetails(date) => Promise<Array<{type, detail}>>`
  - `hasStrength(date) => Promise<boolean>`

`data-manager.js` はブラウザ用 IIFE 風モジュール（テストは既存の HTML ハーネスでのみ実行）。ここはロジック追加が中心で、HTML ハーネスのスモーク確認で検証する。

- [ ] **Step 1: EXERCISE_TYPES を8種目に変更**

`const EXERCISE_TYPES = ['筋トレ', 'RUN', 'WALKING', 'BIKE', 'HIIT'];` を次に置換:

```js
const EXERCISE_TYPES = ['腕立て', 'アブローラー', 'スクワット', '斜め懸垂', 'RUN', 'WALKING', 'BIKE', 'HIIT'];
const STRENGTH_TYPES = ['腕立て', 'アブローラー', 'スクワット', '斜め懸垂'];
```

- [ ] **Step 2: getExerciseDetails と hasStrength を追加**

`hasExercise` 関数の定義直後に追加:

```js
const getExerciseDetails = async (date) => {
  const rows = await backend.list('exercise_records');
  return rows.filter(r => r.date === date).map(r => ({ type: r.type, detail: r.detail ?? null }));
};

const hasStrength = async (date) => {
  const types = await getExerciseTypes(date);
  return STRENGTH_TYPES.some(t => types.includes(t));
};
```

- [ ] **Step 3: 公開オブジェクトに追加**

`createDataManager` の `return { ... }` に `EXERCISE_TYPES`, `STRENGTH_TYPES`, `getExerciseDetails`, `hasStrength` が含まれるよう追記する（既存の戻り値プロパティ群の末尾に追加）。

Run: `cd apps/health-tracker && grep -n "STRENGTH_TYPES\|getExerciseDetails\|hasStrength" js/data-manager.js`
Expected: 定義箇所と return 箇所の両方でヒットする。

- [ ] **Step 4: Commit**

```bash
git add js/data-manager.js
git commit -m "feat: add 8 exercise types, strength group, detail accessor to data-manager"
```

---

## Task 7: index.html を閲覧専用＋8種目＋詳細表示に改修

**Files:**
- Modify: `apps/health-tracker/index.html`

**Interfaces:**
- Consumes: `DataManager.getExerciseDetails`, `DataManager.hasStrength`（Task 6）、`EX_ICON`（拡張後）。

- [ ] **Step 1: EX_ICON を8種目（Obsidian統一絵文字）に変更**

`const EX_ICON = { '筋トレ': '💪', 'RUN': '🏃', 'WALKING': '🚶', 'BIKE': '🚴', 'HIIT': '⚡' };` を置換:

```js
const EX_ICON = {
  '腕立て': '💪', 'アブローラー': '🛞', 'スクワット': '🦵', '斜め懸垂': '🧗',
  'RUN': '🏃', 'WALKING': '🚶', 'BIKE': '🚲', 'HIIT': '🔥',
};
```

- [ ] **Step 2: ストリークの筋トレ判定を strength グループに変更**

`{ icon: '💪', label: '筋トレ連続', count: await calcStreak(d => DataManager.hasExercise(d, '筋トレ')) },` を置換:

```js
      { icon: '💪', label: '筋トレ連続', count: await calcStreak(d => DataManager.hasStrength(d)) },
```

- [ ] **Step 3: 達成率チャートの筋トレ集計を strength グループに変更**

チャート定義の `{ type: '筋トレ', chartId: 'muscleChart', gaugeId: 'muscleGauge', color: '#d61f2b' },` 周辺で、筋トレ系列のカウントに `hasExercise(date,'筋トレ')` を使っている箇所を `hasStrength(date)` ベースに変更する。具体的には、レンジ走査（`scanRange` 付近, 既存 index.html 1440 行付近）で各日 `筋トレ` を数えている処理を、`await DataManager.hasStrength(dateStr)` が true の日をカウントするよう置換する。RUN / HIIT 系列は `hasExercise(date,'RUN')` / `hasExercise(date,'HIIT')` のまま変更しない。

Run: `cd apps/health-tracker && grep -n "'筋トレ'" index.html`
Expected: チャートのラベル表示用途を除き、`hasExercise(..., '筋トレ')` の呼び出しが残っていないこと（ストリーク・集計は `hasStrength` に置換済み）。

- [ ] **Step 4: records パネルを閲覧専用（種目＋詳細リスト）に変更**

`renderRecordsPanel` 内、`const exButtons = exTypes.map(...).join('');` を、トグルではなく当日の種目＋詳細を読み取り表示するブロックに置換:

```js
    const exDetails = await DataManager.getExerciseDetails(selectedDate);
    const exList = exDetails.length
      ? exDetails.map(e => `
        <div class="ex-detail-row">
          <span>${EX_ICON[e.type] || '•'} ${e.type}</span>
          <span class="ex-detail-text">${e.detail ? e.detail : ''}</span>
        </div>`).join('')
      : '<div class="ex-detail-empty">記録なし</div>';
```

続いて、`container.innerHTML` テンプレート内の `<div ...>${exButtons}</div>` を次に置換:

```js
      <div class="ex-detail-list" style="display: flex; flex-direction: column; gap: 3px; margin-top: 6px;">
        ${exList}
      </div>
```

- [ ] **Step 5: トグル配線を削除**

`renderRecordsPanel` 末尾の以下2行（トグルボタンの配線）を削除する:

```js
    document.querySelectorAll('.ex-btn-top').forEach(b =>
      b.addEventListener('click', () => onExerciseToggle(b)));
```

`onExerciseToggle` 関数は他から呼ばれなくなるが、定義は残してよい（影響なし）。

- [ ] **Step 6: 詳細リストの最小スタイルを追加**

`<style>` 内の任意の位置（既存 `.cal-exercise-icons` 付近）に追加:

```css
    .ex-detail-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 2px 0; }
    .ex-detail-text { color: var(--text-muted); }
    .ex-detail-empty { font-size: 12px; color: var(--text-muted); }
```

- [ ] **Step 7: スモーク確認（ダミーデータ）**

`index.html` を直接ブラウザで開くと Supabase 接続前はデータ取得でエラーになるため、ここでは構文崩れのみ確認する。

Run: `cd apps/health-tracker && node -e "const s=require('fs').readFileSync('index.html','utf8'); const o=(s.match(/{/g)||[]).length, c=(s.match(/}/g)||[]).length; console.log('braces', o, c);"`
Expected: コマンドがエラーなく実行され、`{` と `}` の数が概ね釣り合っている（大きな乖離がないこと）。

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: 8-type icons, strength grouping, read-only detail panel in web app"
```

---

## Task 8: 記録ワークフローに同期を組み込む（CLAUDE.md）

**Files:**
- Modify: `/Users/moromizatomasaru/.claude/CLAUDE.md`

**Interfaces:**
- 健康記録ルールに「記録・ダッシュボード再生成の後に Supabase 同期を実行」を1行追加（本人許可済み）。

- [ ] **Step 1: CLAUDE.md の健康記録セクションに追記**

`### 記録トリガー` の「記録後は必ず `Health/ダッシュボード.md` を再生成する」の項目の直後に、次の行を追加:

```markdown
- **ダッシュボード再生成の後、`apps/health-tracker/` で `npm run sync` を実行**し、体組成・トレーニングを Supabase（Web版 Health Tracker）へ反映する（`.env` 設定済みの場合のみ。一方向 Obsidian→Web）
```

- [ ] **Step 2: 追記を確認**

Run: `grep -n "npm run sync" /Users/moromizatomasaru/.claude/CLAUDE.md`
Expected: 追加した1行がヒット。

> 注: CLAUDE.md はリポジトリ外のためコミット対象外（個人設定ファイル）。

---

## Task 9: デプロイ（本人作業ゲートあり）

**Files:**
- Modify: `apps/health-tracker/index.html`（SUPABASE_URL / ANON_KEY）
- Create: `apps/health-tracker/.env`（gitignore 済み・コミットしない）

これは外部サービス操作を含むため TDD ではなくチェックリストで進める。各ステップの「担当」を明記。

- [ ] **Step 1（本人）:** Supabase でプロジェクトを作成し、SQL Editor に `supabase-schema.sql`（detail 追加版）を貼り付けて実行。
- [ ] **Step 2（本人）:** Project Settings → API から「Project URL」「anon public key」「service_role key」を控える。
- [ ] **Step 3（Claude）:** `index.html` の `SUPABASE_URL` / `SUPABASE_ANON_KEY`（770-771行）を本人提供の値に書き換える。service_role key は index.html には書かない。
- [ ] **Step 4（本人＋Claude）:** 本人がアプリにメールでログイン → Supabase の Authentication → Users から自分の UUID を取得 → `USER_ID` とする。
- [ ] **Step 5（Claude）:** `.env.example` をコピーして `.env` を作成し、`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `USER_ID` を記入。

```bash
cd apps/health-tracker && cp .env.example .env
# 各値を編集して保存（.env は gitignore 済み）
```

- [ ] **Step 6（Claude）:** 初回全件同期を実行。

Run: `cd apps/health-tracker && npm run sync`
Expected: `同期完了: body_records N件 / exercise_records M件` と表示。Supabase の Table Editor で件数とサンプル行（detail が入っていること）を目視確認。

- [ ] **Step 7（Claude）:** GitHub リポジトリ作成 → push → Pages 有効化。

```bash
cd apps/health-tracker
gh repo create health-tracker --private --source=. --remote=origin --push
gh api -X POST repos/{owner}/health-tracker/pages -f "source[branch]=feat/supabase-sync" -f "source[path]=/" || \
gh api -X POST repos/{owner}/health-tracker/pages -f "build_type=legacy" -f "source[branch]=feat/supabase-sync" -f "source[path]=/"
```

Expected: 公開 URL（`https://<owner>.github.io/health-tracker/`）が発行される。`gh repo view --web` で確認。

> 注: Pages を `main` で配信したい場合は、先に `feat/supabase-sync` を `main` にマージしてから `source[branch]=main` を指定する。

- [ ] **Step 8（本人）:** Supabase Authentication → URL Configuration の Site URL / Redirect URLs に公開 URL を登録。
- [ ] **Step 9（本人）:** スマホで公開 URL を開き、ログイン → カレンダーに体組成・トレーニング（8種目＋詳細）が表示されることを確認。

---

## Self-Review

- **Spec coverage:**
  - スキーマ detail 追加 → Task 4 ✓
  - 同期スクリプト（service_role・冪等 UPSERT・user_id 明示）→ Task 5 ✓
  - Markdown パース（体組成 / 8種目＋詳細）→ Task 2,3 ✓
  - Web表示（8種目絵文字・日別詳細・達成率は既存流用・入力非表示）→ Task 6,7 ✓
  - デプロイ（Supabase / index.html / gh Pages / Auth URL / USER_ID）→ Task 9 ✓
  - ワークフロー組み込み（CLAUDE.md）→ Task 8 ✓
  - テスト（パース単体）→ Task 2,3 ✓
- **Placeholder scan:** 実値・実コードを各ステップに記載済み。プレースホルダーは `.env.example` / デプロイの本人入力値のみ（性質上正当）。
- **Type consistency:** `parseBody` → `{date, weight, body_fat}`、`parseExercise` → `{date, type, detail}`、これらに `user_id` を付与して同名カラムへ UPSERT。`EXERCISE_TYPES`/`STRENGTH_TYPES`/`getExerciseDetails`/`hasStrength` は Task 6 で定義し Task 7 で同名参照。一致を確認済み。
