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
