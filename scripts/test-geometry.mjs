import assert from 'node:assert/strict';
import { orthogonalSegmentData } from '../src/geometry.js';

const cases = [
  { source: { x: 0, y: 0 }, target: { x: 300, y: 140 }, ratio: 0.5 },
  { source: { x: 250, y: 180 }, target: { x: 40, y: -70 }, ratio: 0.42 },
  { source: { x: -20, y: 90 }, target: { x: 500, y: 10 }, ratio: 0.58 }
];

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

for (const { source, target, ratio } of cases) {
  const result = orthogonalSegmentData(source, target, ratio);
  assert.ok(result);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);
  result.weights.forEach((weight, index) => {
    const distance = result.distances[index];
    const x = source.x + weight * dx + distance * -dy / length;
    const y = source.y + weight * dy + distance * dx / length;
    close(x, result.controls[index].x);
    close(y, result.controls[index].y);
  });
  close(result.controls[0].y, source.y);
  close(result.controls[1].y, target.y);
  close(result.controls[0].x, result.controls[1].x);
}

assert.equal(orthogonalSegmentData({ x: 0, y: 0 }, { x: 200, y: 0 }), null);
assert.equal(orthogonalSegmentData({ x: 5, y: 5 }, { x: 5, y: 5 }), null);

console.log('Validated orthogonal routing control points');
