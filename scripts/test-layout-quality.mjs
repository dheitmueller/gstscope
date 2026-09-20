import assert from 'node:assert/strict';
import { auditLayout } from '../src/layout-quality.js';

const node = (id, x1, y1, x2, y2, options = {}) => ({
  id,
  label: id,
  kind: 'element',
  parent: '',
  ancestors: [],
  isParent: false,
  box: { x1, y1, x2, y2 },
  ...options
});

const edge = (id, sourceOwner, targetOwner, points, options = {}) => ({
  id,
  logicalId: id,
  label: id,
  sourceOwner,
  targetOwner,
  sourceParent: '',
  targetParent: '',
  points,
  ...options
});

const checks = result => new Set(result.violations.map(violation => violation.check));

const clean = auditLayout({
  nodes: [node('source', 0, 0, 80, 50), node('target', 220, 0, 300, 50)],
  edges: [edge('clean-edge', 'source', 'target', [{ x: 80, y: 25 }, { x: 220, y: 25 }])]
});
assert.equal(clean.passed, true);
assert.deepEqual(clean.counts, { error: 0, warning: 0 });

const overlap = auditLayout({
  nodes: [node('first', 0, 0, 100, 60), node('second', 80, 20, 180, 80)],
  edges: []
});
assert.equal(overlap.passed, false);
assert.ok(checks(overlap).has('sibling-overlap'));

const escapedChild = auditLayout({
  nodes: [
    node('bin', 0, 0, 200, 150, { kind: 'bin', isParent: true }),
    node('child', 160, 40, 240, 100, { parent: 'bin', ancestors: ['bin'] })
  ],
  edges: []
});
assert.ok(checks(escapedChild).has('containment'));

const obstructed = auditLayout({
  nodes: [
    node('source', 0, 0, 80, 50),
    node('obstacle', 120, 0, 200, 50),
    node('target', 240, 0, 320, 50)
  ],
  edges: [edge('blocked-edge', 'source', 'target', [{ x: 80, y: 25 }, { x: 240, y: 25 }])]
});
assert.equal(obstructed.passed, false);
assert.ok(checks(obstructed).has('route-through-node'));

const container = node('bin', 0, 0, 300, 200, { kind: 'bin', isParent: true });
const containedSource = node('source', 20, 70, 80, 120, { parent: 'bin', ancestors: ['bin'] });
const containedTarget = node('target', 220, 70, 280, 120, { parent: 'bin', ancestors: ['bin'] });
const excursion = auditLayout({
  nodes: [container, containedSource, containedTarget],
  edges: [edge('escaping-edge', 'source', 'target', [
    { x: 80, y: 95 }, { x: 100, y: 95 }, { x: 100, y: -30 }, { x: 200, y: -30 }, { x: 200, y: 95 }, { x: 220, y: 95 }
  ], { sourceParent: 'bin', targetParent: 'bin' })]
});
assert.equal(excursion.passed, false);
assert.ok(checks(excursion).has('container-excursion'));

const inefficient = auditLayout({
  nodes: [node('source', 0, 0, 80, 50), node('target', 300, 0, 380, 50)],
  edges: [edge('detour-edge', 'source', 'target', [
    { x: 80, y: 25 }, { x: 100, y: 25 }, { x: 100, y: 300 }, { x: 260, y: 300 }, { x: 260, y: 25 }, { x: 300, y: 25 }
  ])]
}, { maxTurnsSameScope: 3 });
assert.ok(checks(inefficient).has('route-detour'));
assert.ok(checks(inefficient).has('turn-count'));

const longGap = auditLayout({
  nodes: [node('source', 0, 0, 80, 50), node('target', 1800, 0, 1880, 50)],
  edges: [edge('long-edge', 'source', 'target', [{ x: 80, y: 25 }, { x: 1800, y: 25 }])]
});
assert.ok(checks(longGap).has('route-length'));
assert.ok(checks(longGap).has('connected-gap'));

const shared = auditLayout({
  nodes: [
    node('source-a', 0, 0, 80, 50), node('target-a', 300, 0, 380, 50),
    node('source-b', 0, 80, 80, 130), node('target-b', 300, 80, 380, 130)
  ],
  edges: [
    edge('edge-a', 'source-a', 'target-a', [{ x: 80, y: 25 }, { x: 180, y: 25 }, { x: 180, y: 105 }, { x: 300, y: 105 }, { x: 300, y: 25 }]),
    edge('edge-b', 'source-b', 'target-b', [{ x: 80, y: 105 }, { x: 300, y: 105 }])
  ]
});
assert.ok(checks(shared).has('shared-route'));

const sparseBin = auditLayout({
  nodes: [
    node('bin', 0, 0, 1000, 1000, { kind: 'bin', isParent: true }),
    node('tiny-child', 20, 20, 70, 70, { parent: 'bin', ancestors: ['bin'] })
  ],
  edges: []
});
assert.ok(checks(sparseBin).has('bin-density'));

const oversizedBin = auditLayout({
  nodes: [
    node('huge-bin', 0, 0, 2400, 1800, { kind: 'bin', isParent: true }),
    ...Array.from({ length: 4 }, (_, index) => node(`child-${index}`, 40 + index * 120, 40, 120 + index * 120, 90, {
      parent: 'huge-bin', ancestors: ['huge-bin']
    }))
  ],
  edges: []
});
assert.equal(oversizedBin.passed, false);
assert.ok(oversizedBin.violations.some(violation => violation.check === 'bin-density' && violation.severity === 'error'));

const distantBins = auditLayout({
  nodes: [
    node('source-bin', 0, 0, 200, 180, { kind: 'bin', isParent: true }),
    node('target-bin', 3000, 0, 3200, 180, { kind: 'bin', isParent: true })
  ],
  edges: [edge('far-container-edge', 'source-bin', 'target-bin', [{ x: 200, y: 90 }, { x: 3000, y: 90 }])]
});
assert.ok(distantBins.violations.some(violation =>
  violation.check === 'connected-container-gap' && violation.severity === 'error' &&
  violation.message.includes('source-bin → target-bin')));

const labelCollision = auditLayout({
  nodes: [
    node('element', 0, 0, 100, 60),
    node('label', 20, 20, 80, 40, { kind: 'edge-label' })
  ],
  edges: []
});
assert.ok(checks(labelCollision).has('label-node-overlap'));

console.log('Validated automated layout quality checks');
