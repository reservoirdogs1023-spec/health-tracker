'use client';

import { useState, type PointerEvent, type ReactNode } from 'react';

type HoverPoint = { key: string; x: number; y: number; value: string };

export function ChartHover({ label, color, points, children }: {
  label: string; color: string; points: HoverPoint[]; children: ReactNode;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = points.find(point => point.key === activeKey);
  const select = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * 600 / bounds.width;
    const y = (event.clientY - bounds.top) * 210 / bounds.height;
    if (x < 44 || x > 574 || y < 24 || y > 174) return setActiveKey(null);
    const nearest = points.reduce<HoverPoint | null>((best, point) =>
      !best || Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, null);
    setActiveKey(nearest?.key ?? null);
  };
  return <div className="run-chart-stage" role="group" aria-label={`${label}の数値表示。マウスを合わせるかタップ、左右キーで選択できます。`}
    tabIndex={points.length ? 0 : -1}
    onPointerMove={select} onPointerDown={select}
    onPointerLeave={event => { if (event.pointerType === 'mouse') setActiveKey(null); }}
    onFocus={() => setActiveKey(current => current ?? points.at(-1)?.key ?? null)} onBlur={() => setActiveKey(null)}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key) || !points.length) return;
      event.preventDefault();
      if (event.key === 'Escape') return setActiveKey(null);
      const current = points.findIndex(point => point.key === activeKey);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1
        : Math.max(0, Math.min(points.length - 1, (current < 0 ? points.length - 1 : current) + (event.key === 'ArrowRight' ? 1 : -1)));
      setActiveKey(points[index].key);
    }}>
    {children}
    {active && <>
      <span className="chart-hover-guide" aria-hidden="true" style={{ left: `${active.x / 6}%` }} />
      <div className="chart-tooltip below run-chart-tooltip" role="status" style={{ left: `clamp(min(110px, 50%), ${active.x / 6}%, max(50%, calc(100% - 110px)))` }}>
        <strong>{active.key}</strong>
        <span><i aria-hidden="true" style={{ background: color }} /><span>{label}</span><b>{active.value}</b></span>
      </div>
    </>}
  </div>;
}
