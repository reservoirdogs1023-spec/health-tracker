import {
  caloriesKcal,
  distanceKm,
  durationMinutes,
} from './apple-health-workouts.mjs';

export const HEALTH_AUTO_EXPORT_ACTIVITY_NAMES = new Map([
  ['屋外 歩く', 'Walking'],
  ['屋内 サイクリング', 'Cycling'],
]);

export function convertHealthAutoExportWorkouts(
  exported,
  { activityNames = HEALTH_AUTO_EXPORT_ACTIVITY_NAMES } = {},
) {
  if (!Array.isArray(exported?.data?.workouts)) {
    throw new Error('Health Auto Export JSON に data.workouts 配列がありません。');
  }

  const rows = [];
  const unknownNames = new Map();

  for (const workout of exported.data.workouts) {
    const species = activityNames.get(workout.name);
    if (!species) {
      unknownNames.set(workout.name, (unknownNames.get(workout.name) ?? 0) + 1);
      continue;
    }

    const start = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/.exec(workout.start);
    if (!start) throw new Error('Health Auto Export の workout.start を解釈できません。');

    rows.push({
      date: start[1],
      time: start[2],
      species,
      duration_minutes: durationMinutes(workout.duration, 's'),
      distance_km: distanceKm(workout.distance?.qty, workout.distance?.units),
      calories_kcal: caloriesKcal(
        workout.activeEnergyBurned?.qty,
        workout.activeEnergyBurned?.units,
      ),
    });
  }

  return { rows, unknownNames };
}

function workoutIdentity(row) {
  return `${row.date}|${row.time}|${row.species}`;
}

export function mergeWorkoutRows(existingRows, importedRows) {
  const merged = existingRows.map(row => ({ ...row }));
  const existingIndexes = new Map();
  merged.forEach((row, index) => {
    const identity = workoutIdentity(row);
    if (!existingIndexes.has(identity)) existingIndexes.set(identity, index);
  });

  for (const row of importedRows) {
    const identity = workoutIdentity(row);
    const existingIndex = existingIndexes.get(identity);
    if (existingIndex == null) {
      existingIndexes.set(identity, merged.length);
      merged.push({ ...row });
    } else {
      merged[existingIndex] = { ...row };
    }
  }

  return merged.sort((a, b) =>
    b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
}
