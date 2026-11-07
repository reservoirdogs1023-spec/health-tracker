import type { ExerciseRecord, WorkoutRecord } from './health-types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export type WorkoutSpecies = WorkoutRecord['species'];
export type WorkoutFilter = WorkoutSpecies | 'All';
export type HeatmapEventDay = {
  date: string;
  count: number;
  breakdown: Array<{ type: string; count: number }>;
};
export type HeatmapDay = HeatmapEventDay & {
  dayOfWeek: number;
  weekIndex: number;
};

export function summarizeWorkout(records: WorkoutRecord[], species: WorkoutFilter) {
  const selected = species === 'All' ? records : records.filter(record => record.species === species);
  if (selected.length === 0) {
    return {
      count: null,
      durationMinutes: null,
      distanceKm: null,
      caloriesKcal: null,
    };
  }
  return {
    count: selected.length,
    durationMinutes: sumPresent(selected.map(record => record.durationMinutes)),
    distanceKm: species === 'Cycling'
      ? null
      : sumPresent(selected.map(record => record.distanceKm)),
    caloriesKcal: sumPresent(selected.map(record => record.caloriesKcal)),
  };
}

export type WorkoutDay = {
  date: string;
  durationMinutes: number | null;
  distanceKm: number | null;
  breakdown: Array<{
    species: WorkoutSpecies;
    durationMinutes: number | null;
    distanceKm: number | null;
  }>;
};

export function aggregateWorkoutDays(records: WorkoutRecord[]): WorkoutDay[] {
  const byDate = new Map<string, WorkoutRecord[]>();
  for (const record of records) {
    const day = byDate.get(record.date) ?? [];
    day.push(record);
    byDate.set(record.date, day);
  }
  const speciesOrder: WorkoutSpecies[] = ['Walking', 'Running', 'Cycling'];
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, day]) => ({
      date,
      durationMinutes: sumPresent(day.map(record => record.durationMinutes)),
      distanceKm: sumPresent(day.map(record => record.distanceKm)),
      breakdown: speciesOrder.flatMap(species => {
        const selected = day.filter(record => record.species === species);
        return selected.length ? [{
          species,
          durationMinutes: sumPresent(selected.map(record => record.durationMinutes)),
          distanceKm: sumPresent(selected.map(record => record.distanceKm)),
        }] : [];
      }),
    }));
}

export function aggregateExerciseDays(
  exercise: ExerciseRecord[],
  workout: WorkoutRecord[],
  year: number,
): HeatmapEventDay[] {
  const prefix = `${year}-`;
  const byDate = new Map<string, Map<string, number>>();
  const add = (date: string, type: string) => {
    if (!date.startsWith(prefix) || !isCalendarDate(date) || !type) return;
    const types = byDate.get(date) ?? new Map<string, number>();
    types.set(type, (types.get(type) ?? 0) + 1);
    byDate.set(date, types);
  };
  exercise.forEach(record => add(record.date, record.type));
  workout.forEach(record => add(record.date, record.species));

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, types]) => ({
      date,
      count: [...types.values()].reduce((total, count) => total + count, 0),
      breakdown: [...types.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'ja'))
        .map(([type, count]) => ({ type, count })),
    }));
}

export function buildHeatmapDays(year: number, events: HeatmapEventDay[]) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const dayCount = Math.round((end - start) / DAY_MS);
  const firstDayOfWeek = new Date(start).getUTCDay();
  const byDate = new Map(events.map(event => [event.date, event]));
  const days: HeatmapDay[] = Array.from({ length: dayCount }, (_, index) => {
    const current = new Date(start + index * DAY_MS);
    const date = [
      current.getUTCFullYear(),
      String(current.getUTCMonth() + 1).padStart(2, '0'),
      String(current.getUTCDate()).padStart(2, '0'),
    ].join('-');
    const event = byDate.get(date);
    return {
      date,
      dayOfWeek: current.getUTCDay(),
      weekIndex: Math.floor((firstDayOfWeek + index) / 7),
      count: event?.count ?? 0,
      breakdown: event?.breakdown ?? [],
    };
  });
  return {
    year,
    weekCount: Math.floor((firstDayOfWeek + dayCount - 1) / 7) + 1,
    days,
  };
}

export function filterByDays<T extends { date: string }>(
  records: T[],
  periodDays: number | null,
  now = new Date(),
): T[] {
  if (periodDays === null) return records;
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - periodDays + 1);
  const cutoffDate = localDateString(cutoff);
  return records.filter(record => record.date >= cutoffDate);
}

export function localDateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function sumPresent(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0
    ? present.reduce((total, value) => total + value, 0)
    : null;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}
