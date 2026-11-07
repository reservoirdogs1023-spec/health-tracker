import { createClient } from '@supabase/supabase-js';
import { dashboardFromArchive, rowsFromArchive, type Archive } from './archive';
import type { HealthEntryInput } from './site/health-types';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
export const localPreview = import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW === '1';
export const client = url.startsWith('https://') && key.startsWith('sb_publishable_')
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!client) throw new Error('接続設定が完了していません。');
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.code === '23505' ? '同じ日の異なる記録があり、取り込みを停止しました。既存の記録は保持されています。' : error.message);
  return data as T;
}

export async function readArchive(): Promise<Archive> {
  if (import.meta.env.DEV && localPreview) return (await import('./preview-data')).previewArchive();
  return rpc<Archive>('health_web_archive');
}
export async function readDashboard() { return dashboardFromArchive(await readArchive()); }
export async function readVo2() { return (await readArchive()).vo2; }
export async function saveHealthEntry(entry: HealthEntryInput) {
  if(localPreview)throw new Error('確認用の架空データは保存できません。');
  await rpc('health_web_save_entry',{entry});
}

export async function importArchive(value: unknown): Promise<{inserted:number;unchanged:number}> {
  const rows = rowsFromArchive(value);
  if (rows.length === 0) throw new Error('取り込む記録がありません。');
  const total={inserted:0,unchanged:0};
  for (let offset=0;offset<rows.length;offset+=100) {
    try {
      const result=await rpc<{inserted:number;unchanged:number}>('health_web_import',{batch:rows.slice(offset,offset+100)});
      total.inserted+=result.inserted; total.unchanged+=result.unchanged;
    } catch (error) {
      throw new Error(`追加${total.inserted}件・登録済み${total.unchanged}件まで確認。その後の取り込みを停止しました。再実行前にバックアップで保存状態を確認してください。${error instanceof Error ? error.message : ''}`);
    }
  }
  const saved=rowsFromArchive(await readArchive());
  const canonical=(row: Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))));
  const lookup=new Map(saved.map(row=>[`${row.category}:${row.key}`,canonical(row.payload)]));
  if (!rows.every(row=>lookup.get(`${row.category}:${row.key}`)===canonical(row.payload))) throw new Error('保存後の照合が一致しません。再送せず確認してください。');
  return total;
}
