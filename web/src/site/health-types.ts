export type BodyRecord = {
  date: string;
  weight: number | null;
  bodyFat: number | null;
};

export type SleepRecord = {
  date: string;
  hours: number | null;
  nightHours: number | null;
  napHours: number | null;
};

export type HealthEntryInput = {
  date: string;
  weight: number | null;
  bodyFat: number | null;
  nightHours: number | null;
  napHours: number | null;
};

export type ExerciseRecord = {
  date: string;
  type: string;
};

export type WorkoutRecord = {
  recordKey: string;
  date: string;
  time: string;
  species: 'Walking' | 'Running' | 'Cycling';
  durationMinutes: number | null;
  distanceKm: number | null;
  caloriesKcal: number | null;
};

export type HealthImportPayload = {
  body: BodyRecord[];
  sleep: SleepRecord[];
  exercise: ExerciseRecord[];
  workout: WorkoutRecord[];
};

export type HealthDashboard = HealthImportPayload;

export type ImportCounts = {
  body: number;
  sleep: number;
  exercise: number;
  workout: number;
};

export type IncrementalImportResult = {
  inserted: ImportCounts;
  unchanged: ImportCounts;
  conflicts: ImportCounts;
};
