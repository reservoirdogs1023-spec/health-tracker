'use client';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { HealthDashboard } from '../site/health-types';
import { flowsheetDates, sevenDayChange, stackWorkoutDays, stripBarGeometry, SPECIES_COLOR, SPECIES_LABEL } from '../site/flowsheet-model';

const ROWS = [
  { key: 'weight', name: '体重', unit: 'kg', color: 'var(--weight)', height: 104, digits: 2 },
  { key: 'bodyFat', name: '体脂肪率', unit: '%', color: 'var(--fat)', height: 84, digits: 1 },
  { key: 'sleep', name: '睡眠', unit: 'h', color: 'var(--sleep)', height: 104, digits: 1 },
  { key: 'workout', name: '運動', unit: '分', color: 'var(--walk)', height: 72, digits: 0 },
] as const;
const metric = (v: number | null | undefined, digits = 1) => v == null ? '—' : v.toFixed(digits);
const jp = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });

export function Flowsheet({ dashboard, period, today }: { dashboard: HealthDashboard; period: number | null; today: string }) {
  const dates = useMemo(() => flowsheetDates(dashboard, period, today), [dashboard, period, today]);
  const [cursor, setCursor] = useState(today);
  const selected = dates.includes(cursor) ? cursor : dates.at(-1)!;
  const body = new Map(dashboard.body.map(r => [r.date, r]));
  const sleep = new Map(dashboard.sleep.map(r => [r.date, r]));
  const stacks = useMemo(() => stackWorkoutDays(dashboard.workout, dashboard.exercise), [dashboard.workout, dashboard.exercise]);
  const day = stacks.find(d => d.date === selected);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [heights, setHeights] = useState<Record<string, number>>({});
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const observer = new ResizeObserver(() => {
      const plot = sheet.querySelector('.cell-plot');
      if (plot) setWidth(Math.max(1, plot.clientWidth));
      const sizes = Object.fromEntries([...sheet.querySelectorAll<HTMLElement>('.cell-plot')].map(e => [e.dataset.row!, e.clientHeight]));
      setHeights(previous => JSON.stringify(previous) === JSON.stringify(sizes) ? previous : sizes);
    });
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);
  const { step, barWidth, radius } = stripBarGeometry(width, dates.length);
  const x = (i: number) => (i + 0.5) * step;
  const selectedX = x(dates.indexOf(selected));
  return <article className="sheet-card">
    <div className="sheet-head"><h2>からだの経過</h2><p>同じ日付の縦線で、まとめて読む</p></div>
    <div className="sheet-date"><time>{jp(selected)}</time><label>日付を選ぶ<select aria-label="経過表の日付" value={selected} onChange={e => setCursor(e.target.value)}>{dates.map(d => <option key={d} value={d}>{d}</option>)}</select></label></div>
    <div className="sheet" ref={sheetRef}>
      {ROWS.map(row => {
        const h = heights[row.key] ?? row.height;
        let content: ReactNode;
        let value: number | null | undefined;
        let sub: ReactNode = '記録なし';
        if (row.key === 'weight' || row.key === 'bodyFat') {
          const key = row.key;
          value = body.get(selected)?.[key];
          const change = sevenDayChange(dashboard.body, selected, key);
          sub = change === null ? '7日前と比較できません' : <>7日前から <b className={change > 0 ? 'up' : change < 0 ? 'down' : ''}>{change > 0 ? '+' : change < 0 ? '−' : '±'}{Math.abs(change).toFixed(row.digits)}</b></>;
          const pts = dates.flatMap((d, i) => { const v = body.get(d)?.[key]; return v == null ? [] : [{ x: x(i), v }]; });
          const lo = Math.min(...pts.map(p => p.v));
          const hi = Math.max(...pts.map(p => p.v));
          const pad = (hi - lo) * 0.2 || 0.5;
          const y = (v: number) => h - 10 - (v - lo + pad) / (hi - lo + 2 * pad) * (h - 20);
          const line = pts.map(p => `${p.x},${y(p.v)}`).join(' ');
          content = pts.length ? <>
            {[lo, hi].filter((v, i, a) => a.indexOf(v) === i).map(t => <g key={t}><line x1="0" x2={width} y1={y(t)} y2={y(t)} stroke="var(--grid)"/><text x="4" y={y(t) - 4}>{t.toFixed(1)}</text></g>)}
            <defs><linearGradient id={`fill-${key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={row.color} stopOpacity=".26"/><stop offset="1" stopColor={row.color} stopOpacity="0"/></linearGradient></defs>
            <polygon points={`${pts[0].x},${h} ${line} ${pts.at(-1)!.x},${h}`} fill={`url(#fill-${key})`}/>
            <polyline points={line} fill="none" stroke={row.color} strokeWidth="1.6" strokeLinejoin="round"/>
            {value != null && <circle cx={selectedX} cy={y(value)} r="3.5" fill={row.color} stroke="var(--card)" strokeWidth="2"/>}
          </> : <text x="8" y={h / 2}>記録なし</text>;
        } else if (row.key === 'sleep') {
          const record = sleep.get(selected);
          value = record?.hours;
          sub = record ? record.nightHours === null || record.napHours === null ? '合計のみ（内訳不明）' : `夜 ${record.nightHours}h ／ 昼寝 ${record.napHours}h` : '記録なし';
          const max = Math.max(11, ...dates.map(d => sleep.get(d)?.hours ?? 0));
          const y = (v: number) => h - 6 - v / max * (h - 12);
          content = <><line x1="0" x2={width} y1={y(7)} y2={y(7)} stroke="var(--faint)" strokeDasharray="3 3" opacity=".7"/><text x="4" y={y(7) - 4}>7h</text>{dates.map((d, i) => {
            const s = sleep.get(d);
            if (s?.hours == null) return null;
            const unknown = s.nightHours === null || s.napHours === null;
            return <g key={d}><rect data-strip-bar="sleep" x={x(i) - barWidth / 2} y={y(s.hours)} width={barWidth} height={y(0) - y(s.hours)} rx={radius} fill={unknown ? 'var(--sleep-unknown)' : 'var(--nap)'}/>{!unknown && <rect x={x(i) - barWidth / 2} y={y(s.nightHours!)} width={barWidth} height={y(0) - y(s.nightHours!)} rx={radius} fill="var(--sleep)"/>}</g>;
          })}</>;
        } else {
          value = day?.durationMinutes;
          sub = day ? <>{day.blocks.map(b => <span className="exercise-detail" key={b.record.recordKey}>{SPECIES_LABEL[b.record.species]}{b.record.durationMinutes === null ? ' —分' : ''}{b.record.distanceKm === null ? '' : ` ${b.record.distanceKm.toFixed(1)}km`}</span>)}{day.exercise.map((r, i) => <span className="exercise-detail" key={i}>{r.type}</span>)}</> : '運動なし';
          const visible = stacks.filter(d => dates.includes(d.date));
          const k = (h - 10 - barWidth) / Math.max(60, ...visible.map(d => d.height));
          const base = h - 5 - barWidth;
          content = <>{[30, 60].map(m => <line key={m} x1="0" x2={width} y1={base - m * k} y2={base - m * k} stroke="var(--grid)"/>)}{visible.map(d => {
            const cx = x(dates.indexOf(d.date));
            return <g key={d.date}>{d.blocks.map(b => <rect data-strip-bar="workout" key={b.record.recordKey} x={cx - barWidth / 2} y={base - (b.offset + b.size) * k} width={barWidth} height={Math.max(0.5, b.size * k - 1)} rx={radius} fill={SPECIES_COLOR[b.record.species]}><title>{`${d.date} ${SPECIES_LABEL[b.record.species]} ${metric(b.record.durationMinutes, 0)}分`}</title></rect>)}{d.exercise.length > 0 && <rect data-strip-bar="exercise" x={cx - barWidth / 2} y={h - 4 - barWidth} width={barWidth} height={barWidth} rx={radius} fill="var(--muted)"><title>{d.exercise.map(r => r.type).join('、')}</title></rect>}</g>;
          })}</>;
        }
        return <Fragment key={row.key}><div className="cell-label"><span className="name"><i style={{ background: row.color }}/>{row.name}</span><span className="value">{metric(value, row.digits)}{value != null && <small>{row.unit}</small>}</span><span className="sub">{sub}</span></div>
          <div className="cell-plot" style={{ minHeight: row.height }} data-row={row.key} onPointerMove={e => {
            const bounds = e.currentTarget.getBoundingClientRect();
            setCursor(dates[Math.max(0, Math.min(dates.length - 1, Math.floor((e.clientX - bounds.left) / bounds.width * dates.length)))]);
          }} onPointerDown={e => {
            const bounds = e.currentTarget.getBoundingClientRect();
            setCursor(dates[Math.max(0, Math.min(dates.length - 1, Math.floor((e.clientX - bounds.left) / bounds.width * dates.length)))]);
          }}>
            <svg height={h} preserveAspectRatio="none" viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`${row.name}の推移。選択日 ${selected}。${metric(value, row.digits)}${value == null ? '' : row.unit}`}>
              {dates.map((d, i) => d.endsWith('-01') ? <line key={d} x1={i * step} x2={i * step} y1="0" y2={h} stroke="var(--grid)"/> : null)}
              {content}<line className="shared-cursor" data-date={selected} x1={selectedX} x2={selectedX} y1="0" y2={h} stroke="var(--ink)" opacity=".35"/>
            </svg>
          </div></Fragment>;
      })}
      <div className="cell-axis"><svg height="24" viewBox={`0 0 ${width} 24`}>{dates.map((d, i) => {
        const dt = new Date(`${d}T00:00:00`);
        const show = period === 30 ? dt.getDay() === 1 : dt.getDate() === 1;
        return show && x(i) < width - 34 ? <text key={d} x={i * step + 4} y="16">{period === 30 ? `${dt.getMonth() + 1}/${dt.getDate()}` : `${dt.getMonth() + 1}月`}</text> : null;
      })}</svg></div>
    </div>
    <div className="strip-key" aria-label="グラフの凡例">{[['var(--sleep)', '夜'], ['var(--nap)', '昼寝'], ['var(--sleep-unknown)', '合計のみ'], ['var(--walk)', 'ウォーキング'], ['var(--run)', 'ジョギング'], ['var(--cycle)', '自転車'], ['var(--muted)', '運動記録']].map(([color, label]) => <span key={label}><i style={{ background: color }}/>{label}</span>)}</div>
  </article>;
}
