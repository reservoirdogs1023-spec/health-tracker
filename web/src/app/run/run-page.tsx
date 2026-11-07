'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HealthDashboard, WorkoutRecord } from '../../site/health-types';
import { refreshDashboardWhenVisible } from '../../site/resume-refresh';
import { localDateString } from '../../site/dashboard-model';
import {
  buildRunPage, shiftRunDate, formatRunPace, runNoteUrl,
  type RunPeriod, type RunBucket,
} from '../../site/run-model';
import type { Vo2Record } from '../../site/vo2-api';
import { Vo2Chart } from './vo2-chart';
import { RunMilestones } from './milestones';
import { ChartHover } from './chart-hover';
import { ThemeToggle } from '../theme-toggle';
import { PageNavigation } from '../page-navigation';
import { readDashboard, readVo2 } from '../../backend';

export function RunPage() {
  const [vo2, setVo2] = useState<Vo2Record[]>([]);
  const [vo2Error, setVo2Error] = useState(false);
  const bestVo2 = [...vo2].sort((a,b) => b.value-a.value || a.date.localeCompare(b.date))[0];
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [period, setPeriod] = useState<RunPeriod>('week');
  const [date, setDate] = useState(() => localDateString(new Date()));
  const model = useMemo(() => buildRunPage(records, period, date, vo2Error ? [] : vo2), [records, period, date, vo2, vo2Error]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const data = await readDashboard();
        if (active) { setRecords(data.workout); setStatus('ready'); }
        try {
          const vo2Data = {records: await readVo2()};
          if (active) { setVo2(vo2Data.records); setVo2Error(false); }
        } catch { if (active) setVo2Error(true); }
      } catch { if (active) setStatus('error'); }
    }
    void refresh();
    const stop = refreshDashboardWhenVisible(document, refresh);
    return () => { active = false; stop(); };
  }, []);

  return (
    <main className="app-shell run-shell" data-health-tracker>
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">H</span>
          <div><p className="eyebrow">Personal health archive</p><h1>Health Tracker</h1></div>
        </div>
        <PageNavigation page="run" />
        <p className={`data-status ${status}`} role="status"><span aria-hidden="true" />
          {status === 'loading' ? '読み込み中' : status === 'ready' ? '本人専用' : 'データを取得できません'}
        </p>
        <ThemeToggle />
      </header>
      <section className="run-page" aria-busy={status === 'loading'}>
        <div className="intro-row"><div><p className="eyebrow">Running archive</p>
          <h2>走った時間と、調子の変化。</h2><p>自分のペースで、これまでの記録を振り返ります。</p>
        </div></div>
        {status === 'error' ? <p className="locked-state" role="alert">記録を取得できませんでした。再読み込みしてお試しください。</p> : status === 'loading' ? <p role="status">記録を読み込んでいます。</p> : <>
          <section className="run-bests" aria-label="自己ベスト">
            <Best metricType="pace" label="最速ペース" value={formatRunPace(model.bests.pace?.value ?? null)} unit="/km" date={model.bests.pace?.date} note="2km以上のラン" />
            <Best metricType="durationMinutes" label="最長時間" value={metric(model.bests.duration?.value ?? null)} unit="分" date={model.bests.duration?.date} />
            <Best metricType="distanceKm" label="最長距離" value={metric(model.bests.distance?.value ?? null)} unit="km" date={model.bests.distance?.date} />
            <Best metricType="vo2" label="最高 VO2max" value={vo2Error ? "取得できません" : bestVo2 ? String(bestVo2.value) : "データなし"} date={bestVo2?.date} unit="" note="ml/(kg·min) · Apple推定" />
          </section>
          <div className="run-period-head">
            <div><p className="eyebrow">Period</p><strong>期間を選ぶ</strong></div>
            <div className="period-control" aria-label="ランの表示期間">
              {(['week', 'month', 'year'] as const).map(value => <button type="button" key={value} className={period === value ? 'active' : ''} aria-pressed={period === value} onClick={() => setPeriod(value)}>{periodName[value]}</button>)}
            </div>
          </div>
          <div className="run-range">
            <button type="button" onClick={() => setDate(shiftRunDate(date, period, -1))} aria-label="前の期間">‹</button>
            <strong aria-live="polite">{model.start} 〜 {model.end}</strong>
            <button type="button" onClick={() => setDate(shiftRunDate(date, period, 1))} aria-label="次の期間">›</button>
            <button type="button" onClick={() => setDate(localDateString(new Date()))}>今の期間</button>
          </div>
          <article className="card run-goals"><div className="card-heading"><h3>{periodName[period]}の目標</h3><p>時間を目安に。距離は参考として表示します。</p></div>
            <Goal label="時間" value={model.totals.durationMinutes} target={model.goals.durationMinutes} unit="分" percent={model.progress.time} />
            <Goal label="距離（参考）" value={model.totals.distanceKm} target={model.goals.distanceKm} unit="km" percent={model.progress.distance} secondary />
          </article>
          <section className="run-charts" aria-label="選択期間の推移">
            <RunChart title="距離" unit="km" buckets={model.buckets} field="distanceKm" total={metric(model.totals.distanceKm)} color="var(--run-distance)" />
            <RunChart title="時間" unit="分" buckets={model.buckets} field="durationMinutes" total={metric(model.totals.durationMinutes)} color="var(--run-time)" />
            <RunChart title="ペース" unit="/km" buckets={model.buckets} field="pace" total={formatRunPace(model.totals.pace)} color="var(--run-pace)" />
            <div>{vo2Error ? <article className="card" role="alert">VO2maxを取得できませんでした。再読み込みしてお試しください。</article> : <Vo2Chart records={vo2} buckets={model.buckets} />}</div>
          </section>
          <section className="run-bottom">
            <RunMilestones items={model.milestones} />
            <article className="card"><div className="card-heading"><h3>ランの記録</h3><p>全期間の直近5回。日誌は Obsidian で開きます。</p></div>
              {model.records.length === 0 ? <p className="run-note">ランの記録はありません。</p> : <>
                <RunRecords records={model.records.slice(0, 5)} />
                {model.records.length > 5 && <details className="run-more"><summary>それ以前の記録を表示（{model.records.length - 5}件）</summary><RunRecords records={model.records.slice(5)} /></details>}
              </>}
            </article>
          </section>
        </>}
      </section>
    </main>
  );
}

