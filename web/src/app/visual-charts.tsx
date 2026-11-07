'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { BodyRecord, SleepRecord, WorkoutRecord } from '../site/health-types';
import { aggregateWorkoutDays, type WorkoutFilter, type WorkoutSpecies } from '../site/dashboard-model';
import { tracePointLine } from '../site/chart-drawing';

type Plot = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Scale = { min: number; max: number; ticks: number[] };
type ChartTooltipItem = { label: string; value: string; color: string };
type ChartHit = { x: number; y: number; title: string; items: ChartTooltipItem[] };
const WORKOUT_TONE: Record<WorkoutSpecies, { top: string; bottom: string }> = {
  Walking: { top: '#8cb8d7', bottom: '#2f6698' },
  Running: { top: '#90c5aa', bottom: '#34745d' },
  Cycling: { top: '#e5c27f', bottom: '#b77a2e' },
};
const WORKOUT_NAME: Record<WorkoutSpecies, string> = {
  Walking: 'ウォーキング', Running: 'ジョギング', Cycling: '自転車',
};

export function LineChart({ records }: { records: BodyRecord[] }) {
  const sorted = [...records].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length === 0) return <p className="empty-chart body-empty">この期間の記録はありません</p>;
  const weight = metricSummary(sorted.map(record => record.weight));
  const bodyFat = metricSummary(sorted.map(record => record.bodyFat));

  return (
    <div className="body-combined">
      <div className="body-series-summary" aria-label="体組成グラフの見方">
        <BodySeriesSummary label="体重" axis="左軸" unit="kg" tone="weight" summary={weight} />
        <BodySeriesSummary label="体脂肪率" axis="右軸" unit="%" tone="body-fat" summary={bodyFat} />
      </div>
      <CanvasChart
        className="body-combined-stage"
        label="体重と体脂肪率の推移。左軸は体重、右軸は体脂肪率です"
        empty={weight.latest === null && bodyFat.latest === null}
        draw={(context, width, height) => drawBodyComposition(context, width, height, sorted)}
      />
    </div>
  );
}

function BodySeriesSummary({ label, axis, unit, tone, summary }: {
  label: string;
  axis: string;
  unit: string;
  tone: string;
  summary: { latest: number | null; delta: number | null };
}) {
  return (
    <div className={`body-series-card ${tone}`}>
      <div className="body-series-label">
        <i aria-hidden="true" />
        <span><strong>{label}</strong><small>{axis}</small></span>
      </div>
      <p><strong>{summary.latest === null ? '--' : summary.latest.toFixed(2)}</strong><span>{unit}</span></p>
      <small className="body-series-change">
        {summary.delta === null ? '期間内の変化 --' : `期間内 ${summary.delta > 0 ? '+' : ''}${summary.delta.toFixed(2)} ${unit}`}
      </small>
    </div>
  );
}

function metricSummary(values: Array<number | null>): { latest: number | null; delta: number | null } {
  const latest = [...values].reverse().find((value): value is number => value !== null) ?? null;
  const first = values.find((value): value is number => value !== null) ?? null;
  return { latest, delta: latest !== null && first !== null ? latest - first : null };
}

