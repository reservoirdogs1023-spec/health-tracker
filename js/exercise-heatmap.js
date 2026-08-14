const DAY_MS = 24 * 60 * 60 * 1000;

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function aggregateExerciseEventsByDay(exerciseRecords = [], workoutRecords = [], year = null) {
  const byDate = new Map();
  const yearPrefix = Number.isInteger(year) ? `${year}-` : null;

  const addEvent = (record, typeKey) => {
    const date = record?.date;
    const type = record?.[typeKey];
    if (!isCalendarDate(date) || typeof type !== 'string' || !type) return;
    if (yearPrefix && !date.startsWith(yearPrefix)) return;

    if (!byDate.has(date)) byDate.set(date, new Map());
    const types = byDate.get(date);
    types.set(type, (types.get(type) || 0) + 1);
  };

  exerciseRecords.forEach(record => addEvent(record, 'type'));
  workoutRecords.forEach(record => addEvent(record, 'species'));

  return [...byDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, types]) => ({
      date,
      count: [...types.values()].reduce((sum, count) => sum + count, 0),
      breakdown: [...types.entries()]
        .sort(([typeA], [typeB]) => typeA < typeB ? -1 : typeA > typeB ? 1 : 0)
        .map(([type, count]) => ({ type, count })),
    }));
}

function buildExerciseHeatmapDays(year, aggregatedDays = []) {
  if (!Number.isInteger(year)) throw new TypeError('year must be an integer');

  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const dayCount = Math.round((end - start) / DAY_MS);
  const firstDayOfWeek = new Date(start).getUTCDay();
  const byDate = new Map(aggregatedDays.map(day => [day.date, day]));
  const days = Array.from({ length: dayCount }, (_, dayIndex) => {
    const date = new Date(start + dayIndex * DAY_MS);
    const dateString = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
    const eventDay = byDate.get(dateString);
    return {
      date: dateString,
      dayOfWeek: date.getUTCDay(),
      weekIndex: Math.floor((firstDayOfWeek + dayIndex) / 7),
      count: eventDay?.count || 0,
      breakdown: eventDay?.breakdown || [],
    };
  });

  return {
    year,
    weekCount: Math.floor((firstDayOfWeek + dayCount - 1) / 7) + 1,
    days,
  };
}

if (typeof window !== 'undefined') {
  window.aggregateExerciseEventsByDay = aggregateExerciseEventsByDay;
  window.buildExerciseHeatmapDays = buildExerciseHeatmapDays;
}
