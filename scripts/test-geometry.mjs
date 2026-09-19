import assert from 'node:assert/strict';
import { orthogonalRouteOverlapScore, orthogonalRouteSegments, orthogonalSegmentData } from '../src/geometry.js';
import { isolatedSiblingPlacements, isRedundantProxyPad, padsShareFlowChannel, preferredPadId, projectedEdgeKey, siblingOrderAssignments, topRightBadgeTarget } from '../src/model.js';

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

const reserved = orthogonalRouteSegments({ x: 0, y: 0 }, { x: 200, y: 200 }, 0.5);
const overlapping = orthogonalRouteSegments({ x: 0, y: 40 }, { x: 200, y: 240 }, 0.5);
const separate = orthogonalRouteSegments({ x: 0, y: 40 }, { x: 200, y: 240 }, 0.7);
assert.ok(orthogonalRouteOverlapScore(overlapping, [reserved]) > orthogonalRouteOverlapScore(separate, [reserved]));

const shared = { source: 'source', target: 'bin' };
const video = { ...shared, links: [{ sourcePad: 'video-src', sinkPad: 'video-sink' }] };
const audio = { ...shared, links: [{ sourcePad: 'audio-src', sinkPad: 'audio-sink' }] };
assert.notEqual(projectedEdgeKey(video), projectedEdgeKey(audio));
assert.equal(projectedEdgeKey(video), projectedEdgeKey({ ...video, links: [...video.links] }));

const aliasedPads = [{ id: 'proxypad9' }, { id: 'video_0' }];
const aliases = new Set(['proxypad9:video_0', 'video_0:proxypad9']);
const equivalent = (a, b) => a === b || aliases.has(`${a}:${b}`);
assert.equal(preferredPadId(aliasedPads, 'video_0', equivalent), 'video_0');
assert.equal(preferredPadId(aliasedPads, 'internal-video-src', (a, b) => a === 'video_0' && b === 'internal-video-src'), 'video_0');

const padMap = new Map([
  ['proxy', { id: 'proxy', name: 'proxypad37', element: 'bin' }],
  ['concrete', { id: 'concrete', name: 'video_0_0101:output0', element: 'bin' }],
  ['other', { id: 'other', name: 'proxypad99', element: 'other-bin' }]
]);
const padAliasMap = new Map([
  ['proxy', new Set(['concrete'])],
  ['concrete', new Set(['proxy'])],
  ['other', new Set(['concrete'])]
]);
assert.equal(isRedundantProxyPad(padMap.get('proxy'), padMap, padAliasMap), true);
assert.equal(isRedundantProxyPad(padMap.get('concrete'), padMap, padAliasMap), false);
assert.equal(isRedundantProxyPad(padMap.get('other'), padMap, padAliasMap), false);

assert.equal(
  padsShareFlowChannel(
    { name: 'sink_0', element: 'multiqueue' },
    { name: 'src_0', element: 'multiqueue' }
  ),
  true
);
assert.equal(
  padsShareFlowChannel(
    { name: 'sink_0', element: 'multiqueue' },
    { name: 'src_1', element: 'multiqueue' }
  ),
  false
);

assert.deepEqual(
  siblingOrderAssignments([
    { id: 'audio-concat', order: 3, y: 100 },
    { id: 'video-concat', order: 1, y: 220 }
  ]),
  [
    { id: 'video-concat', y: 100 },
    { id: 'audio-concat', y: 220 }
  ]
);
assert.deepEqual(
  isolatedSiblingPlacements([
    { id: 'conv', x: 200, y: 100, width: 100, height: 48, connected: true },
    { id: 'scale', x: 400, y: 100, width: 100, height: 48, connected: true },
    { id: 'identity', x: 40, y: 100, width: 80, height: 48, connected: false }
  ]),
  [{ id: 'identity', x: 190, y: 210 }]
);
assert.equal(
  topRightBadgeTarget([
    { id: 'playsink', x1: 0, y1: 0, x2: 500, y2: 300 },
    { id: 'vbin', x1: 200, y1: 100, x2: 480, y2: 280 }
  ], { x: 470, y: 110 }),
  'vbin'
);
assert.equal(
  topRightBadgeTarget([{ id: 'vbin', x1: 200, y1: 100, x2: 480, y2: 280 }], { x: 300, y: 110 }),
  null
);
assert.equal(
  padsShareFlowChannel(
    { name: 'sink', element: 'queue' },
    { name: 'src', element: 'queue' }
  ),
  true
);
assert.equal(
  padsShareFlowChannel(
    { name: 'sink_0', element: 'queue-a' },
    { name: 'src_0', element: 'queue-b' }
  ),
  false
);

console.log('Validated orthogonal routing control points');
