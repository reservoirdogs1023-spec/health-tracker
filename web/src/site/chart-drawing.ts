export type LineSeries = { color: string; values: Array<number | null> };
export type ChartPoint = { x: number; y: number };

export function tracePointLine(context: CanvasRenderingContext2D, points: ChartPoint[]) {
  if (points.length < 2) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach(point => context.lineTo(point.x, point.y));
  context.stroke();
}

export function drawLines(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  series: LineSeries[],
) {
  const padding = { x: 22, y: 18 };
  series.forEach(item => {
    const present = item.values.filter((value): value is number => value !== null);
    if (present.length === 0) return;
    const min = Math.min(...present);
    const max = Math.max(...present);
    const spread = max - min || 1;
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
    context.lineWidth = 2.5;
    const points = item.values.flatMap((value, index) => {
      if (value === null) return [];
      const x = padding.x + (index / Math.max(item.values.length - 1, 1)) * (width - padding.x * 2);
      const y = height - padding.y - ((value - min) / spread) * (height - padding.y * 2);
      return [{ x, y }];
    });

    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.stroke();

    points.forEach(point => {
      context.beginPath(); context.arc(point.x, point.y, 2.5, 0, Math.PI * 2); context.fill();
    });
  });
}
