import type { WorkoutRecord } from './health-types.ts';
import type { Vo2Record } from './vo2-api.ts';

export type RunPeriod = 'week' | 'month' | 'year';
export type RunMilestone = {
  id: string;
  date: string;
  label: string;
  kind: 'first-run' | 'first-duration' | 'first-distance' | 'best-duration' | 'best-distance' | 'best-pace' | 'best-vo2' | 'cumulative-distance';
};
type RunTotals = { durationMinutes: number | null; distanceKm: number | null; pace: number | null };
export type RunBucket = RunTotals & { key: string; label: string };
const DAY = 86_400_000;
const dateString = (date: Date) => date.toISOString().slice(0, 10);
const parseDate = (value: string) => new Date(`${value}T00:00:00Z`);
const presentSum = (values: Array<number | null>) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
};
const eligible = (record: WorkoutRecord) => record.distanceKm !== null && record.distanceKm >= 2
  && record.durationMinutes !== null && record.durationMinutes > 0;
function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parseDate(value).getTime()) && dateString(parseDate(value)) === value;
}
const validMetric = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0 ? value : null;
function summarize(records: WorkoutRecord[]): RunTotals {
  if (!records.length) return { durationMinutes: 0, distanceKm: 0, pace: null };
  const paced = records.filter(eligible);
  return {
    durationMinutes: presentSum(records.map(record => record.durationMinutes)),
    distanceKm: presentSum(records.map(record => record.distanceKm)),
    pace: paced.length ? presentSum(paced.map(record => record.durationMinutes))! / presentSum(paced.map(record => record.distanceKm))! : null,
  };
}