export function SleepChart({ records }: { records: SleepRecord[] }) {
  const sorted = [...records]
    .filter(record => record.hours !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  return (
    <CanvasChart label="睡眠時間の推移。縦軸は時間です" empty={sorted.length === 0}
      draw={(context, width, height) => drawSleepBars(context, width, height, sorted)} />
  );
}

export function WorkoutChart({ records, species }: { records: WorkoutRecord[]; species: WorkoutFilter }) {
  return (
    <CanvasChart
      key={species}
      className={species === 'All' ? 'daily-workout-chart' : ''}
      label={species === 'All'
        ? '1日ごとの種目別の積み上げ運動時間と合計距離。左軸は分、右軸はキロメートルです'
        : `${species}の1回ごとの時間と距離。左軸は分、右軸はキロメートルです`}
      empty={records.length === 0}
      draw={(context, width, height) => species === 'All'
        ? drawDailyWorkout(context, width, height, records)
        : drawWorkout(context, width, height, records, species)} />
  );
}

function CanvasChart({ label, empty, draw, className = '' }: {
  label: string;
  empty: boolean;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => ChartHit[];
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<ChartHit[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element || empty) return;
    const render = () => {
      const bounds = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      element.width = Math.max(1, Math.round(bounds.width * scale));
      element.height = Math.max(1, Math.round(bounds.height * scale));
      const context = element.getContext('2d');
      if (!context) return;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      hits.current = draw(context, bounds.width, bounds.height);
      setActiveIndex(current => current !== null && current >= hits.current.length ? null : current);
    };
    const observer = new ResizeObserver(render);
    observer.observe(element);
    render();
    return () => observer.disconnect();
  }, [draw, empty]);

  const selectNearest = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (hits.current.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const closest = hits.current.reduce((best, hit, index) => (
      Math.abs(hit.x - x) < Math.abs(hits.current[best].x - x) ? index : best
    ), 0);
    const spacing = hits.current.length > 1 ? bounds.width / (hits.current.length - 1) : bounds.width;
    setActiveIndex(Math.abs(hits.current[closest].x - x) <= Math.max(20, spacing / 2) ? closest : null);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (hits.current.length === 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') return setActiveIndex(null);
    if (event.key === 'Home') return setActiveIndex(0);
    if (event.key === 'End') return setActiveIndex(hits.current.length - 1);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    setActiveIndex(current => Math.min(hits.current.length - 1, Math.max(0, (current ?? hits.current.length - 1) + direction)));
  };
  const active = activeIndex === null ? null : hits.current[activeIndex] ?? null;
  const canvasWidth = canvas.current?.getBoundingClientRect().width ?? 0;
  // Keep the tooltip's full card inside the chart, including when the point is
  // near either edge or close to the top of the plot.
  const dailyWorkout = className === 'daily-workout-chart';
  const tooltipHalfWidth = dailyWorkout ? Math.min(125, canvasWidth / 2) : 92;
  const tooltipLeft = active ? Math.min(Math.max(active.x, tooltipHalfWidth), Math.max(tooltipHalfWidth, canvasWidth - tooltipHalfWidth)) : 0;
  const tooltipAbove = !dailyWorkout && (active ? active.y >= 150 : true);
  const tooltipTop = dailyWorkout ? 12 : active ? (tooltipAbove ? active.y : active.y + 10) : 0;

  return (
    <div className={`chart-stage ${className}`}>
      {empty && <p className="empty-chart">この期間の記録はありません</p>}
      {active && (
        <>
          <span className="chart-hover-guide" aria-hidden="true" style={{ left: active.x }} />
          <span className="chart-hover-point" aria-hidden="true" style={{
            left: active.x,
            top: active.y,
            '--hover-color': active.items[0]?.color ?? '#173f35',
          } as CSSProperties} />
          <div className={`chart-tooltip${tooltipAbove ? '' : ' below'}`} role="status" style={{ left: tooltipLeft, top: tooltipTop }}>
            <strong>{active.title}</strong>
            {active.items.map(item => (
              <span key={item.label}>
                <i aria-hidden="true" style={{ background: item.color }} />
                <span>{item.label}</span>
                <b>{item.value}</b>
              </span>
            ))}
          </div>
        </>
      )}
      <canvas
        ref={canvas}
        role="img"
        tabIndex={empty ? -1 : 0}
        aria-label={`${label}。マウスを合わせるか、タップすると数値を表示します。`}
        onPointerMove={selectNearest}
        onPointerDown={selectNearest}
        onPointerLeave={event => { if (event.pointerType === 'mouse') setActiveIndex(null); }}
        onFocus={() => { if (hits.current.length) setActiveIndex(current => current ?? hits.current.length - 1); }}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

function drawBodyComposition(context: CanvasRenderingContext2D, width: number, height: number, records: BodyRecord[]) {
  const weights = records.map(record => record.weight);
  const bodyFats = records.map(record => record.bodyFat);
  const hasWeights = weights.some(value => value !== null);
  const hasBodyFats = bodyFats.some(value => value !== null);
  const plot = makePlot(width, height, 46, 48, 18, 26);
  const weightScale = makeScale(weights, 4);
  const bodyFatScale = makeScale(bodyFats, 4);
  if (hasWeights) drawAxis(context, plot, weightScale, 'kg', 'left', 2, true, '#173f35');
  if (hasBodyFats) drawAxis(context, plot, bodyFatScale, '%', 'right', 2, !hasWeights, '#d96247');
  drawDateLabels(context, plot, records.map(record => record.date));

  const weightPoints = linePoints(plot, weights, weightScale);
  const bodyFatPoints = linePoints(plot, bodyFats, bodyFatScale);

  if (weightPoints.length) {
    const gradient = context.createLinearGradient(0, plot.top, 0, plot.bottom);
    gradient.addColorStop(0, 'rgba(23,63,53,.16)');
    gradient.addColorStop(1, 'rgba(23,63,53,0)');
    context.beginPath();
    context.moveTo(weightPoints[0].x, plot.bottom);
    weightPoints.forEach(point => context.lineTo(point.x, point.y));
    context.lineTo(weightPoints[weightPoints.length - 1].x, plot.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
  }

  drawLineSeries(context, weightPoints, '#173f35', false);
  drawLineSeries(context, bodyFatPoints, '#d96247', true);

  return records.flatMap((record, index) => record.weight === null && record.bodyFat === null ? [] : [{
    x: pointX(plot, index, records.length),
    y: Math.max(plot.top + 8, Math.min(
      record.weight === null ? plot.bottom : pointY(plot, record.weight, weightScale),
      record.bodyFat === null ? plot.bottom : pointY(plot, record.bodyFat, bodyFatScale),
    ) - 8),
    title: longDate(records[index].date),
    items: [
      ...(record.weight === null ? [] : [{ label: '体重', value: `${record.weight.toFixed(2)} kg`, color: '#173f35' }]),
      ...(record.bodyFat === null ? [] : [{ label: '体脂肪率', value: `${record.bodyFat.toFixed(2)} %`, color: '#d96247' }]),
    ],
  }]);
}

function linePoints(plot: Plot, values: Array<number | null>, scale: Scale) {
  return values.flatMap((value, index) => value === null ? [] : [{
    x: pointX(plot, index, values.length), y: pointY(plot, value, scale),
  }]);
}

function drawLineSeries(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>,
  color: string, dashed: boolean) {
  if (points.length === 0) return;
  context.save();
  context.beginPath();
  points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.strokeStyle = color;
  context.lineWidth = dashed ? 2.4 : 2.8;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.setLineDash(dashed ? [1, 2.5] : []);
  context.stroke();
  context.setLineDash([]);
  points.forEach((point, index) => {
    const isLatest = index === points.length - 1;
    context.beginPath();
    context.arc(point.x, point.y, isLatest ? 4 : 2.4, 0, Math.PI * 2);
    context.fillStyle = isLatest ? '#fffdf8' : color;
    context.fill();
    if (isLatest) { context.strokeStyle = color; context.lineWidth = 2.5; context.stroke(); }
  });
  context.restore();
}

function drawSleepBars(context: CanvasRenderingContext2D, width: number, height: number, records: SleepRecord[]) {
  const scale = makeZeroScale(Math.max(8, ...records.map(record => record.hours ?? 0)), 4);
  const plot = makePlot(width, height, 32, 10, 12, 24);
  drawAxis(context, plot, scale, 'h', 'left', 0);
  drawDateLabels(context, plot, records.map(record => record.date));
  const slot = plot.width / Math.max(records.length, 1);
  const bar = Math.max(3, Math.min(17, slot * 0.58));
  records.forEach((record, index) => {
    const x = plot.left + index * slot + (slot - bar) / 2;
    if (record.nightHours !== null && record.napHours !== null) {
      const nightHeight = plot.bottom - pointY(plot, record.nightHours, scale);
      const napHeight = (record.napHours / scale.max) * plot.height;
      fillRoundedBar(context, x, plot.bottom - nightHeight, bar, nightHeight, '#4278a8');
      fillRoundedBar(context, x, plot.bottom - nightHeight - napHeight, bar, napHeight, '#98c2ad');
    } else if (record.hours !== null) {
      const totalHeight = plot.bottom - pointY(plot, record.hours, scale);
      fillRoundedBar(context, x, plot.bottom - totalHeight, bar, totalHeight, '#c7cbc8');
    }
  });
  return records.map((record, index) => {
    const hasBreakdown = record.nightHours !== null && record.napHours !== null;
    const total = record.hours ?? 0;
    return {
      x: plot.left + index * slot + slot / 2,
      y: Math.max(plot.top + 8, pointY(plot, total, scale) - 8),
      title: longDate(record.date),
      items: hasBreakdown ? [
        { label: '合計睡眠', value: formatHours(total), color: '#173f35' },
        { label: '夜の睡眠', value: formatHours(record.nightHours as number), color: '#4278a8' },
        { label: '昼寝', value: formatHours(record.napHours as number), color: '#98c2ad' },
      ] : [
        { label: '合計のみ', value: formatHours(total), color: '#9da5a1' },
      ],
    };
  });
}

function drawDailyWorkout(context: CanvasRenderingContext2D, width: number, height: number,
  records: WorkoutRecord[]): ChartHit[] {
  const days = aggregateWorkoutDays(records);
  const durationScale = makeZeroScale(Math.max(1, ...days.map(day => day.durationMinutes ?? 0)), 4);
  const distanceScale = makeZeroScale(Math.max(1, ...days.map(day => day.distanceKm ?? 0)), 4);
  const showDistance = days.some(day => day.distanceKm !== null);
  const plot = makePlot(width, height, 36, showDistance ? 36 : 10, 12, 24);
  drawAxis(context, plot, durationScale, '分', 'left', 0, true, '#4278a8');
  if (showDistance) drawAxis(context, plot, distanceScale, 'km', 'right', 1, false, '#d96247');
  drawDateLabels(context, plot, days.map(day => day.date), true);
  const slot = plot.width / Math.max(days.length, 1);
  const bar = Math.max(4, Math.min(25, slot * 0.62));
  const distancePoints = days.map((day, index) => day.distanceKm === null ? null : {
    x: plot.left + index * slot + slot / 2,
    y: pointY(plot, day.distanceKm, distanceScale),
  });
  days.forEach((day, index) => {
    const x = plot.left + index * slot + slot / 2;
    let duration = 0;
    for (const segment of day.breakdown) {
      if (segment.durationMinutes === null) continue;
      const bottom = pointY(plot, duration, durationScale);
      duration += segment.durationMinutes;
      const top = pointY(plot, duration, durationScale);
      const tone = WORKOUT_TONE[segment.species];
      const gradient = context.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, tone.top);
      gradient.addColorStop(1, tone.bottom);
      context.fillStyle = gradient;
      context.fillRect(x - bar / 2, top, bar, bottom - top);
    }
  });
  if (showDistance) drawWorkoutLine(context, distancePoints);
  const metric = (value: number | null, digits: number, unit: string) =>
    value === null ? '未記録' : `${Number(value.toFixed(digits))} ${unit}`;
  return days.map((day, index) => ({
    x: plot.left + index * slot + slot / 2,
    y: Math.max(plot.top + 8, Math.min(
      day.durationMinutes === null ? plot.bottom : pointY(plot, day.durationMinutes, durationScale),
      distancePoints[index]?.y ?? plot.bottom,
    ) - 8),
    title: longDate(day.date),
    items: [
      { label: '合計時間', value: metric(day.durationMinutes, 1, '分'), color: '#4278a8' },
      { label: '合計距離', value: metric(day.distanceKm, 2, 'km'), color: '#e26f52' },
      ...day.breakdown.map(segment => ({
        label: WORKOUT_NAME[segment.species],
        value: `${metric(segment.durationMinutes, 1, '分')} / ${metric(segment.distanceKm, 2, 'km')}`,
        color: WORKOUT_TONE[segment.species].bottom,
      })),
    ],
  }));
}

function drawWorkout(context: CanvasRenderingContext2D, width: number, height: number,
  records: WorkoutRecord[], species: WorkoutFilter) {
  const durationScale = makeZeroScale(Math.max(1, ...records.map(record => record.durationMinutes ?? 0)), 4);
  const distanceScale = makeZeroScale(Math.max(1, ...records.map(record => record.distanceKm ?? 0)), 4);
  const showDistance = species !== 'Cycling' && records.some(record => record.distanceKm !== null);
  const plot = makePlot(width, height, 36, showDistance ? 36 : 10, 12, 24);
  drawAxis(context, plot, durationScale, '分', 'left', 0, true, '#4278a8');
  if (showDistance) drawAxis(context, plot, distanceScale, 'km', 'right', 1, false, '#d96247');
  drawDateLabels(context, plot, records.map(record => record.date));

  const slot = plot.width / Math.max(records.length, 1);
  const bar = Math.max(4, Math.min(21, slot * 0.62));
  const latestDurationIndex = records.findLastIndex(record => record.durationMinutes !== null);
  const distancePoints: Array<{ x: number; y: number } | null> = [];
  records.forEach((record, index) => {
    const x = plot.left + index * slot + slot / 2;
    if (record.durationMinutes !== null) {
      const tone = WORKOUT_TONE[record.species];
      const barGradient = context.createLinearGradient(0, plot.top, 0, plot.bottom);
      barGradient.addColorStop(0, tone.top);
      barGradient.addColorStop(1, tone.bottom);
      const barHeight = plot.bottom - pointY(plot, record.durationMinutes, durationScale);
      context.save();
      context.shadowColor = `${tone.bottom}33`;
      context.shadowBlur = 7;
      context.shadowOffsetY = 3;
      fillRoundedBar(context, x - bar / 2, plot.bottom - barHeight, bar, barHeight, barGradient);
      context.restore();
      if (index === latestDurationIndex) {
        context.beginPath();
        context.roundRect(x - bar / 2, plot.bottom - barHeight, bar, barHeight, Math.min(bar / 2, 4));
        context.strokeStyle = tone.bottom;
        context.lineWidth = 1.5;
        context.stroke();
      }
    }
    distancePoints.push(showDistance && record.distanceKm !== null
      ? { x, y: pointY(plot, record.distanceKm, distanceScale) } : null);
  });
  if (showDistance) {
    drawWorkoutLine(context, species === 'All'
      ? distancePoints.filter((point): point is { x: number; y: number } => point !== null)
      : distancePoints);
  }
  return records.map((record, index) => {
    const distancePoint = distancePoints[index];
    const durationY = record.durationMinutes === null ? plot.bottom : pointY(plot, record.durationMinutes, durationScale);
    return {
      x: plot.left + index * slot + slot / 2,
      y: Math.max(plot.top + 8, Math.min(durationY, distancePoint?.y ?? plot.bottom) - 8),
      title: `${longDate(record.date)}${record.time ? ` ${record.time}` : ''}`,
      items: [
        { label: '種目', value: WORKOUT_NAME[record.species], color: WORKOUT_TONE[record.species].bottom },
        ...(record.durationMinutes === null ? [] : [{ label: '運動時間', value: `${Number(record.durationMinutes.toFixed(1))} 分`, color: WORKOUT_TONE[record.species].bottom }]),
        ...(record.distanceKm === null ? [] : [{ label: '距離', value: `${Number(record.distanceKm.toFixed(2))} km`, color: '#e26f52' }]),
        ...(record.caloriesKcal === null ? [] : [{ label: '消費', value: `${Number(record.caloriesKcal.toFixed(0))} kcal`, color: '#c08a38' }]),
      ],
    };
  });
}

function drawWorkoutLine(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number } | null>) {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  points.forEach((point, index) => {
    if (!point) return;
    const previousIndex = index - 1;
    if (previousIndex < 0 || points[previousIndex] === null) segments.push([]);
    segments[segments.length - 1].push(point);
  });
  context.save();
  context.strokeStyle = '#e26f52';
  context.lineWidth = 2.5;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  segments.forEach(segment => tracePointLine(context, segment));
  const present = points.filter((point): point is { x: number; y: number } => point !== null);
  present.forEach((point, index) => {
    const latest = index === present.length - 1;
    if (latest) {
      context.beginPath();
      context.arc(point.x, point.y, 7, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(226,111,82,.24)';
      context.lineWidth = 4;
      context.stroke();
    }
    context.beginPath();
    context.arc(point.x, point.y, latest ? 4.2 : 3, 0, Math.PI * 2);
    context.fillStyle = '#fffdf8';
    context.fill();
    context.strokeStyle = '#e26f52';
    context.lineWidth = 2;
    context.stroke();
  });
  context.restore();
}

function makePlot(width: number, height: number, leftPadding: number, rightPadding: number,
  topPadding: number, bottomPadding: number): Plot {
  return { left: leftPadding, right: width - rightPadding, top: topPadding, bottom: height - bottomPadding,
    width: width - leftPadding - rightPadding, height: height - topPadding - bottomPadding };
}

function makeScale(values: Array<number | null>, tickCount: number): Scale {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return { min: 0, max: 1, ticks: [0, .33, .67, 1] };
  const rawMin = Math.min(...present);
  const rawMax = Math.max(...present);
  const rawSpread = rawMax - rawMin;
  const padding = rawSpread === 0 ? Math.max(Math.abs(rawMax) * .02, 1) : rawSpread * .16;
  const min = rawMin - padding;
  const max = rawMax + padding;
  return { min, max, ticks: Array.from({ length: tickCount }, (_, index) => min + ((max - min) * index) / (tickCount - 1)) };
}

function makeZeroScale(rawMax: number, tickCount: number): Scale {
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const halfMagnitude = magnitude / 2;
  const step = Math.max(halfMagnitude, Math.ceil(rawMax / (tickCount - 1) / halfMagnitude) * halfMagnitude);
  const max = step * (tickCount - 1);
  return { min: 0, max, ticks: Array.from({ length: tickCount }, (_, index) => step * index) };
}

function drawAxis(context: CanvasRenderingContext2D, plot: Plot, scale: Scale, unit: string,
  side: 'left' | 'right', digits: number, drawGrid = true, labelColor = '#7b8781') {
  context.font = '600 9px Inter, ui-sans-serif, sans-serif';
  context.textBaseline = 'middle';
  context.textAlign = side === 'left' ? 'right' : 'left';
  scale.ticks.forEach(tick => {
    const y = pointY(plot, tick, scale);
    if (drawGrid) {
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.strokeStyle = '#e8e4da';
      context.lineWidth = 1;
      context.stroke();
    }
    context.fillStyle = labelColor;
    const value = Math.abs(tick) >= 100 && digits !== 2 ? tick.toFixed(0) : tick.toFixed(digits);
    context.fillText(`${Number(value)}${unit}`, side === 'left' ? plot.left - 7 : plot.right + 7, y);
  });
}

function drawDateLabels(context: CanvasRenderingContext2D, plot: Plot, dates: string[], centeredSlots = false) {
  if (dates.length === 0) return;
  const indexes = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
  context.font = '600 9px Inter, ui-sans-serif, sans-serif';
  context.fillStyle = '#8e9893';
  context.textBaseline = 'bottom';
  indexes.forEach((index, labelIndex) => {
    context.textAlign = centeredSlots ? 'center' : labelIndex === 0 ? 'left' : labelIndex === indexes.length - 1 ? 'right' : 'center';
    const x = centeredSlots ? plot.left + (index + .5) * plot.width / dates.length : pointX(plot, index, dates.length);
    context.fillText(shortDate(dates[index]), x, plot.bottom + 20);
  });
}

function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function longDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric', weekday: 'short',
  });
}

function formatHours(value: number): string {
  return `${Number(value.toFixed(1))} 時間`;
}

function pointX(plot: Plot, index: number, length: number): number {
  return plot.left + (index / Math.max(length - 1, 1)) * plot.width;
}

function pointY(plot: Plot, value: number, scale: Scale): number {
  return plot.bottom - ((value - scale.min) / Math.max(scale.max - scale.min, 1)) * plot.height;
}

function fillRoundedBar(context: CanvasRenderingContext2D, x: number, y: number,
  width: number, height: number, color: string | CanvasGradient) {
  if (height <= 0) return;
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(width / 2, 4));
  context.fillStyle = color;
  context.fill();
}
