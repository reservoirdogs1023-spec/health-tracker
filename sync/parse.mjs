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

// 睡眠は 合計 / 夜 / 昼 の3値。夜・昼は内訳を記録していない日は null。
export function parseSleep(markdown) {
  return tableRows(markdown).map(cells => ({
    date: cells[0],
    hours: num(cells[1]),
    night_hours: num(cells[2]),
    nap_hours: num(cells[3]),
  }));
}

export function parseExercise(markdown) {
  const map = new Map(); // key: `${date}|${type}`
  for (const cells of tableRows(markdown)) {
    const date = cells[0];
    const type = cells[1];
    const detail = cells[2];
    if (!date || !type) continue;
    const key = `${date}|${type}`;
    if (!map.has(key)) map.set(key, { date, type, details: [] });
    if (detail) map.get(key).details.push(detail);
  }
  return [...map.values()].map(({ date, type, details }) => ({
    date,
    type,
    detail: details.length ? details.join(' / ') : null,
  }));
}

// Apple Health のワークアウトは1回ごとに保持する。同日・同時刻・同種目でも集約しない。
export function parseWorkout(markdown) {
  return tableRows(markdown)
    .map(cells => ({
      date: cells[0],
      time: cells[1],
      species: cells[2],
      duration_minutes: num(cells[3]),
      distance_km: num(cells[4]),
      calories_kcal: num(cells[5]),
    }))
    .filter(row => row.date && row.time && ['Walking', 'Running', 'Cycling'].includes(row.species));
}

// Markdown に Apple Health の UUID は載せないため、時刻・種目ごとの出現順で安定キーを作る。
// 値（距離など）はキーに含めず、再取り込みで補正されたとき同じ行を更新できるようにする。
export function addWorkoutRecordKeys(rows) {
  const counts = new Map();
  return rows.map(row => {
    const base = `${row.date}T${row.time}|${row.species}`;
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    return { ...row, record_key: `${base}|${occurrence}` };
  });
}
