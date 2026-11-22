// Converts rows of the Notion health databases into the Web record format
// accepted by public.health_web_mirror. Pure functions only (no I/O).

export type Category = 'body' | 'sleep' | 'exercise' | 'workout' | 'vo2';

export interface MirrorRecord {
  category: Category;
  key: string;
  payload: Record<string, string | number | null>;
}

// Minimal shape of a Notion API page property we read.
export type NotionProperty =
  | { type: 'title'; title: { plain_text: string }[] }
  | { type: 'rich_text'; rich_text: { plain_text: string }[] }
  | { type: 'number'; number: number | null }
  | { type: 'select'; select: { name: string } | null }
  | { type: 'date'; date: { start: string } | null }
  | { type: string; [key: string]: unknown };

export interface NotionPage {
  id: string;
  properties: Record<string, NotionProperty>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WORKOUT_SPECIES = new Set(['Walking', 'Running', 'Cycling']);

function text(page: NotionPage, name: string): string {
  const p = page.properties[name];
  if (!p) return '';
  if (p.type === 'title') return (p as { title: { plain_text: string }[] }).title.map(t => t.plain_text).join('');
  if (p.type === 'rich_text') return (p as { rich_text: { plain_text: string }[] }).rich_text.map(t => t.plain_text).join('');
  return '';
}

function num(page: NotionPage, name: string): number | null {
  const p = page.properties[name];
  if (!p || p.type !== 'number') return null;
  const n = (p as { number: number | null }).number;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function select(page: NotionPage, name: string): string {
  const p = page.properties[name];
  if (!p || p.type !== 'select') return '';
  return (p as { select: { name: string } | null }).select?.name ?? '';
}

function dateStart(page: NotionPage, name: string): string {
  const p = page.properties[name];
  if (!p || p.type !== 'date') return '';
  return (p as { date: { start: string } | null }).date?.start ?? '';
}

// Date column first, title (YYYY-MM-DD) as fallback.
function dayOf(page: NotionPage, dateColumn: string): string | null {
  const d = dateStart(page, dateColumn).slice(0, 10) || text(page, '日付').trim();
  return DATE.test(d) ? d : null;
}

// Notion datetimes carry an offset; the Web stores Japan local date and time.
export function toJst(iso: string): { date: string; time: string } | null {
  const ms = Date.parse(iso);
  if (!/T\d{2}:\d{2}/.test(iso) || Number.isNaN(ms)) return null;
  const jst = new Date(ms + 9 * 3600_000).toISOString();
  return { date: jst.slice(0, 10), time: jst.slice(11, 19) };
}

export function mapBody(page: NotionPage): MirrorRecord | null {
  const date = dayOf(page, '測定日');
  const weight = num(page, '体重(kg)');
  const bodyFat = num(page, '体脂肪率(%)');
  if (!date || (weight === null && bodyFat === null)) return null;
  return { category: 'body', key: date, payload: { date, weight, bodyFat } };
}

export function mapSleep(page: NotionPage): MirrorRecord | null {
  const date = dayOf(page, '記録日');
  let night = num(page, '夜(h)');
  let nap = num(page, '昼(h)');
  if (night !== null && nap === null) nap = 0;
  if (nap !== null && night === null) night = 0;
  const hours = num(page, '合計(h)') ?? (night !== null && nap !== null ? night + nap : null);
  if (!date || hours === null) return null;
  return { category: 'sleep', key: date, payload: { date, hours, nightHours: night, napHours: nap } };
}

// Web keeps one row per day and exercise type ("スクワット", "RUN", "WALKING", ...):
// the first word of the Notion title.
export function mapExercise(page: NotionPage): MirrorRecord | null {
  const date = dayOf(page, '日付');
  const type = text(page, '内容').trim().split(/\s+/)[0] ?? '';
  if (!date || type.length < 1 || type.length > 80) return null;
  return { category: 'exercise', key: `${date}|${type}`, payload: { date, type } };
}

export function mapVo2(page: NotionPage): MirrorRecord | null {
  const date = dayOf(page, '測定日');
  const value = num(page, 'VO2max');
  if (!date || value === null || value <= 0 || value >= 200) return null;
  const source = text(page, '出典').includes('ワークアウト日誌') ? 'journal' : 'export';
  return { category: 'vo2', key: date, payload: { date, value, source } };
}

// Workouts need an occurrence counter, so they are mapped as a list.
export function mapWorkouts(pages: NotionPage[]): MirrorRecord[] {
  const seen = new Map<string, number>();
  const rows = pages.flatMap(page => {
    const species = select(page, '種目');
    const at = toJst(dateStart(page, '日時'));
    if (!at || !WORKOUT_SPECIES.has(species)) return [];
    return [{ page, species, ...at }];
  }).sort((a, b) => `${a.date}T${a.time}|${a.species}|${a.page.id}`.localeCompare(`${b.date}T${b.time}|${b.species}|${b.page.id}`));
  return rows.map(({ page, species, date, time }) => {
    const base = `${date}T${time}|${species}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const recordKey = `${base}|${n}`;
    return {
      category: 'workout' as const,
      key: recordKey,
      payload: {
        recordKey, date, time, species,
        durationMinutes: num(page, '時間(分)'),
        distanceKm: num(page, '距離(km)'),
        caloriesKcal: num(page, 'kcal'),
      },
    };
  });
}

// Duplicate keys inside one category keep the first row (Notion order) and are counted.
export function buildSnapshot(input: Record<Category, NotionPage[]>): { records: MirrorRecord[]; skipped: number; duplicates: number } {
  const mapped: (MirrorRecord | null)[] = [
    ...input.body.map(mapBody),
    ...input.sleep.map(mapSleep),
    ...input.exercise.map(mapExercise),
    ...input.vo2.map(mapVo2),
  ];
  const workouts = mapWorkouts(input.workout);
  const skipped = mapped.filter(r => r === null).length + (input.workout.length - workouts.length);
  const byKey = new Map<string, MirrorRecord>();
  let duplicates = 0;
  for (const r of [...mapped, ...workouts]) {
    if (!r) continue;
    const k = `${r.category}|${r.key}`;
    if (byKey.has(k)) { duplicates++; continue; }
    byKey.set(k, r);
  }
  return { records: [...byKey.values()], skipped, duplicates };
}
