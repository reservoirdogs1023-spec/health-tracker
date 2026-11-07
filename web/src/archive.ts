import type { HealthDashboard, HealthEntryInput } from './site/health-types.ts';
import type { Vo2Record } from './site/vo2-api.ts';

export const categories = ['body','sleep','exercise','workout','pending','vo2'] as const;
export type Category = typeof categories[number];
export type Archive = HealthDashboard & { pending: HealthEntryInput[]; vo2: Vo2Record[] };
export type ImportRow = { category: Category; key: string; payload: Record<string, unknown> };

export function emptyArchive(): Archive {
  return { body:[],sleep:[],exercise:[],workout:[],pending:[],vo2:[] };
}

export function rowsFromArchive(value: unknown): ImportRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('記録ファイルの形式が違います。');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(k=> !categories.includes(k as Category))) throw new Error('未対応の項目が含まれています。');
  const rows: ImportRow[] = [];
  for (const category of categories) {
    const list = source[category] ?? [];
    if (!Array.isArray(list)) throw new Error(`${category} は配列にしてください。`);
    const keys = new Set<string>();
    for (const raw of list) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('記録の形式が違います。');
      const payload = raw as Record<string,unknown>;
      const key = category==='workout' ? payload.recordKey : category==='exercise' ? `${payload.date}|${payload.type}` : payload.date;
      if (typeof key !== 'string' || !key || keys.has(key)) throw new Error('記録キーが空か重複しています。');
      keys.add(key);
      rows.push({ category, key, payload });
    }
  }
  return rows;
}

export function dashboardFromArchive(archive: Archive): HealthDashboard {
  const body = new Map(archive.body.map(r=>[r.date,{...r}]));
  const sleep = new Map(archive.sleep.map(r=>[r.date,{...r}]));
  for (const entry of archive.pending) {
    if (entry.weight!==null || entry.bodyFat!==null) {
      const old = body.get(entry.date);
      body.set(entry.date,{date:entry.date,weight:entry.weight??old?.weight??null,bodyFat:entry.bodyFat??old?.bodyFat??null});
    }
    if (entry.nightHours!==null && entry.napHours!==null) {
      sleep.set(entry.date,{date:entry.date,hours:Number((entry.nightHours+entry.napHours).toFixed(2)),nightHours:entry.nightHours,napHours:entry.napHours});
    }
  }
  return {body:[...body.values()].sort((a,b)=>a.date.localeCompare(b.date)),sleep:[...sleep.values()].sort((a,b)=>a.date.localeCompare(b.date)),exercise:archive.exercise,workout:archive.workout};
}
