// Supabase → Obsidian の逆方向取り込み用マージ（純関数）。
// 方針: Obsidian を正とし、既存行は一切書き換えない。
// Supabase にあってローカルの markdown テーブルに無い行だけを、日付順に挿入する。
//
// 加えて、両側に同じ日があって値が食い違う場合は conflicts として報告する
// （自動では直さない。どちらを採るかは人が決める）。

// "| a | b | c |" → ["a","b","c"]
function cellsOf(line) {
  const s = line.trim();
  return s.slice(1, s.endsWith('|') ? -1 : undefined)
          .split('|')
          .map(c => c.trim());
}

// 先頭の markdown テーブルのデータ行範囲 [start, end) を返す（ヘッダ・区切りは除外）。
function locateTable(lines) {
  const headerIdx = lines.findIndex(
    l => l.trim().startsWith('|') && l.includes('日付')
  );
  if (headerIdx === -1) return null;
  const start = headerIdx + 2; // ヘッダ + 区切り の次
  let end = start;
  while (end < lines.length && lines[end].trim().startsWith('|')) end++;
  return { start, end };
}

export function formatBodyRow(r) {
  return `| ${r.date} | ${r.weight ?? ''} | ${r.body_fat ?? ''} | |`;
}

export function formatSleepRow(r) {
  return `| ${r.date} | ${r.hours ?? ''} | ${r.night_hours ?? ''} | ${r.nap_hours ?? ''} | |`;
}

export function formatExerciseRow(r) {
  return `| ${r.date} | ${r.type} | ${r.detail ?? ''} | |`;
}

// 既存テーブルの並び方向を推定する。health.py が書き込みのたびに降順へ整列するため
// 実データは降順だが、判定できるならファイルの実際の並びに従う（毎回の反転を避ける）。
function isDescending(dataLines) {
  const dates = dataLines.map(l => cellsOf(l)[0]).filter(Boolean);
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] < dates[i - 1]) return true;
    if (dates[i] > dates[i - 1]) return false;
  }
  return true; // 行が足りず判定できないときは health.py に合わせる
}

// "72.5" / "" / undefined を数値または null に正規化する（表記の揺れで誤検出しないため）。
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// 両側にある行の食い違いを列挙する。
// Web 側が空（null）の項目は「未入力」であって食い違いではないので数えない。
function diffFields(cells, row, fields) {
  const diffs = [];
  for (const f of fields) {
    const remote = f.remote(row);
    if (remote === null) continue;
    const local = f.local(cells);
    if (local !== remote) diffs.push({ label: f.label, local, remote });
  }
  return diffs;
}

// 共通のマージ本体。keyOfRow / keyOfCells で「同一行か」を判定し、
// 無いものだけを formatRow で整形して日付順に差し込む。
// 既に両側にある行は書き換えず、値が違えば conflicts に積む。
function mergeTable(markdown, rows, { keyOfCells, keyOfRow, formatRow, fields, labelOfRow }) {
  const lines = markdown.split('\n');
  const t = locateTable(lines);
  if (!t) return { markdown, added: [], conflicts: [] };

  const dataLines = lines.slice(t.start, t.end);
  const existing = new Map();
  for (const l of dataLines) {
    const cells = cellsOf(l);
    const key = keyOfCells(cells);
    if (!existing.has(key)) existing.set(key, cells); // 重複行は先頭を正とする
  }

  const conflicts = [];
  for (const r of rows) {
    if (!r.date) continue;
    const cells = existing.get(keyOfRow(r));
    if (!cells) continue; // ローカルに無い行は下の missing 側で追加される
    const diffs = diffFields(cells, r, fields);
    if (diffs.length) conflicts.push({ date: r.date, key: labelOfRow(r), diffs });
  }

  const missing = rows
    .filter(r => r.date && !existing.has(keyOfRow(r)))
    .map(r => ({ date: r.date, raw: formatRow(r) }));

  if (!missing.length) return { markdown, added: [], conflicts };

  // 既存行は raw のまま温存し、欠けている行だけ追加して日付順に安定ソート。
  // 並び方向は既存テーブルに合わせる（実データは health.py と同じ降順）。
  const desc = isDescending(dataLines);
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const merged = [
    ...dataLines.map(raw => ({ date: cellsOf(raw)[0], raw })),
    ...missing,
  ]
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => (desc ? byDate(b, a) : byDate(a, b)) || a.i - b.i)
    .map(x => x.raw);

  const out = [...lines.slice(0, t.start), ...merged, ...lines.slice(t.end)];
  return { markdown: out.join('\n'), added: missing.map(m => m.raw), conflicts };
}

export function mergeBody(markdown, rows) {
  return mergeTable(markdown, rows, {
    keyOfCells: c => c[0],
    keyOfRow: r => r.date,
    formatRow: formatBodyRow,
    labelOfRow: r => r.date,
    fields: [
      { label: '体重', local: c => num(c[1]), remote: r => num(r.weight) },
      { label: '体脂肪', local: c => num(c[2]), remote: r => num(r.body_fat) },
    ],
  });
}

export function mergeSleep(markdown, rows) {
  return mergeTable(markdown, rows, {
    keyOfCells: c => c[0],
    keyOfRow: r => r.date,
    formatRow: formatSleepRow,
    labelOfRow: r => r.date,
    fields: [
      { label: '合計', local: c => num(c[1]), remote: r => num(r.hours) },
      { label: '夜', local: c => num(c[2]), remote: r => num(r.night_hours) },
      { label: '昼', local: c => num(c[3]), remote: r => num(r.nap_hours) },
    ],
  });
}

export function mergeExercise(markdown, rows) {
  return mergeTable(markdown, rows, {
    keyOfCells: c => `${c[0]}|${c[1]}`,
    keyOfRow: r => `${r.date}|${r.type}`,
    formatRow: formatExerciseRow,
    labelOfRow: r => `${r.date} ${r.type}`,
    fields: [{ label: '詳細', local: c => str(c[2]), remote: r => str(r.detail) }],
  });
}
