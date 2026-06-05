# Health Tracker — Design Spec

## Context

個人用ヘルス＆習慣トラッカー。体重・体脂肪の記録、運動の習慣トラッキング、タスク達成の記録をカレンダー形式で管理する。参考：YouTubeの習慣カレンダーアプリ（左にタスクプール、中央に大カレンダー）。

過去の実装は CSS の height 連鎖バグでカレンダーが非表示になっていた。今回はゼロから書き直す。

---

## 成果物

`/Users/moromizatomasaru/health-tracker/index.html`（単一ファイル完結）

---

## データ構造

```json
{
  "bodyRecords": [
    { "date": "2026-06-01", "weight": 68.5, "bodyFat": 18.2 }
  ],
  "exerciseRecords": [
    { "date": "2026-06-01", "muscleTraining": true, "cardio": false, "hiit": false }
  ],
  "tasks": [
    {
      "id": "uuid",
      "name": "ヘルストラッカー作成",
      "status": "idea | scheduled | completed",
      "date": "2026-06-01 | null"
    }
  ]
}
```

- localStorage キー: `health-tracker-data`
- `tasks.date`: `scheduled`/`completed` なら日付あり、`idea` なら null

---

## レイアウト設計

```
┌──────────────────────────────────────────────────┐
│ HEADER: Health Tracker         [Export] [Import]  │
├──────────────────────────────────────────────────┤
│ [📋 Tracker] [📊 Dashboard]                       │
├──────────────────────────────────────────────────┤
│ ← Prev    June 2026    Next →                     │
│ 💪 6日  🏃 4日  ⚡ 2日  ✅ 8タスク              │  ← stats bar
├────────────┬─────────────────────────────────────┤
│ LEFT PANEL │          CALENDAR                   │
│ (280px)    │                                     │
│            │  Sun  Mon  Tue  Wed  Thu  Fri  Sat  │
│ 💡 IDEA    │ ┌───┬───┬───┬───┬───┬───┬───┐      │
│ [タスク入力] │ │   │   │ 1 │ 2 │ 3 │ 4 │ 5 │      │
│ card       │ │   │   │💪 │   │🏃 │💪 │   │      │
│ card       │ │   │   │📋 │   │📋 │📋 │   │      │
│            │ └───┴───┴───┴───┴───┴───┴───┘      │
│ 📅 SCHED.  │  ...                                │
│ card       │                                     │
│            │ 🗑️ ここにドロップで削除              │
│ ✅ DONE    │                                     │
│ card       │                                     │
├────────────┤                                     │
│ 📅 日付選択 │                                     │
│ 体重・体脂肪│                                     │
│ 運動トグル  │                                     │
│ [保存]     │                                     │
└────────────┴─────────────────────────────────────┘
```

---

## カレンダー実装（バグ修正済み方針）

**根本方針: height を親から継承しない。カレンダーは自然なドキュメントフローで高さを持つ。**

```css
/* ❌ やらない */
.app { height: 100vh; overflow: hidden; }
.panel { flex: 1; overflow: hidden; }

/* ✅ やる */
.main-content { display: flex; min-height: 0; }   /* min-height: 0 で flex overflow を防ぐ */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  /* grid-auto-rows なし — セルが自然に高さを持つ */
}
.calendar-cell {
  min-height: 100px;  /* min-height のみ。固定高さなし */
  border: 1px solid #e0e0e0;
  padding: 6px;
  overflow: visible;
}
```

カレンダーセル内:
- 日付番号（左上）
- 運動アイコン行: 💪🏃⚡（やった種別のみ表示）
- タスクカード（複数可、小さいタグ形式）

---

## ドラッグ&ドロップ

HTML5 Drag and Drop API を使用。

- **ドラッグ元**: 左パネルのタスクカード（`draggable="true"`）
- **ドロップ先**: カレンダーの各日セル
- **削除ゾーン**: カレンダー下部の赤いエリアにドロップで削除
- カレンダー内のタスクカードも再ドラッグして別の日や削除ゾーンへ移動可能

---

## タブ構成

### Tab 1: Tracker
- 月ナビ + 統計バー（種別ごとの今月カウント）
- 左パネル:
  - タスク管理（Idea / Scheduled / Completed）
  - タスク入力フォーム（Idea に追加）
  - 区切り線
  - 記録入力フォーム（日付選択、体重、体脂肪、運動トグル）
- 中央: カレンダー + 削除ゾーン

### Tab 2: Dashboard
- 期間切替（30日/90日/全期間）
- 体重推移グラフ
- 体脂肪率推移グラフ
- 筋トレ/有酸素/HIIT 月別達成率グラフ（各1つ）

---

## 技術仕様

| 項目 | 採用 |
|------|------|
| グラフ | Chart.js v4 (CDN) |
| DnD | HTML5 Drag and Drop API |
| スタイル | バニラ CSS（フレームワークなし） |
| UUID | crypto.randomUUID() |

---

## 検証

1. `open /Users/moromizatomasaru/health-tracker/index.html` でブラウザ起動
2. カレンダーが全日表示されることを確認
3. タスク入力 → Idea に追加 → カレンダーにドラッグ → 日付セルに表示
4. 削除ゾーンへドラッグ → タスク消える
5. 体重・体脂肪・運動トグル → 保存 → カレンダーにアイコン表示
6. リロード後もデータ保持
7. Dashboard タブでグラフ表示
