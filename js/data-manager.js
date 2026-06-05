// Async domain layer. Depends on an injected backend (Memory or Supabase).
function createDataManager(backend) {
  // ----- Body records -----
  const getBody = async (date) => {
    const rows = await backend.list('body_records');
    const r = rows.find(x => x.date === date);
    if (!r) return null;
    return { date: r.date, weight: r.weight, bodyFat: r.body_fat };
  };

  const setBody = async (date, weight, bodyFat) => {
    const row = { date, weight: Number(weight), body_fat: Number(bodyFat) };
    await backend.upsert('body_records', row, 'user_id,date');
    return { date, weight: row.weight, bodyFat: row.body_fat };
  };

  // ----- Exercise records (presence model: one row per date+type) -----
  const EXERCISE_TYPES = ['筋トレ', 'RUN', 'WALKING', 'BIKE', 'HIIT'];

  const getExerciseTypes = async (date) => {
    const rows = await backend.list('exercise_records');
    return rows.filter(r => r.date === date).map(r => r.type);
  };

  const hasExercise = async (date, type) => {
    const types = await getExerciseTypes(date);
    return types.includes(type);
  };

  const toggleExercise = async (date, type, on) => {
    if (on) await backend.upsert('exercise_records', { date, type }, 'user_id,date,type');
    else await backend.remove('exercise_records', { date, type });
  };

  // ----- Tasks -----
  const uuid = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

  const getTasks = async () => backend.list('tasks');
  const getTasksByStatus = async (status) =>
    (await backend.list('tasks')).filter(t => t.status === status);
  const getTasksByDate = async (date) =>
    (await backend.list('tasks')).filter(t => t.date === date);

  const addTask = async (name, date = null) => {
    const task = { id: uuid(), name, status: 'idea', date };
    await backend.upsert('tasks', task, 'id');
    return task;
  };

  const updateTask = async (id, updates) => {
    const rows = await backend.list('tasks');
    const cur = rows.find(t => t.id === id);
    if (!cur) throw new Error(`Task ${id} not found`);
    const next = { ...cur, ...updates };
    await backend.upsert('tasks', next, 'id');
    return next;
  };

  const deleteTask = async (id) => { await backend.remove('tasks', { id }); };

  return {
    getBody, setBody,
    EXERCISE_TYPES, getExerciseTypes, hasExercise, toggleExercise,
    getTasks, getTasksByStatus, getTasksByDate, addTask, updateTask, deleteTask,
  };
}

if (typeof window !== 'undefined') window.createDataManager = createDataManager;
