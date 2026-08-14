const WORKOUT_SPECIES = ['Walking', 'Running', 'Cycling'];

function sumPresent(records, key) {
  const values = records.map(record => record[key]).filter(value => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function selectWorkoutRecords(records, species) {
  return records
    .filter(record => record.species === species)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function summarizeWorkoutRecords(records, species) {
  const selected = selectWorkoutRecords(records, species);
  if (!selected.length) {
    return {
      hasRecords: false,
      count: null,
      durationMinutes: null,
      distanceKm: null,
      caloriesKcal: null,
    };
  }
  return {
    hasRecords: true,
    count: selected.length,
    durationMinutes: sumPresent(selected, 'durationMinutes'),
    // Cycling は距離ベースの集計対象にしない。欠損を 0 ともみなさない。
    distanceKm: species === 'Cycling' ? null : sumPresent(selected, 'distanceKm'),
    caloriesKcal: sumPresent(selected, 'caloriesKcal'),
  };
}

if (typeof window !== 'undefined') {
  window.WORKOUT_SPECIES = WORKOUT_SPECIES;
  window.selectWorkoutRecords = selectWorkoutRecords;
  window.summarizeWorkoutRecords = summarizeWorkoutRecords;
}
