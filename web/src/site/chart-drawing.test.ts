import { test } from 'node:test';
import assert from 'node:assert/strict';

import { drawLines, tracePointLine } from './chart-drawing.ts';

test('体組成の片側が未記録の日も、同じ系列の前後の点を線で結ぶ', () => {
  const commands: string[] = [];
  const linePoints: number[] = [];
  const context = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    beginPath: () => commands.push('beginPath'),
    moveTo: (x: number) => { commands.push('moveTo'); linePoints.push(x); },
    lineTo: (x: number) => { commands.push('lineTo'); linePoints.push(x); },
    stroke: () => commands.push('stroke'),
    arc: () => commands.push('arc'),
    fill: () => commands.push('fill'),
  } as unknown as CanvasRenderingContext2D;

  drawLines(context, 300, 180, [{ color: '#173f35', values: [63.1, null, 62.8] }]);

  assert.equal(commands.filter(command => command === 'lineTo').length, 1);
  assert.deepEqual(linePoints, [22, 278]);
});

test('ワークアウトの折れ線はすべての表示ポイントを正確に通る', () => {
  const endpoints: Array<[number, number]> = [];
  const context = {
    beginPath: () => {},
    moveTo: (x: number, y: number) => endpoints.push([x, y]),
    lineTo: (x: number, y: number) => endpoints.push([x, y]),
    stroke: () => {},
  } as unknown as CanvasRenderingContext2D;
  const points = [{ x: 0, y: 10 }, { x: 10, y: 2 }, { x: 20, y: 8 }];

  tracePointLine(context, points);

  assert.deepEqual(endpoints, points.map(point => [point.x, point.y]));
});
