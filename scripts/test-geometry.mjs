import assert from 'node:assert/strict';
import { horizontalLabelPlacement, orthogonalPolylineSegments, orthogonalRouteOverlapScore, orthogonalRouteSegments, orthogonalSegmentData, segmentDataForControls } from '../src/geometry.js';
import { cappedExpansionZoom, centeredLayoutTranslations, compactSingleInputBranches, isolatedSiblingPlacements, isRedundantProxyPad, nonOverlappingSiblingOffsets, orderedBranchTranslations, overlapAwareLaneOffsets, padsShareFlowChannel, preferredPadId, projectedEdgeKey, siblingOrderAssignments, topRightBadgeTarget } from '../src/model.js';

const cases = [
  { source: { x: 0, y: 0 }, target: { x: 300, y: 140 }, ratio: 0.5 },
  { source: { x: 250, y: 180 }, target: { x: 40, y: -70 }, ratio: 0.42 },
  { source: { x: -20, y: 90 }, target: { x: 500, y: 10 }, ratio: 0.58 }
];

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

assert.equal(cappedExpansionZoom(0.5, 3), 0.9);
close(cappedExpansionZoom(0.8, 3), 1.2);
assert.equal(cappedExpansionZoom(1.1, 1.4), 1.4);
assert.deepEqual(
  orderedBranchTranslations([
    { id: 'video', order: 0, minY: 260, maxY: 380 },
    { id: 'audio', order: 1, minY: 40, maxY: 200 }
  ], 48),
  [{ id: 'video', dy: -220 }, { id: 'audio', dy: 168 }]
);
assert.deepEqual(
  orderedBranchTranslations([
    { id: 'video', order: 0, minY: 40, maxY: 160 },
    { id: 'audio', order: 1, minY: 220, maxY: 380 }
  ], 48),
  []
);

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

const backwardSource = { x: 300, y: 40 };
const backwardTarget = { x: 100, y: 180 };
const backwardControls = [
  { x: 322, y: 40 },
  { x: 322, y: 110 },
  { x: 78, y: 110 },
  { x: 78, y: 180 }
];
const backwardGeometry = segmentDataForControls(backwardSource, backwardTarget, backwardControls);
backwardGeometry.weights.forEach((weight, index) => {
  const dx = backwardTarget.x - backwardSource.x;
  const dy = backwardTarget.y - backwardSource.y;
  const length = Math.hypot(dx, dy);
  const x = backwardSource.x + weight * dx + backwardGeometry.distances[index] * -dy / length;
  const y = backwardSource.y + weight * dy + backwardGeometry.distances[index] * dx / length;
  close(x, backwardControls[index].x);
  close(y, backwardControls[index].y);
});
const backwardRoute = orthogonalPolylineSegments([backwardSource, ...backwardControls, backwardTarget]);
assert.equal(backwardRoute.horizontals.length, 3);
assert.equal(backwardRoute.verticals.length, 2);
assert.ok(backwardRoute.horizontals[0].end > backwardSource.x);
assert.ok(backwardRoute.horizontals.at(-1).start < backwardTarget.x);

const reserved = orthogonalRouteSegments({ x: 0, y: 0 }, { x: 200, y: 200 }, 0.5);
const overlapping = orthogonalRouteSegments({ x: 0, y: 40 }, { x: 200, y: 240 }, 0.5);
const separate = orthogonalRouteSegments({ x: 0, y: 40 }, { x: 200, y: 240 }, 0.7);
assert.ok(orthogonalRouteOverlapScore(overlapping, [reserved]) > orthogonalRouteOverlapScore(separate, [reserved]));

const clearLabel = horizontalLabelPlacement(
  { x: 0, y: 100 }, { x: 300, y: 200 }, .5, { width: 70, height: 12 },
  [{ x1: 20, y1: 105, x2: 130, y2: 140 }]
);
assert.equal(clearLabel.anchor, 'source');
assert.ok(clearLabel.marginY < 0);
const belowLabel = horizontalLabelPlacement(
  { x: 0, y: 100 }, { x: 300, y: 200 }, .5, { width: 70, height: 12 },
  [
    { x1: 20, y1: 70, x2: 130, y2: 99 },
    { x1: 170, y1: 170, x2: 280, y2: 199 }
  ]
);
assert.ok(belowLabel.marginY > 0);
const outsideBendLabel = horizontalLabelPlacement(
  { x: 0, y: 200 }, { x: 300, y: 100 }, .5, { width: 70, height: 12 }
);
assert.equal(outsideBendLabel.anchor, 'source');
assert.ok(outsideBendLabel.marginY > 0);

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
assert.deepEqual(
  overlapAwareLaneOffsets([
    { id: 'source', minX: 0, maxX: 200, minY: 100, maxY: 220, xOffset: 0 },
    { id: 'target', minX: 400, maxX: 900, minY: 120, maxY: 520, xOffset: 0 }
  ]),
  [{ id: 'source', offset: -56 }, { id: 'target', offset: -56 }]
);
assert.deepEqual(
  overlapAwareLaneOffsets([
    { id: 'first', minX: 0, maxX: 300, minY: 100, maxY: 220, xOffset: 0 },
    { id: 'second', minX: 100, maxX: 400, minY: 120, maxY: 240, xOffset: 0 }
  ], 80),
  [{ id: 'first', offset: -56 }, { id: 'second', offset: 124 }]
);
assert.deepEqual(
  nonOverlappingSiblingOffsets([
    { id: 'later', order: 2, x1: 50, x2: 250, y1: 80, y2: 180 },
    { id: 'first', order: 1, x1: 0, x2: 200, y1: 100, y2: 200 },
    { id: 'separate', order: 3, x1: 400, x2: 500, y1: 0, y2: 50 }
  ], 40, 10),
  [{ id: 'later', offset: 160 }]
);
assert.deepEqual(
  centeredLayoutTranslations(
    [
      { id: 'source', x1: 0, x2: 100, y1: 0, y2: 50 },
      { id: 'target', x1: 1900, x2: 2000, y1: 0, y2: 50 }
    ],
    [
      { id: 'source', x1: 0, x2: 100, y1: 0, y2: 50 },
      { id: 'target', x1: 200, x2: 300, y1: 0, y2: 50 }
    ]
  ),
  [
    { id: 'source', dx: 850, dy: 0 },
    { id: 'target', dx: -850, dy: 0 }
  ]
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

assert.deepEqual(
  compactSingleInputBranches([
    { id: 'tee', x1: 0, x2: 100, y1: 80, y2: 140 },
    { id: 'short-sink', x1: 200, x2: 320, y1: 0, y2: 50 },
    { id: 'parser-bin', x1: 1800, x2: 2200, y1: 180, y2: 300 },
    { id: 'encoder-bin', x1: 2600, x2: 3000, y1: 180, y2: 300 }
  ], [
    { source: 'tee', target: 'short-sink' },
    { source: 'tee', target: 'parser-bin' },
    { source: 'parser-bin', target: 'encoder-bin' }
  ], 100),
  [
    { id: 'parser-bin', dx: -1600 },
    { id: 'encoder-bin', dx: -1900 }
  ]
);

console.log('Validated orthogonal routing control points');