const periodName = { week: '週', month: '月', year: '年' };
function metric(value: number | null) { return value === null ? 'データなし' : Number(value.toFixed(1)).toLocaleString('ja-JP'); }
function Best({ metricType, label, value, unit, date, note }: { metricType: 'distanceKm' | 'durationMinutes' | 'pace' | 'vo2'; label: string; value: string; unit: string; date?: string; note?: string }) {
  return <article className="run-best" data-run-metric={metricType}><p>{label}</p><strong>{value} <small>{value === 'データなし' || value === '—' ? '' : unit}</small></strong><span>{date ?? note ?? 'データなし'}{date && note ? ` · ${note}` : ''}</span></article>;
}
function Goal({ label, value, target, unit, percent, secondary = false }: { label: string; value: number | null; target: number; unit: string; percent: number | null; secondary?: boolean }) {
  return <div className={`run-goal ${secondary ? 'secondary' : ''}`} data-run-metric={secondary ? 'distanceKm' : 'durationMinutes'}><div><span>{label}</span><strong>{metric(value)} <small>/ {target} {unit}</small></strong><span>{percent === null ? 'データなし' : percent >= 100 ? '達成' : `${Math.floor(percent)}%`}</span></div>
    <div className="run-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? 'データなし' : percent >= 100 ? '達成' : `${Math.floor(percent)}%`}><i style={{ width: `${percent ?? 0}%` }} /></div>
  </div>;
}
function RunRecords({ records }: { records: WorkoutRecord[] }) {
  return <ul className="run-records">{records.map(record => <li key={record.recordKey}>
    <div><time>{record.date}</time><span className="run-note">{record.time.slice(0, 5)}</span></div>
    <div className="run-record-metrics"><span>{metric(record.durationMinutes)} 分</span><span>{metric(record.distanceKm)} km</span><span>{formatRunPace(record.distanceKm !== null && record.distanceKm >= 2 && record.durationMinutes !== null && record.durationMinutes > 0 ? record.durationMinutes / record.distanceKm : null)} /km</span></div>
    <a className="run-note-link" href={runNoteUrl(record.date)}>日誌を開く</a>
  </li>)}</ul>;
}
function RunChart({ title, unit, buckets, field, total, color }: { title: string; unit: string; buckets: RunBucket[]; field: 'distanceKm' | 'durationMinutes' | 'pace'; total: string; color: string }) {
  const pace = field === 'pace';
  const values = buckets.map(bucket => bucket[field]);
  const present = values.filter((value): value is number => value !== null);
  const max = Math.max(pace ? 1 : 0, ...present);
  const low = pace ? Math.floor(Math.min(...present, max) - 1) : 0;
  const high = pace ? Math.ceil(max + 1) : max || 1;
  const x = (index: number) => 44 + (index + 0.5) * 530 / buckets.length;
  const y = (value: number) => pace ? 24 + (value - low) / (high - low) * 150 : 174 - value / high * 150;
  const [selected, setSelected] = useState<number | null>(null);
  const gradientId = `run-gradient-${field}`;
  const plotted = values.flatMap((value, index) => value === null ? [] : [{ x: x(index), y: y(value) }]);
  return <article className="card run-chart" data-run-metric={field}><div className="run-chart-heading"><h3>{title}</h3><p><strong>{total}</strong> {total === 'データなし' || total === '—' ? '' : unit}<small>{pace ? '平均 · 2km以上' : '合計'}</small></p></div>
    {present.length === 0 ? <div className="run-empty">データなし</div> : <>
      <ChartHover key={buckets.map(bucket => bucket.key).join('|')} label={title} color={color} points={buckets.map((bucket, i) => ({ key: bucket.key, x: x(i), y: values[i] === null ? 174 : y(values[i]), value: values[i] === null ? 'データなし' : `${pace ? formatRunPace(values[i]) : metric(values[i])} ${unit}` }))}>
      <svg viewBox="0 0 600 210" role="img" aria-label={`${title}の${buckets.length === 12 ? '月別' : '日別'}推移。${pace ? '上ほど速いペース。' : ''}各期間の値は下の詳細から確認できます。`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={pace ? 0.28 : 1} />
          <stop offset="100%" stopColor={color} stopOpacity={pace ? 0 : 0.4} />
        </linearGradient></defs>
        {pace && plotted.length > 1 && <polygon points={`${plotted[0].x},174 ${plotted.map(p => `${p.x},${p.y}`).join(' ')} ${plotted.at(-1)!.x},174`} fill={`url(#${gradientId})`} />}
        {[0, 1, 2, 3].map(i => { const v = pace ? low + (high - low) * i / 3 : high * (1 - i / 3); return <g key={i}><line x1="44" x2="574" y1={24 + i * 50} y2={24 + i * 50} stroke="var(--grid)" /><text x="38" y={28 + i * 50} textAnchor="end">{pace ? formatRunPace(v) : Number(v.toFixed(1))}</text></g>; })}
        {pace && <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={values.flatMap((v, i) => v === null ? [] : [`${x(i)},${y(v)}`]).join(' ')} />}
        {values.map((value, i) => value === null ? null : <g key={buckets[i].key}><title>{buckets[i].label}: {pace ? formatRunPace(value) : metric(value)} {unit}</title>{pace ? <circle cx={x(i)} cy={y(value)} r="3.5" fill={color} stroke="var(--card)" strokeWidth="1.5" /> : <rect x={x(i) - Math.min(18, 360 / buckets.length) / 2} y={y(value)} width={Math.min(18, 360 / buckets.length)} height={174 - y(value)} rx="2" fill={`url(#${gradientId})`} />}</g>)}
        {buckets.map((bucket, i) => i % (buckets.length > 15 ? 5 : 1) === 0 || i === buckets.length - 1 ? <text key={bucket.key} x={x(i)} y="197" textAnchor="middle">{bucket.label}</text> : null)}
      </svg>
      </ChartHover>
      <label className="run-chart-detail">日付ごとの値 <select value={selected ?? ''} onChange={event => setSelected(event.target.value === '' ? null : Number(event.target.value))}><option value="">選択する</option>{buckets.map((bucket, i) => <option key={bucket.key} value={i}>{bucket.key}: {values[i] === null ? 'データなし' : pace ? formatRunPace(values[i]) : metric(values[i])} {values[i] === null ? '' : unit}</option>)}</select></label>
    </>}
    {pace && <p className="run-note">上ほど速いペース。対象の時間合計 ÷ 距離合計で計算します。</p>}
  </article>;
}
