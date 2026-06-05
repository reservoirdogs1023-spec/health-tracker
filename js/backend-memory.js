// In-memory backend test double. Mirrors the SupabaseBackend contract.
function createMemoryBackend(seed = {}) {
  const store = {
    body_records: seed.body_records ? [...seed.body_records] : [],
    exercise_records: seed.exercise_records ? [...seed.exercise_records] : [],
    tasks: seed.tasks ? [...seed.tasks] : [],
  };

  const list = async (table) => store[table].map(r => ({ ...r }));

  const upsert = async (table, row, onConflict) => {
    const keys = onConflict.split(',').map(k => k.trim()).filter(k => k !== 'user_id');
    const idx = store[table].findIndex(r => keys.every(k => r[k] === row[k]));
    if (idx >= 0) store[table][idx] = { ...store[table][idx], ...row };
    else store[table].push({ ...row });
    return { ...row };
  };

  const remove = async (table, match) => {
    const keys = Object.keys(match);
    store[table] = store[table].filter(r => !keys.every(k => r[k] === match[k]));
  };

  return { list, upsert, remove, _store: store };
}

if (typeof window !== 'undefined') window.createMemoryBackend = createMemoryBackend;
