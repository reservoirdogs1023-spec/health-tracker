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
