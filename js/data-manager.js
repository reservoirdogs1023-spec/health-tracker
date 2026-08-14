// Async domain layer. Depends on an injected backend (Memory or Supabase).
function createDataManager(backend) {
  // ----- Body records -----
  const getBodyRecords = async () => {
    const rows = await backend.list('body_records');
    return rows.map(r => ({ date: r.date, weight: r.weight, bodyFat: r.body_fat }));
  };

  const getBody = async (date) => {
    const rows = await getBodyRecords();
    const r = rows.find(x => x.date === date);
    if (!r) return null;
    return r;
  };

  // 空欄（'' / null / undefined）は「変更しない」の意味。upsert は行ごと置き換えるので、
  // 片方だけ入力されたときに既存値を巻き添えで消さないよう、保存前に現在値を読んで温存する。
  const keepOrNumber = (input, previous) =>
    input === '' || input === null || input === undefined ? (previous ?? null) : Number(input);

  const setBody = async (date, weight, bodyFat) => {
    const prev = await getBody(date);
    const row = {
      date,
      weight: keepOrNumber(weight, prev?.weight),
      body_fat: keepOrNumber(bodyFat, prev?.bodyFat),
    };
    await backend.upsert('body_records', row, 'user_id,date');
    return { date, weight: row.weight, bodyFat: row.body_fat };
  };

  // ----- Sleep records -----
  // sleep_records が未作成の Supabase でも、睡眠以外（カレンダー・体組成・運動）は動かす。
  // テーブル不在だけを吸収し、通信エラー等はそのまま投げる（本物の障害を隠さない）。
  const isMissingTable = (e) => /Could not find the table/i.test(e?.message ?? '');

  const getSleepRecords = async () => {
    let rows;
    try {
      rows = await backend.list('sleep_records');
    } catch (e) {
      if (isMissingTable(e)) return [];
      throw e;
    }
    // night/nap の null は「昼寝ゼロ」ではなく「内訳が不明」。0 に丸めない。
    return rows.map(r => ({
      date: r.date,
      hours: r.hours,
      night_hours: r.night_hours ?? null,
      nap_hours: r.nap_hours ?? null,
    }));
  };

  const getSleep = async (date) => {
    const rows = await getSleepRecords();
    return rows.find(x => x.date === date) ?? null;
  };

  // 保存は握りつぶさない（記録できていないのに成功と見せない）。原因が伝わる文言にして投げ直す。
  // 空欄は体組成と同じく「変更しない」の意味で、既存値を温存する。
  const setSleep = async (date, hours, night = '', nap = '') => {
    const prev = await getSleep(date);
    const row = {
      date,
      hours: keepOrNumber(hours, prev?.hours),
      night_hours: keepOrNumber(night, prev?.night_hours),
      nap_hours: keepOrNumber(nap, prev?.nap_hours),
    };
    // 内訳が両方そろっているなら合計と一致させる（記録側の検算と同じ約束）
    if (row.night_hours != null && row.nap_hours != null) {
      const sum = row.night_hours + row.nap_hours;
      if (row.hours == null) row.hours = sum;
      else if (Math.abs(row.hours - sum) > 1e-9) {
        throw new Error(`合計と内訳が合いません: 合計${row.hours} ≠ 夜${row.night_hours}+昼${row.nap_hours}`);
      }
    }
    try {
      await backend.upsert('sleep_records', row, 'user_id,date');
    } catch (e) {
      if (isMissingTable(e)) throw new Error('睡眠の保存先がまだ用意されていません（sleep_records 未作成）');
      throw e;
    }
    return { date, hours: row.hours, night_hours: row.night_hours, nap_hours: row.nap_hours };
  };

  // ----- Exercise records (presence model: one row per date+type) -----
  const EXERCISE_TYPES = ['腕立て', 'アブローラー', 'スクワット', '斜め懸垂', 'RUN', 'WALKING', 'BIKE', 'HIIT'];
  const STRENGTH_TYPES = ['腕立て', 'アブローラー', 'スクワット', '斜め懸垂'];

  const getExerciseRecords = async () => {
    const rows = await backend.list('exercise_records');
    return rows.map(r => ({ date: r.date, type: r.type, detail: r.detail ?? null }));
  };

  const getExerciseTypes = async (date) => {
    const rows = await getExerciseRecords();
    return rows.filter(r => r.date === date).map(r => r.type);
  };

  const hasExercise = async (date, type) => {
    const types = await getExerciseTypes(date);
    return types.includes(type);
  };

  const getExerciseDetails = async (date) => {
    const rows = await getExerciseRecords();
    return rows.filter(r => r.date === date).map(r => ({ type: r.type, detail: r.detail }));
  };

  const hasStrength = async (date) => {
    const types = await getExerciseTypes(date);
    return STRENGTH_TYPES.some(t => types.includes(t));
  };

  const toggleExercise = async (date, type, on) => {
    if (on) await backend.upsert('exercise_records', { date, type }, 'user_id,date,type');
    else await backend.remove('exercise_records', { date, type });
  };

  // Record an exercise with optional detail (回数・距離など). Upsert by date+type.
  const setExercise = async (date, type, detail = null) => {
    await backend.upsert('exercise_records', { date, type, detail: detail || null }, 'user_id,date,type');
  };

  const removeExercise = async (date, type) => {
    await backend.remove('exercise_records', { date, type });
  };

  // ----- Apple Health workout records (read-only in the Web UI) -----
  const WORKOUT_TYPES = ['Walking', 'Running', 'Cycling'];

  const getWorkoutRecords = async () => {
    let rows;
    try {
      rows = await backend.list('workout_records');
    } catch (e) {
      // マイグレーション前でも既存の体組成・睡眠・筋トレ画面は止めない。
      if (isMissingTable(e)) return [];
      throw e;
    }
    return rows.map(r => ({
      date: r.date,
      time: r.time,
      species: r.species,
      durationMinutes: r.duration_minutes ?? null,
      distanceKm: r.distance_km ?? null,
      caloriesKcal: r.calories_kcal ?? null,
    }));
  };

  // タスク機能は 2026-08-07 に本アプリから分離した（タスク管理は Obsidian 側で完結）。
  // Supabase の tasks テーブルとデータは残してあるが、このアプリからは触らない。

  return {
    getBody, getBodyRecords, setBody,
    getSleep, getSleepRecords, setSleep,
    EXERCISE_TYPES, STRENGTH_TYPES, getExerciseRecords, getExerciseTypes, hasExercise, getExerciseDetails, hasStrength, toggleExercise, setExercise, removeExercise,
    WORKOUT_TYPES, getWorkoutRecords,
  };
}

if (typeof window !== 'undefined') window.createDataManager = createDataManager;