export function buildRunPage(workout: WorkoutRecord[], period: RunPeriod, date: string, vo2: Vo2Record[] = []) {
  const anchor = parseDate(date);
  const start = new Date(anchor);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  else start.setUTCDate(1);
  if (period === 'year') start.setUTCMonth(0);
  const end = period === 'week' ? new Date(start.getTime() + 6 * DAY)
    : new Date(Date.UTC(start.getUTCFullYear(), period === 'year' ? 12 : start.getUTCMonth() + 1, 0));
  const records = workout.filter(record => record.species === 'Running' && isCalendarDate(record.date))
    .map(record => ({ ...record, durationMinutes: validMetric(record.durationMinutes), distanceKm: validMetric(record.distanceKm) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || a.recordKey.localeCompare(b.recordKey));
  const selected = records.filter(record => record.date >= dateString(start) && record.date <= dateString(end));
  const buckets: RunBucket[] = Array.from({ length: period === 'year' ? 12 : Math.round((end.getTime() - start.getTime()) / DAY) + 1 }, (_, index) => {
    const day = period === 'year' ? new Date(Date.UTC(start.getUTCFullYear(), index, 1)) : new Date(start.getTime() + index * DAY);
    const key = dateString(day).slice(0, period === 'year' ? 7 : 10);
    return { key, label: period === 'year' ? `${index + 1}月` : String(day.getUTCDate()), ...summarize(selected.filter(record => record.date.startsWith(key))) };
  });
  const paceRecords = records.filter(eligible).sort((a, b) => a.durationMinutes! / a.distanceKm! - b.durationMinutes! / b.distanceKm!);
  const totals = summarize(selected);
  const goals = period === 'week' ? { durationMinutes: 80, distanceKm: 9 }
    : period === 'month' ? { durationMinutes: 300, distanceKm: 35 }
    : start.getUTCFullYear() === 2026 ? { durationMinutes: 900, distanceKm: 100 }
    : { durationMinutes: 3600, distanceKm: 400 };
  const progress = (value: number | null, target: number) => value === null ? null : Math.min(100, value * 100 / target);
  const best = (field: 'durationMinutes' | 'distanceKm') => {
    const sorted = records.filter(record => record[field] !== null).sort((a, b) => b[field]! - a[field]!);
    return sorted.length ? { value: sorted[0][field]!, date: sorted[0].date } : null;
  };
  const milestones: RunMilestone[] = [];
  const add = (record: WorkoutRecord, kind: RunMilestone['kind'], label: string, suffix = '') => {
    milestones.push({ id: `${record.recordKey}|${kind}|${suffix}`, date: record.date, label, kind });
  };
  let cumulative = 0;
  let longestDistance: number | null = null;
  let longestDuration: number | null = null;
  let fastestPace: number | null = null;
  const reached = new Set<number>();
  const durationsReached = new Set<number>();
  const distancesReached = new Set<number>();
  const chronological = [...records].reverse();
  for (const [index, record] of chronological.entries()) {
    if (index === 0) add(record, 'first-run', '記録上の初めてのラン');
    for (const minutes of [30, 40, 60]) {
      if (record.durationMinutes !== null && record.durationMinutes >= minutes && !durationsReached.has(minutes)) {
        add(record, 'first-duration', `初めて${minutes}分走った`, String(minutes));
        durationsReached.add(minutes);
      }
    }
    for (const km of [5, 10]) {
      if (record.distanceKm !== null && record.distanceKm >= km && !distancesReached.has(km)) {
        add(record, 'first-distance', `初めて${km}km走った`, String(km));
        distancesReached.add(km);
      }
    }
    if (record.distanceKm !== null) {
      if (longestDistance !== null && record.distanceKm > longestDistance + 1e-9) add(record, 'best-distance', '最長距離を更新');
      longestDistance = Math.max(longestDistance ?? record.distanceKm, record.distanceKm);
    }
    if (record.durationMinutes !== null) {
      if (longestDuration !== null && record.durationMinutes > longestDuration + 1e-9) add(record, 'best-duration', '最長時間を更新');
      longestDuration = Math.max(longestDuration ?? record.durationMinutes, record.durationMinutes);
    }
    if (eligible(record)) {
      const pace = record.durationMinutes! / record.distanceKm!;
      if (fastestPace !== null && pace < fastestPace - 1e-9) add(record, 'best-pace', '最速ペースを更新');
      fastestPace = Math.min(fastestPace ?? pace, pace);
    }
    cumulative += record.distanceKm ?? 0;
    for (const threshold of [5, 10, 20, 30, 50, 100]) {
      if (cumulative + 1e-9 >= threshold && !reached.has(threshold)) {
        add(record, 'cumulative-distance', `累計${threshold}km`, String(threshold));
        reached.add(threshold);
      }
    }
  }
  let highestVo2: number | null = null;
  const vo2Chronological = [...vo2]
    .filter(record => isCalendarDate(record.date) && Number.isFinite(record.value) && record.value > 0 && record.value < 200)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const record of vo2Chronological) {
    if (highestVo2 !== null && record.value - highestVo2 >= 0.5 - 1e-9) {
      milestones.push({ id: `vo2|${record.date}`, date: record.date, label: 'VO2maxの最高値を更新', kind: 'best-vo2' });
    }
    // Small rises remain part of the observed high, even when no milestone is emitted.
    highestVo2 = Math.max(highestVo2 ?? record.value, record.value);
  }
  milestones.sort((a, b) => b.date.localeCompare(a.date));
  return {
    records, milestones,
    goals, progress: { time: progress(totals.durationMinutes, goals.durationMinutes), distance: progress(totals.distanceKm, goals.distanceKm) },
    start: dateString(start), end: dateString(end), buckets, totals,
    bests: { duration: best('durationMinutes'), distance: best('distanceKm'), pace: paceRecords.length ? { value: paceRecords[0].durationMinutes! / paceRecords[0].distanceKm!, date: paceRecords[0].date } : null },
  };
}

export function shiftRunDate(date: string, period: RunPeriod, direction: -1 | 1): string {
  const result = parseDate(date);
  if (period === 'week') result.setUTCDate(result.getUTCDate() + direction * 7);
  else if (period === 'month') { result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + direction); }
  else { result.setUTCMonth(0, 1); result.setUTCFullYear(result.getUTCFullYear() + direction); }
  return dateString(result);
}

export function formatRunPace(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '—';
  const seconds = Math.round(value * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function runNoteUrl(date: string): string {
  return `obsidian://open?vault=${encodeURIComponent('Documents')}&file=${encodeURIComponent(`Obsidian倉庫/Health/ワークアウト日誌/${date}.md`)}`;
}
