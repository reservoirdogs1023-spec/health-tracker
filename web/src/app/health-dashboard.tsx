'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { aggregateExerciseDays, buildHeatmapDays, filterByDays, localDateString, type HeatmapDay } from '../site/dashboard-model';
import type { HealthDashboard } from '../site/health-types';
import { workoutTotals, SPECIES_COLOR, SPECIES_LABEL } from '../site/flowsheet-model';
import { refreshDashboardWhenVisible } from '../site/resume-refresh';
import { Flowsheet } from './flowsheet';
import { ThemeToggle } from './theme-toggle';
import { PageNavigation } from './page-navigation';
import { readDashboard, saveHealthEntry } from '../backend';

const EMPTY_DASHBOARD: HealthDashboard = { body: [], sleep: [], exercise: [], workout: [] };
const TYPE_LABEL: Record<string, string> = {
  Walking: 'ウォーキング', Running: 'ジョギング', Cycling: '自転車',
};

export function HealthDashboardApp() {
  const [dashboard, setDashboard] = useState<HealthDashboard>(EMPTY_DASHBOARD);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [period, setPeriod] = useState<number | null>(90);
  const [heatmapSelection, setHeatmapSelection] = useState<HeatmapDay | null>(null);
  const [entryDate, setEntryDate] = useState(() => localDateString(new Date()));
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [nightHours, setNightHours] = useState('');
  const [napHours, setNapHours] = useState('0');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (matchMedia('(max-width: 600px)').matches) setPeriod(30);
  }, []);

  useEffect(() => {
    let active = true;
    const refreshDashboard = async (showLoading = true) => {
      if (showLoading) setStatus('loading');
      try {
        const data = await readDashboard();
        if (!active) return;
        setDashboard(data);
        setStatus('ready');
      } catch {
        if (active) setStatus('error');
      }
    };

    void refreshDashboard();
    const stopRefreshWhenVisible = refreshDashboardWhenVisible(
      document,
      () => refreshDashboard(false),
    );
    return () => {
      active = false;
      stopRefreshWhenVisible();
    };
  }, []);

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hasWeight = weight.trim() !== '';
    const hasBodyFat = bodyFat.trim() !== '';
    const hasSleep = nightHours.trim() !== ''
      || (napHours.trim() !== '' && Number(napHours) !== 0);
    if (!hasWeight && !hasBodyFat && !hasSleep) {
      setSaveStatus('error');
      setSaveMessage('体重、体脂肪率、または睡眠時間を入力してください。');
      return;
    }
    if (hasSleep && nightHours.trim() === '') {
      setSaveStatus('error');
      setSaveMessage('睡眠を記録する場合は、夜の睡眠時間も入力してください。');
      return;
    }

    setSaveStatus('saving');
    setSaveMessage('');
    try {
      await saveHealthEntry({
        date: entryDate,
        weight: hasWeight ? Number(weight) : null,
        bodyFat: hasBodyFat ? Number(bodyFat) : null,
        nightHours: hasSleep ? Number(nightHours) : null,
        napHours: hasSleep ? Number(napHours || 0) : null,
      });
      setDashboard(await readDashboard());
      setStatus('ready');
      setWeight('');
      setBodyFat('');
      setNightHours('');
      setNapHours('0');
      setSaveStatus('saved');
      setSaveMessage('保存しました。グラフへ反映済みです。');
    } catch {
      setSaveStatus('error');
      setSaveMessage('保存できませんでした。少し待ってからもう一度お試しください。');
    }
  }

  const filtered = useMemo(() => ({
    body: filterByDays(dashboard.body, period),
    sleep: filterByDays(dashboard.sleep, period),
    exercise: filterByDays(dashboard.exercise, period),
    workout: filterByDays(dashboard.workout, period),
  }), [dashboard, period]);

  const now = new Date();
  const year = now.getFullYear();
  const today = localDateString(now);
  const heatmap = useMemo(() => buildHeatmapDays(
    year,
    aggregateExerciseDays(dashboard.exercise, dashboard.workout, year),
  ), [dashboard.exercise, dashboard.workout, year]);
  const workoutSummary = workoutTotals(filtered.workout);
  const elapsedDays = heatmap.days.filter(day => day.date <= today);
  const yearActiveDays = elapsedDays.filter(day => day.count > 0).length;

  return (
    <main className="app-shell" data-health-tracker>
      <header className="topbar">
        <div className="title"><h1>Health Tracker</h1><span className="today">{now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</span></div>
        <PageNavigation page="body" />
        <div className="topbar-tools">
          <div className="period-control" aria-label="表示期間">
            {([30, 90, null] as const).map(value => (
              <button
                key={value ?? 'all'}
                type="button"
                className={period === value ? 'active' : ''}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {value === null ? '全期間' : `${value}日`}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </header>

      <section className="dashboard" aria-busy={status === 'loading'}>
        <p className={`data-status ${status}`} role="status">{status === 'loading' ? '読み込み中' : status === 'ready' ? '本人専用' : 'データを取得できません'}<button className="refresh-button" type="button" onClick={() => window.location.reload()}>最新の状態に更新</button></p>
        <form className="entry-panel" onSubmit={saveEntry}>
          <div className="entry-fields"><strong>今日の記録</strong>
            <label>
              <span>日付</span>
              <input
                type="date"
                value={entryDate}
                onChange={event => setEntryDate(event.target.value)}
                required
              />
            </label>
            <label>
              <span>体重 <small>kg</small></span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                max="500"
                step="0.01"
                placeholder="62.35"
                value={weight}
                onChange={event => setWeight(event.target.value)}
              />
            </label>
            <label>
              <span>体脂肪率 <small>%</small></span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.1"
                placeholder="18.4"
                value={bodyFat}
                onChange={event => setBodyFat(event.target.value)}
              />
            </label>
            <label>
              <span>夜 <small>h</small></span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="24"
                step="0.1"
                placeholder="6.5"
                aria-label="夜の睡眠 時間"
                value={nightHours}
                onChange={event => setNightHours(event.target.value)}
              />
            </label>
            <label>
              <span>昼寝 <small>h</small></span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="24"
                step="0.1"
                aria-label="昼寝 時間"
                value={napHours}
                onChange={event => setNapHours(event.target.value)}
              />
            </label>
            <button type="submit" disabled={saveStatus === 'saving' || entryDate === ''}>
              {saveStatus === 'saving' ? '保存中…' : '記録する'}
            </button>
          </div>
          <p className={`save-message ${saveStatus}`} aria-live="polite">
            {saveMessage || '体組成と睡眠は、片方だけでも保存できます。昼寝をしていない日は0のままで保存できます。'}
          </p>
        </form>

        {status === 'error' && <p className="locked-state" role="alert">記録を取得できませんでした。再読み込みしてお試しください。</p>}
        <Flowsheet dashboard={dashboard} period={period} today={today} />
        <section className="lower">
          <article className="panel heatmap-card">
            <h2>今年の運動</h2><p className="lead">ワークアウトと運動記録を数えます</p>
            <div className="big"><strong>{yearActiveDays}</strong><span>日 ／ 今年これまでの{elapsedDays.length}日</span></div>
            <Heatmap days={heatmap.days} weekCount={heatmap.weekCount} today={today} selected={heatmapSelection} onSelect={setHeatmapSelection} />
          </article>
          <article className="panel">
            <div className="panel-head"><h2>ワークアウト</h2><a className="link" href="#/run">ランのページへ →</a></div>
            <p className="lead">{period === null ? '全期間' : `直近${period}日`}の合計（Apple Health から）</p>
            <div className="totals"><div><span>合計時間</span><strong>{formatMinutes(workoutSummary.durationMinutes)}</strong></div><div><span>距離</span><strong>{workoutSummary.distanceKm === null ? '—' : <>{workoutSummary.distanceKm.toFixed(1)}<small>km</small></>}</strong></div><div><span>回数</span><strong>{workoutSummary.count}<small>回</small></strong></div></div>
            <div className="breakdown">{workoutSummary.species.map(item => <div className="br-row" key={item.species}><span className="br-name"><i style={{ background: SPECIES_COLOR[item.species] }}/>{SPECIES_LABEL[item.species]}</span><span className="br-bar"><b style={{ width: `${item.share ?? 0}%`, background: SPECIES_COLOR[item.species] }}/></span><span className="br-val">{formatMinutes(item.durationMinutes)}<small>{item.count}回{item.distanceKm === null ? '' : ` ／ ${item.distanceKm.toFixed(1)}km`}{item.share === null ? '' : ` · ${Math.round(item.share)}%`}</small></span></div>)}</div>
            <p className="totals-note">割合は時間が分かるワークアウトの合計から算出します。</p>
          </article>
        </section>
      </section>
    </main>
  );
}

function formatMinutes(value: number | null) {
  if (value === null) return '—';
  const minutes = Math.round(value);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60}分` : `${minutes}分`;
}

function Heatmap({
  days,
  weekCount,
  today,
  selected,
  onSelect,
}: {
  days: HeatmapDay[];
  weekCount: number;
  today: string;
  selected: HeatmapDay | null;
  onSelect: (day: HeatmapDay) => void;
}) {
  const detail = selected ? heatmapText(selected, today) : '日付を選ぶと種目別の内訳を表示します。';
  return (
    <>
      <div className="heatmap-scroll" aria-label="年間運動ヒートマップ。横にスクロールできます">
        <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${weekCount}, 12px)` }}>
          {days.map(day => (
            <button
              key={day.date}
              type="button"
              className={`heat-cell ${day.date > today ? 'future' : ''} ${selected?.date === day.date ? 'selected' : ''}`}
              data-level={Math.min(day.count, 3)}
              style={{ gridColumn: day.weekIndex + 1, gridRow: day.dayOfWeek + 1 }}
              title={heatmapText(day, today)}
              aria-label={heatmapText(day, today)}
              onFocus={() => onSelect(day)}
              onMouseEnter={() => onSelect(day)}
              onClick={() => onSelect(day)}
            />
          ))}
        </div>
      </div>
      <div className="heatmap-footer">
        <p aria-live="polite">{detail}</p>
        <div className="heat-legend" aria-label="運動回数の色の濃さ">
          <span>少</span>{[0, 1, 2, 3].map(level => <i key={level} data-level={level} />)}<span>多</span>
        </div>
      </div>
    </>
  );
}

function heatmapText(day: HeatmapDay, today: string): string {
  const date = new Date(`${day.date}T00:00:00`).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
  if (day.date > today) return `${date}：未到来`;
  if (day.count === 0) return `${date}：運動なし`;
  const detail = day.breakdown
    .map(item => `${TYPE_LABEL[item.type] ?? item.type} ${item.count}件`)
    .join('、');
  return `${date}：${day.count}件（${detail}）`;
}
