# Health Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 単一HTMLファイルで動く個人用ヘルス＆習慣トラッカー（体重・体脂肪記録、運動トラッキング、タスクのドラッグ&ドロップ管理、カレンダー表示）

**Architecture:** `localStorage` でデータ永続化。単一 HTML ファイルにインライン CSS/JS。カレンダーは `position: sticky` サイドバー + 自然なドキュメントフローのカレンダーグリッドで高さ問題を完全回避。`height: 100vh` の連鎖は使わない。

**Tech Stack:** Vanilla JS, Vanilla CSS, Chart.js v4 (CDN), HTML5 Drag and Drop API

---

## ファイル構成

- **Create:** `/Users/moromizatomasaru/health-tracker/index.html` — 単一ファイル完結（HTML + CSS + JS）

---

## Task 1: HTML骨格 + CSS基盤

**Files:**
- Create: `/Users/moromizatomasaru/health-tracker/index.html`

- [ ] **Step 1: index.html を新規作成（骨格のみ）**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Health Tracker</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    /* === RESET === */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f0f2f0;
      color: #1a1a1a;
    }

    /* === LAYOUT === */
    .app { max-width: 1400px; margin: 0 auto; background: white; }

    /* === HEADER === */
    .header {
      background: #1e3a0f;
      color: white;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 { font-size: 20px; font-weight: 700; }
    .header-actions { display: flex; gap: 8px; }

    /* === TABS === */
    .tabs { display: flex; border-bottom: 2px solid #e0e0e0; background: #fafafa; padding: 0 24px; }
    .tab-btn {
      padding: 12px 20px;
      border: none; background: transparent; cursor: pointer;
      font-size: 14px; font-weight: 500; color: #666;
      border-bottom: 3px solid transparent; margin-bottom: -2px;
    }
    .tab-btn.active { color: #2d7a1f; border-bottom-color: #4caf50; }

    /* === TAB CONTENT === */
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* === TRACKER LAYOUT: sticky sidebar + scrollable calendar === */
    .tracker-body {
      display: flex;
      align-items: flex-start;  /* ← NOT stretch: lets each side be its own height */
      gap: 0;
    }

    /* LEFT PANEL: sticky, scrolls independently */
    .left-panel {
      flex: 0 0 280px;
      position: sticky;
      top: 0;
      max-height: 100vh;
      overflow-y: auto;
      background: #fafafa;
      border-right: 1px solid #e0e0e0;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* CENTER PANEL: natural document flow, can be any height */
    .center-panel {
      flex: 1;
      min-width: 0;  /* prevents flex overflow */
      padding: 16px;
    }

    /* === BUTTONS === */
    .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .btn-primary { background: #4caf50; color: white; }
    .btn-primary:hover { background: #43a047; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .btn-secondary { background: #757575; color: white; }
    .btn-secondary:hover { background: #616161; }

    /* === FORM ELEMENTS === */
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group label { font-size: 12px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
    input[type="text"],
    input[type="number"],
    input[type="date"] {
      padding: 8px 10px;
      border: 1px solid #d0d0d0;
      border-radius: 6px;
      font-size: 13px;
      width: 100%;
    }
    input[type="text"]:focus,
    input[type="number"]:focus,
    input[type="date"]:focus { outline: 2px solid #4caf50; border-color: transparent; }
  </style>
</head>
<body>
<div class="app">
  <header class="header">
    <h1>🏥 Health Tracker</h1>
    <div class="header-actions">
      <button class="btn btn-secondary btn-sm" onclick="exportData()">📥 Export</button>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('importFile').click()">📤 Import</button>
    </div>
    <input type="file" id="importFile" accept=".json" style="display:none" onchange="importData(event)">
  </header>

  <nav class="tabs">
    <button class="tab-btn active" data-tab="tracker">📋 Tracker</button>
    <button class="tab-btn" data-tab="dashboard">📊 Dashboard</button>
  </nav>

  <!-- TRACKER TAB -->
  <div id="tracker" class="tab-panel active">
    <!-- Month nav + stats bar will go here in Task 3 -->
    <div class="tracker-body">
      <!-- Left panel content in Task 2, 5, 6 -->
      <aside class="left-panel" id="leftPanel">
        <p style="color:#999;font-size:12px;">Loading...</p>
      </aside>
      <!-- Calendar in Task 3 -->
      <main class="center-panel" id="centerPanel">
        <p style="color:#999;font-size:12px;">Loading...</p>
      </main>
    </div>
  </div>

  <!-- DASHBOARD TAB (Task 7) -->
  <div id="dashboard" class="tab-panel">
    <div style="padding:24px;">
      <p style="color:#999;">Dashboard coming in Task 7</p>
    </div>
  </div>
</div>

<script>
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'dashboard') renderCharts();
    });
  });

  // Stubs (implemented in later tasks)
  function exportData() { alert('Export: Task 8'); }
  function importData(e) { alert('Import: Task 8'); }
  function renderCharts() {}
</script>
</body>
</html>
```

- [ ] **Step 2: ブラウザで開いて骨格確認**

```bash
open /Users/moromizatomasaru/health-tracker/index.html
```

確認: ヘッダー緑・タブ2つ・白背景のアプリが表示される

---

## Task 2: データ管理モジュール

**Files:**
- Modify: `index.html` — `<script>` ブロックに追加

- [ ] **Step 1: DataManager を `<script>` の先頭に追加**

既存の `// Tab switching` の前に以下を挿入:

```js
// ===== DATA MANAGER =====
const DataManager = (() => {
  const KEY = 'health-tracker-v2';

  const defaults = () => ({
    bodyRecords: [],      // [{date, weight, bodyFat}]
    exerciseRecords: [],  // [{date, muscleTraining, cardio, hiit}]
    tasks: []             // [{id, name, status, date}]
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : defaults();
      // ensure tasks array exists (migration from old format)
      if (!data.tasks) data.tasks = [];
      return data;
    } catch { return defaults(); }
  };

  const save = (data) => {
    localStorage.setItem(KEY, JSON.stringify(data));
  };

  const uuid = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };

  // Body Records
  const getBody = (date) => load().bodyRecords.find(r => r.date === date);
  const setBody = (date, weight, bodyFat) => {
    const d = load();
    const i = d.bodyRecords.findIndex(r => r.date === date);
    const rec = { date, weight: +weight, bodyFat: +bodyFat };
    if (i >= 0) d.bodyRecords[i] = rec; else d.bodyRecords.push(rec);
    d.bodyRecords.sort((a, b) => a.date < b.date ? -1 : 1);
    save(d);
  };

  // Exercise Records
  const getExercise = (date) => load().exerciseRecords.find(r => r.date === date);
  const setExercise = (date, muscleTraining, cardio, hiit) => {
    const d = load();
    const i = d.exerciseRecords.findIndex(r => r.date === date);
    const rec = { date, muscleTraining: !!muscleTraining, cardio: !!cardio, hiit: !!hiit };
    if (i >= 0) d.exerciseRecords[i] = rec; else d.exerciseRecords.push(rec);
    save(d);
  };

  // Tasks
  const getTasks = () => load().tasks;
  const getTasksByStatus = (status) => load().tasks.filter(t => t.status === status);
  const getTasksByDate = (date) => load().tasks.filter(t => t.date === date && t.status === 'scheduled');
  const addTask = (name) => {
    const d = load();
    const task = { id: uuid(), name, status: 'idea', date: null };
    d.tasks.push(task);
    save(d);
    return task;
  };
  const updateTask = (id, patch) => {
    const d = load();
    const t = d.tasks.find(t => t.id === id);
    if (t) { Object.assign(t, patch); save(d); }
  };
  const deleteTask = (id) => {
    const d = load();
    d.tasks = d.tasks.filter(t => t.id !== id);
    save(d);
  };

  // All data (for export/import)
  const all = () => load();
  const replace = (data) => save(data);

  return { getBody, setBody, getExercise, setExercise,
           getTasks, getTasksByStatus, getTasksByDate,
           addTask, updateTask, deleteTask, all, replace };
})();
```

- [ ] **Step 2: ブラウザコンソールで動作確認**

ブラウザの DevTools Console で:
```js
DataManager.addTask('テストタスク');
DataManager.getTasks(); // [{id:..., name:'テストタスク', status:'idea', date:null}]
DataManager.setBody('2026-06-01', 68.5, 18.2);
DataManager.getBody('2026-06-01'); // {date:'2026-06-01', weight:68.5, bodyFat:18.2}
DataManager.setExercise('2026-06-01', true, false, false);
DataManager.getExercise('2026-06-01'); // {muscleTraining:true, cardio:false, hiit:false}
```

---

## Task 3: カレンダー（CSS + レンダリング）

**Files:**
- Modify: `index.html` — CSS に追加、JS に追加、HTMLを置き換え

- [ ] **Step 1: カレンダー用 CSS を `<style>` に追加**（既存 CSS の末尾に追記）

```css
/* === CALENDAR NAV & STATS BAR === */
.calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e0e0e0;
}
.calendar-nav h2 { font-size: 18px; font-weight: 600; }

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  flex-wrap: wrap;
}
.stat-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  background: white;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid #ddd;
  font-weight: 600;
}

/* === CALENDAR GRID ===
   KEY: no height:100vh, no overflow:hidden on parents.
   Cells use min-height only — they grow to fit content.
*/
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-left: 1px solid #e0e0e0;
  border-top: 1px solid #e0e0e0;
}

.cal-header-cell {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  padding: 8px;
  background: #f9f9f9;
  border-right: 1px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
}

.cal-cell {
  min-height: 100px;           /* grows taller if content overflows */
  border-right: 1px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
  padding: 6px;
  background: white;
  vertical-align: top;
  position: relative;
}

.cal-cell.today { background: #f0faf0; }
.cal-cell.empty { background: #fafafa; }

/* drop target highlight */
.cal-cell.drag-over { background: #e8f5e9; outline: 2px dashed #4caf50; }

.cal-day-num {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
  line-height: 1;
}
.cal-cell.today .cal-day-num {
  background: #4caf50;
  color: white;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.cal-exercise-icons {
  display: flex;
  gap: 2px;
  margin-bottom: 4px;
  font-size: 13px;
}

/* Task cards inside calendar cells */
.cal-task-chip {
  display: block;
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  color: #1565c0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
  cursor: grab;
}
.cal-task-chip:hover { background: #bbdefb; }
.cal-task-chip.dragging { opacity: 0.4; }

/* === DELETE ZONE === */
.delete-zone {
  margin: 16px;
  padding: 18px;
  border: 2px dashed #e57373;
  border-radius: 8px;
  text-align: center;
  color: #e57373;
  font-size: 13px;
  font-weight: 600;
  background: #fff5f5;
  transition: all 0.15s;
}
.delete-zone.drag-over {
  background: #ffcdd2;
  border-color: #f44336;
  color: #c62828;
}
```

- [ ] **Step 2: center-panel の HTML を置き換え**

`index.html` の `<main class="center-panel" id="centerPanel">` の内容を空にし、JS で動的生成に変更。代わりに、tracker tab の `<div class="tracker-body">` の**前**（tabs の直後）に monthNav と statsBar を追加:

```html
<!-- TRACKER TAB -->
<div id="tracker" class="tab-panel active">
  <!-- Month nav (outside tracker-body) -->
  <div class="calendar-nav" id="calendarNav">
    <button class="btn btn-secondary btn-sm" onclick="prevMonth()">← Prev</button>
    <h2 id="monthTitle">Loading...</h2>
    <button class="btn btn-secondary btn-sm" onclick="nextMonth()">Next →</button>
  </div>
  <!-- Stats bar -->
  <div class="stats-bar" id="statsBar"></div>

  <div class="tracker-body">
    <aside class="left-panel" id="leftPanel"></aside>
    <main class="center-panel" id="centerPanel">
      <div class="calendar-grid" id="calendarGrid"></div>
      <div class="delete-zone" id="deleteZone">🗑️ ここにドロップして削除</div>
    </main>
  </div>
</div>
```

- [ ] **Step 3: renderCalendar() を JS に追加**

`// Stubs` の前に追加:

```js
// ===== CALENDAR =====
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let draggedId = null;

const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
})();

function toDateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function renderCalendar() {
  const y = currentMonth.getFullYear();
  const m = currentMonth.getMonth();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const firstDow = new Date(y, m, 1).getDay(); // 0=Sun

  // Month title
  document.getElementById('monthTitle').textContent =
    currentMonth.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });

  // Calendar grid
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  // Headers
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(day => {
    const h = document.createElement('div');
    h.className = 'cal-header-cell';
    h.textContent = day;
    grid.appendChild(h);
  });

  // Empty cells before day 1
  for (let i = 0; i < firstDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    grid.appendChild(cell);
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateStr(y, m, day);
    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (dateStr === TODAY ? ' today' : '');
    cell.dataset.date = dateStr;

    // Day number
    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = day;
    cell.appendChild(num);

    // Exercise icons
    const ex = DataManager.getExercise(dateStr);
    const icons = [];
    if (ex?.muscleTraining) icons.push('💪');
    if (ex?.cardio)         icons.push('🏃');
    if (ex?.hiit)           icons.push('⚡');
    if (icons.length) {
      const iconRow = document.createElement('div');
      iconRow.className = 'cal-exercise-icons';
      iconRow.textContent = icons.join('');
      cell.appendChild(iconRow);
    }

    // Task chips
    DataManager.getTasksByDate(dateStr).forEach(task => {
      cell.appendChild(makeCalTaskChip(task));
    });

    // Drop events
    cell.addEventListener('dragover', e => {
      e.preventDefault();
      cell.classList.add('drag-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      if (!draggedId) return;
      DataManager.updateTask(draggedId, { status: 'scheduled', date: dateStr });
      draggedId = null;
      renderAll();
    });

    grid.appendChild(cell);
  }

  // Stats bar
  renderStatsBar(y, m, daysInMonth);
}

function makeCalTaskChip(task) {
  const chip = document.createElement('div');
  chip.className = 'cal-task-chip';
  chip.textContent = task.name;
  chip.draggable = true;
  chip.dataset.taskId = task.id;
  chip.addEventListener('dragstart', e => {
    draggedId = task.id;
    chip.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  return chip;
}

function renderStatsBar(y, m, daysInMonth) {
  const bar = document.getElementById('statsBar');
  bar.innerHTML = '';

  const counts = { muscle: 0, cardio: 0, hiit: 0, tasks: 0 };
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(y, m, d);
    const ex = DataManager.getExercise(dateStr);
    if (ex?.muscleTraining) counts.muscle++;
    if (ex?.cardio)         counts.cardio++;
    if (ex?.hiit)           counts.hiit++;
    counts.tasks += DataManager.getTasksByDate(dateStr).length;
  }

  const chips = [
    ['💪', counts.muscle],
    ['🏃', counts.cardio],
    ['⚡', counts.hiit],
    ['✅', counts.tasks],
  ];
  chips.forEach(([icon, count]) => {
    const chip = document.createElement('div');
    chip.className = 'stat-chip';
    chip.textContent = `${icon} ${count}`;
    bar.appendChild(chip);
  });
}

// Delete zone
document.getElementById('deleteZone').addEventListener('dragover', e => {
  e.preventDefault();
  document.getElementById('deleteZone').classList.add('drag-over');
});
document.getElementById('deleteZone').addEventListener('dragleave', () => {
  document.getElementById('deleteZone').classList.remove('drag-over');
});
document.getElementById('deleteZone').addEventListener('drop', e => {
  e.preventDefault();
  document.getElementById('deleteZone').classList.remove('drag-over');
  if (!draggedId) return;
  DataManager.deleteTask(draggedId);
  draggedId = null;
  renderAll();
});

function prevMonth() {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
}
function nextMonth() {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
}
```

- [ ] **Step 4: ブラウザで確認**

```bash
open /Users/moromizatomasaru/health-tracker/index.html
```

確認:
- 今月のカレンダーが全日表示される（Sun〜Sat × 5〜6週）
- 今日の日付が緑の丸でハイライトされる
- Prev/Next でカレンダーが切り替わる
- 統計バーに「💪 0 🏃 0 ⚡ 0 ✅ 0」が表示される

---

## Task 4: タスク管理パネル（左パネル上部）

**Files:**
- Modify: `index.html` — CSS に追加、JS に追加、leftPanel を動的レンダリング

- [ ] **Step 1: タスクパネル用 CSS を追加**

```css
/* === TASK PANEL === */
.task-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #888;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 2px solid #e0e0e0;
}

.task-input-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.task-input-row input { flex: 1; }
.task-input-row button { flex-shrink: 0; padding: 8px 10px; }

.task-pool {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 20px;  /* so empty column is visible */
}

.task-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-left: 4px solid #4caf50;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  cursor: grab;
  transition: box-shadow 0.15s;
  word-break: break-word;
}
.task-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.task-card.dragging { opacity: 0.4; cursor: grabbing; }
.task-card.scheduled { border-left-color: #2196f3; }
.task-card.completed { border-left-color: #9e9e9e; opacity: 0.7; }

.panel-divider {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 8px 0;
}
```

- [ ] **Step 2: renderTaskPanel() を JS に追加**

```js
// ===== TASK PANEL =====
function renderTaskPanel() {
  const panel = document.getElementById('leftPanel');

  // Only re-render task section (records section is rendered separately)
  let taskSection = document.getElementById('taskSection');
  if (!taskSection) {
    taskSection = document.createElement('div');
    taskSection.id = 'taskSection';
    panel.prepend(taskSection);
  }

  const idea      = DataManager.getTasksByStatus('idea');
  const scheduled = DataManager.getTasksByStatus('scheduled');
  const completed = DataManager.getTasksByStatus('completed');

  taskSection.innerHTML = `
    <div class="task-section-title">💡 Idea</div>
    <div class="task-input-row">
      <input type="text" id="taskNameInput" placeholder="新しいタスク...">
      <button class="btn btn-primary btn-sm" onclick="handleAddTask()">+</button>
    </div>
    <div class="task-pool" id="ideaPool"></div>

    <hr class="panel-divider">
    <div class="task-section-title">📅 Scheduled</div>
    <div class="task-pool" id="scheduledPool"></div>

    <hr class="panel-divider">
    <div class="task-section-title">✅ Completed</div>
    <div class="task-pool" id="completedPool"></div>

    <hr class="panel-divider">
  `;

  // Populate
  idea.forEach(t => document.getElementById('ideaPool').appendChild(makeTaskCard(t)));
  scheduled.forEach(t => document.getElementById('scheduledPool').appendChild(makeTaskCard(t)));
  completed.forEach(t => document.getElementById('completedPool').appendChild(makeTaskCard(t)));

  // Enter key on input
  document.getElementById('taskNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddTask();
  });
}

function makeTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card ${task.status !== 'idea' ? task.status : ''}`;
  card.textContent = task.name;
  card.draggable = true;
  card.dataset.taskId = task.id;
  card.addEventListener('dragstart', e => {
    draggedId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

function handleAddTask() {
  const input = document.getElementById('taskNameInput');
  const name = input.value.trim();
  if (!name) return;
  DataManager.addTask(name);
  input.value = '';
  renderAll();
}
```

- [ ] **Step 3: ブラウザで確認**

```bash
open /Users/moromizatomasaru/health-tracker/index.html
```

確認:
- 左パネルに「💡 IDEA」「📅 SCHEDULED」「✅ COMPLETED」の3セクション表示
- 入力フォームにテキスト入力 → `+` ボタン or Enter → Idea に追加される
- Idea のカードをカレンダーの日付にドラッグ&ドロップ → Scheduled に移動・カレンダーにタグ表示
- 削除ゾーンにドロップ → タスクが消える

---

## Task 5: 記録パネル（左パネル下部）

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 記録パネル用 CSS を追加**

```css
/* === RECORDS PANEL === */
.records-panel { display: flex; flex-direction: column; gap: 12px; }

.exercise-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.ex-btn {
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  text-align: left;
}
.ex-btn.active {
  border-color: #4caf50;
  background: #e8f5e9;
  color: #2d7a1f;
}

.streak-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.streak-chip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 12px;
}
.streak-chip strong { font-size: 18px; color: #2d7a1f; }
```

- [ ] **Step 2: renderRecordsPanel() を JS に追加**

```js
// ===== RECORDS PANEL =====
function renderRecordsPanel() {
  const panel = document.getElementById('leftPanel');

  let recSection = document.getElementById('recordsSection');
  if (!recSection) {
    recSection = document.createElement('div');
    recSection.id = 'recordsSection';
    panel.appendChild(recSection);
  }

  const dateVal = document.getElementById('recordDate')?.value || TODAY;
  const body = DataManager.getBody(dateVal) || {};
  const ex   = DataManager.getExercise(dateVal) || {};

  recSection.innerHTML = `
    <div class="records-panel">
      <div class="form-group">
        <label>📅 日付</label>
        <input type="date" id="recordDate" value="${dateVal}">
      </div>
      <div class="form-group">
        <label>⚖️ 体重 (kg)</label>
        <input type="number" id="weightInput" step="0.1" placeholder="68.5" value="${body.weight ?? ''}">
      </div>
      <div class="form-group">
        <label>📊 体脂肪 (%)</label>
        <input type="number" id="bodyFatInput" step="0.1" placeholder="18.2" value="${body.bodyFat ?? ''}">
      </div>
      <button class="btn btn-primary" onclick="handleSaveBody()" style="width:100%">💾 保存</button>

      <div class="form-group">
        <label>🏃 運動記録</label>
        <div class="exercise-grid">
          <button class="ex-btn ${ex.muscleTraining ? 'active' : ''}"
                  data-ex="muscleTraining" onclick="handleToggleEx(this)">
            💪 筋トレ
          </button>
          <button class="ex-btn ${ex.cardio ? 'active' : ''}"
                  data-ex="cardio" onclick="handleToggleEx(this)">
            🏃 有酸素
          </button>
          <button class="ex-btn ${ex.hiit ? 'active' : ''}"
                  data-ex="hiit" onclick="handleToggleEx(this)">
            ⚡ HIIT
          </button>
        </div>
      </div>

      <div class="streak-row" id="streakRow"></div>
    </div>
  `;

  // Update streaks
  renderStreaks();

  // Re-bind date change
  document.getElementById('recordDate').addEventListener('change', () => {
    renderRecordsPanel();
    renderCalendar();
  });
}

function handleSaveBody() {
  const date   = document.getElementById('recordDate').value || TODAY;
  const weight = document.getElementById('weightInput').value;
  const bf     = document.getElementById('bodyFatInput').value;
  if (!weight || !bf) { alert('体重と体脂肪率を入力してください'); return; }
  DataManager.setBody(date, +weight, +bf);
  renderAll();
}

function handleToggleEx(btn) {
  const date = document.getElementById('recordDate').value || TODAY;
  const ex   = DataManager.getExercise(date) || { muscleTraining: false, cardio: false, hiit: false };
  const key  = btn.dataset.ex;
  ex[key] = !ex[key];
  DataManager.setExercise(date, ex.muscleTraining, ex.cardio, ex.hiit);
  renderAll();
}

function renderStreaks() {
  const row = document.getElementById('streakRow');
  if (!row) return;

  const calcStreak = (checkFn) => {
    let streak = 0;
    const d = new Date(TODAY);
    while (true) {
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (checkFn(ds)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  };

  const streaks = [
    ['💪', '筋トレ', calcStreak(ds => DataManager.getExercise(ds)?.muscleTraining)],
    ['🏃', '有酸素', calcStreak(ds => DataManager.getExercise(ds)?.cardio)],
    ['⚡', 'HIIT',   calcStreak(ds => DataManager.getExercise(ds)?.hiit)],
    ['✅', 'タスク',  calcStreak(ds => DataManager.getTasksByDate(ds).length > 0)],
  ];

  row.innerHTML = streaks.map(([icon, label, n]) => `
    <div class="streak-chip">
      <span>${icon} ${label}</span>
      <strong>${n}</strong>
    </div>
  `).join('');
}
```

- [ ] **Step 3: renderAll() を定義して初期化**

```js
// ===== MAIN RENDER & INIT =====
function renderAll() {
  renderTaskPanel();
  renderRecordsPanel();
  renderCalendar();
}

// Initialize
renderAll();
```

既存の `// Stubs` セクションを削除し、このブロックで置き換える。

- [ ] **Step 4: ブラウザで確認**

確認:
- 左パネル下部に日付・体重・体脂肪入力フォームと運動トグル3つが表示される
- 体重/体脂肪を入力して保存 → ストリーク欄が更新される
- 筋トレボタンをクリック → 緑にハイライト → カレンダーに 💪 アイコン表示
- 別の日付を選択 → その日のデータが自動でフォームに表示される

---

## Task 6: Dashboard タブ

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Dashboard HTML を追加（既存のプレースホルダーを置き換え）**

```html
<!-- DASHBOARD TAB -->
<div id="dashboard" class="tab-panel">
  <div style="padding: 24px; max-width: 900px; margin: 0 auto;">
    <div style="display:flex;gap:10px;margin-bottom:28px;justify-content:center;">
      <button class="btn btn-sm period-btn active" data-period="30" onclick="setPeriod(30,this)">直近30日</button>
      <button class="btn btn-sm period-btn" data-period="90" onclick="setPeriod(90,this)">直近90日</button>
      <button class="btn btn-sm period-btn" data-period="0" onclick="setPeriod(0,this)">全期間</button>
    </div>
    <h3 style="margin-bottom:12px;">⚖️ 体重推移</h3>
    <div style="position:relative;height:260px;margin-bottom:36px;"><canvas id="weightChart"></canvas></div>
    <h3 style="margin-bottom:12px;">📊 体脂肪率推移</h3>
    <div style="position:relative;height:260px;margin-bottom:36px;"><canvas id="bfChart"></canvas></div>
    <h3 style="margin-bottom:12px;">💪 筋トレ月別達成率</h3>
    <div style="position:relative;height:220px;margin-bottom:36px;"><canvas id="muscleChart"></canvas></div>
    <h3 style="margin-bottom:12px;">🏃 有酸素月別達成率</h3>
    <div style="position:relative;height:220px;margin-bottom:36px;"><canvas id="cardioChart"></canvas></div>
    <h3 style="margin-bottom:12px;">⚡ HIIT月別達成率</h3>
    <div style="position:relative;height:220px;margin-bottom:36px;"><canvas id="hiitChart"></canvas></div>
  </div>
</div>
```

CSS を追加:
```css
.period-btn { border: 2px solid #ddd; background: white; color: #333; }
.period-btn.active { border-color: #4caf50; background: #4caf50; color: white; }
```

- [ ] **Step 2: renderCharts() を実装**

既存の `function renderCharts() {}` スタブを以下で置き換え:

```js
let activePeriod = 30;
let charts = {};

function setPeriod(days, btn) {
  activePeriod = days;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCharts();
}

function renderCharts() {
  const data = DataManager.all();
  const cutoff = activePeriod === 0 ? null : (() => {
    const d = new Date(TODAY); d.setDate(d.getDate() - activePeriod); return d.toISOString().slice(0,10);
  })();

  const body = data.bodyRecords.filter(r => !cutoff || r.date >= cutoff);
  const ex   = data.exerciseRecords.filter(r => !cutoff || r.date >= cutoff);

  destroyChart('weightChart');
  destroyChart('bfChart');
  destroyChart('muscleChart');
  destroyChart('cardioChart');
  destroyChart('hiitChart');

  // Line charts
  if (body.length) {
    charts.weight = new Chart(document.getElementById('weightChart'), {
      type: 'line',
      data: {
        labels: body.map(r => r.date),
        datasets: [{ label: '体重 (kg)', data: body.map(r => r.weight),
          borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', tension: 0.4, fill: true }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    charts.bf = new Chart(document.getElementById('bfChart'), {
      type: 'line',
      data: {
        labels: body.map(r => r.date),
        datasets: [{ label: '体脂肪率 (%)', data: body.map(r => r.bodyFat),
          borderColor: '#ff9800', backgroundColor: 'rgba(255,152,0,0.1)', tension: 0.4, fill: true }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  // Bar charts (monthly %)
  [['muscleChart', 'muscleTraining'], ['cardioChart', 'cardio'], ['hiitChart', 'hiit']].forEach(([id, key]) => {
    const monthly = {};
    ex.forEach(r => {
      const ym = r.date.slice(0, 7);
      if (!monthly[ym]) monthly[ym] = { done: 0, days: new Date(r.date.slice(0,4), +r.date.slice(5,7), 0).getDate() };
      if (r[key]) monthly[ym].done++;
    });
    const labels = Object.keys(monthly).sort();
    const vals   = labels.map(ym => Math.round(monthly[ym].done / monthly[ym].days * 100));
    charts[id] = new Chart(document.getElementById(id), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: '達成率 (%)', data: vals, backgroundColor: '#4caf50', borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 100 } }
      }
    });
  });
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
```

- [ ] **Step 3: ブラウザで確認**

確認:
- Dashboard タブをクリック → グラフエリアが表示される
- 体重・体脂肪データを数日分入力後 → グラフに折れ線が表示される
- 期間ボタン（30日/90日/全期間）で切り替え可能

---

## Task 7: Export / Import

**Files:**
- Modify: `index.html`

- [ ] **Step 1: exportData() / importData() を実装**

既存の `function exportData()` / `function importData()` スタブを以下で置き換え:

```js
function exportData() {
  const json = JSON.stringify(DataManager.all(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `health-tracker-${TODAY}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported.bodyRecords) ||
          !Array.isArray(imported.exerciseRecords) ||
          !Array.isArray(imported.tasks)) {
        alert('不正なデータ形式です');
        return;
      }
      const cur = DataManager.all();
      // Merge body records
      imported.bodyRecords.forEach(r => {
        const i = cur.bodyRecords.findIndex(b => b.date === r.date);
        if (i >= 0) cur.bodyRecords[i] = r; else cur.bodyRecords.push(r);
      });
      // Merge exercise records
      imported.exerciseRecords.forEach(r => {
        const i = cur.exerciseRecords.findIndex(b => b.date === r.date);
        if (i >= 0) cur.exerciseRecords[i] = r; else cur.exerciseRecords.push(r);
      });
      // Merge tasks (by id)
      imported.tasks.forEach(t => {
        const i = cur.tasks.findIndex(b => b.id === t.id);
        if (i >= 0) cur.tasks[i] = t; else cur.tasks.push(t);
      });
      DataManager.replace(cur);
      renderAll();
      alert('インポート完了！');
    } catch {
      alert('ファイルの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
```

- [ ] **Step 2: 最終動作確認**

```bash
open /Users/moromizatomasaru/health-tracker/index.html
```

以下をすべて確認:
1. タスク追加 → Idea に表示
2. タスクをカレンダーにドラッグ → セルに表示・Scheduled に移動
3. カレンダーのタスクを削除ゾーンへドラッグ → 削除
4. 体重・体脂肪を入力して保存 → カレンダーを別月に移動→戻っても消えない（localStorage確認）
5. 運動ボタンをトグル → カレンダーにアイコン表示
6. 統計バーの数字が正しく更新される
7. Dashboard でグラフ表示
8. Export → JSON ダウンロード
9. ページリロード → データ保持
