import type { BodyRecord, HealthDashboard, WorkoutRecord } from './health-types.ts';

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function sevenDayChange(body: BodyRecord[], date: string, key: 'weight' | 'bodyFat'): number | null {
  const current = body.find(r => r.date === date)?.[key];
  const before = [7, 8, 9].map(n => body.find(r => r.date === shiftDate(date, -n))?.[key]).find(v => v != null);
  return current == null || before == null ? null : current - before;
}

const sum = (values: Array<number | null>) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};
export const SPECIES = ['Walking', 'Running', 'Cycling'] as const;
export const SPECIES_LABEL = { Walking: 'ウォーキング', Running: 'ジョギング', Cycling: '自転車' };
export const SPECIES_COLOR = { Walking: 'var(--walk)', Running: 'var(--run)', Cycling: 'var(--cycle)' };

export function workoutTotals(records: WorkoutRecord[]) {
  const durationMinutes = sum(records.map(r => r.durationMinutes));
  return {
    count: records.length,
    durationMinutes,
    distanceKm: sum(records.map(r => r.distanceKm)),
    species: SPECIES.map(species => {
      const list = records.filter(r => r.species === species);
      const minutes = sum(list.map(r => r.durationMinutes));
      return { species, count: list.length, durationMinutes: minutes, distanceKm: sum(list.map(r => r.distanceKm)),
        share: minutes === null || !durationMinutes ? null : minutes / durationMinutes * 100 };
    }),
  };
}

export function stackWorkoutDays(workout: WorkoutRecord[], exercise: HealthDashboard['exercise']) {
  const dates = [...new Set([...workout, ...exercise].map(r => r.date))].sort();
  return dates.map(date => {
    const records = workout.filter(r => r.date === date).sort((a, b) => a.time.localeCompare(b.time) || a.recordKey.localeCompare(b.recordKey));
    let offset = 0;
    const blocks = records.map(record => {
      const size = Math.max(5, record.durationMinutes ?? 0);
      const block = { record, offset, size };
      offset += size;
      return block;
    });
    return { date, blocks, height: offset, durationMinutes: sum(records.map(r => r.durationMinutes)), exercise: exercise.filter(r => r.date === date) };
  });
}

export function flowsheetDates(dashboard: HealthDashboard, period: number | null, today: string) {
  const first = [...dashboard.body, ...dashboard.sleep, ...dashboard.workout, ...dashboard.exercise].map(r => r.date).filter(d => d <= today).sort()[0] ?? today;
  const start = period === null ? first : shiftDate(today, 1 - period);
  const result: string[] = [];
  for (let date = start; date <= today; date = shiftDate(date, 1)) result.push(date);
  return result;
}

// All strips use these same plot units, including the corner radius.
export function stripBarGeometry(width: number, count: number) {
  const step = width / Math.max(1, count);
  const barWidth = Math.max(0.25, Math.min(step * 0.62, 20));
  return { step, barWidth, radius: Math.min(2, barWidth / 4) };
}
