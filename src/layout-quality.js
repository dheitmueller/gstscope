const area = box => Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);

const intersection = (a, b, inset = 0) => {
  const x1 = Math.max(a.x1 + inset, b.x1 + inset);
  const y1 = Math.max(a.y1 + inset, b.y1 + inset);
  const x2 = Math.min(a.x2 - inset, b.x2 - inset);
  const y2 = Math.min(a.y2 - inset, b.y2 - inset);
  return x2 > x1 && y2 > y1 ? { x1, y1, x2, y2, area: (x2 - x1) * (y2 - y1) } : null;
};

const pointInside = (point, box, tolerance = 0) =>
  point.x >= box.x1 - tolerance && point.x <= box.x2 + tolerance &&
  point.y >= box.y1 - tolerance && point.y <= box.y2 + tolerance;

const normalizePoints = points => {
  const compact = [];
  for (const point of points || []) {
    const previous = compact.at(-1);
    if (!previous || Math.abs(previous.x - point.x) > .5 || Math.abs(previous.y - point.y) > .5) compact.push(point);
  }
  let changed = true;
  while (changed && compact.length > 2) {
    changed = false;
    for (let index = 1; index < compact.length - 1; index++) {
      const a = compact[index - 1], b = compact[index], c = compact[index + 1];
      const collinearX = Math.abs(a.x - b.x) < .5 && Math.abs(b.x - c.x) < .5;
      const collinearY = Math.abs(a.y - b.y) < .5 && Math.abs(b.y - c.y) < .5;
      if (!collinearX && !collinearY) continue;
      compact.splice(index, 1);
      changed = true;
      break;
    }
  }
  return compact;
};

const segmentsFor = points => {
  const normalized = normalizePoints(points);
  return normalized.slice(0, -1).map((a, index) => {
  const b = normalized[index + 1];
  return {
    a, b,
    vertical: Math.abs(a.x - b.x) < .5,
    horizontal: Math.abs(a.y - b.y) < .5,
    length: Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  };
  });
};

const segmentCrossesBox = (segment, box, inset = 3) => {
  const inner = { x1: box.x1 + inset, x2: box.x2 - inset, y1: box.y1 + inset, y2: box.y2 - inset };
  if (inner.x2 <= inner.x1 || inner.y2 <= inner.y1) return false;
  if (segment.vertical) {
    return segment.a.x > inner.x1 && segment.a.x < inner.x2 &&
      Math.max(segment.a.y, segment.b.y) > inner.y1 && Math.min(segment.a.y, segment.b.y) < inner.y2;
  }
  if (segment.horizontal) {
    return segment.a.y > inner.y1 && segment.a.y < inner.y2 &&
      Math.max(segment.a.x, segment.b.x) > inner.x1 && Math.min(segment.a.x, segment.b.x) < inner.x2;
  }
  return false;
};

const collinearOverlap = (a, b, tolerance = 3) => {
  if (a.vertical && b.vertical && Math.abs(a.a.x - b.a.x) <= tolerance) {
    return Math.max(0, Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) - Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)));
  }
  if (a.horizontal && b.horizontal && Math.abs(a.a.y - b.a.y) <= tolerance) {
    return Math.max(0, Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) - Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)));
  }
  return 0;
};

export function auditLayout(snapshot, overrides = {}) {
  const limits = {
    maxTurnsSameScope: 4,
    maxTurnsCrossScope: 6,
    maxDetourRatio: 2.5,
    minDetourPixels: 180,
    maxRouteLength: 1600,
    maxConnectedGap: 900,
    minSharedSegment: 80,
    minBinOccupancy: .08,
    minLargeBinArea: 250000,
    ...overrides
  };
  const violations = [];
  const add = (severity, check, message, details = {}) => violations.push({ severity, check, message, ...details });
  const graphNodes = snapshot.nodes.filter(node => node.kind !== 'pad' && node.kind !== 'edge-label' && node.kind !== 'bin-gutter');
  const leafNodes = graphNodes.filter(node => !node.isParent);
  const labels = snapshot.nodes.filter(node => node.kind === 'edge-label');
  const nodeById = new Map(graphNodes.map(node => [node.id, node]));

  const siblings = new Map();
  graphNodes.forEach(node => {
    const key = node.parent || '__root__';
    if (!siblings.has(key)) siblings.set(key, []);
    siblings.get(key).push(node);
  });
  siblings.forEach(nodes => {
    for (let left = 0; left < nodes.length; left++) for (let right = left + 1; right < nodes.length; right++) {
      const hit = intersection(nodes[left].box, nodes[right].box, 1);
      if (hit) add('error', 'sibling-overlap', `${nodes[left].label || nodes[left].id} overlaps ${nodes[right].label || nodes[right].id}`, {
        ids: [nodes[left].id, nodes[right].id], overlapArea: Math.round(hit.area)
      });
    }
  });

  graphNodes.forEach(node => {
    if (!node.parent || !nodeById.has(node.parent)) return;
    const parent = nodeById.get(node.parent);
    if (!pointInside({ x: node.box.x1, y: node.box.y1 }, parent.box, 2) || !pointInside({ x: node.box.x2, y: node.box.y2 }, parent.box, 2)) {
      add('error', 'containment', `${node.label || node.id} is outside ${parent.label || parent.id}`, { ids: [node.id, parent.id] });
    }
  });

  graphNodes.filter(node => node.isParent).forEach(bin => {
    const descendants = graphNodes.filter(node => !node.isParent && node.ancestors?.includes(bin.id));
    if (!descendants.length || area(bin.box) < limits.minLargeBinArea) return;
    const occupied = descendants.reduce((sum, node) => sum + area(node.box), 0);
    const ratio = occupied / area(bin.box);
    if (ratio < limits.minBinOccupancy) add('warning', 'bin-utilization', `${bin.label || bin.id} uses only ${(ratio * 100).toFixed(1)}% of its area`, {
      ids: [bin.id], occupancy: Number(ratio.toFixed(4)), binArea: Math.round(area(bin.box))
    });
  });

  const edgeMetrics = [];
  for (const edge of snapshot.edges) {
    const points = normalizePoints(edge.points);
    const segments = segmentsFor(points);
    if (points.length < 2 || !segments.length) continue;
    const routeLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    const directLength = Math.abs(points.at(-1).x - points[0].x) + Math.abs(points.at(-1).y - points[0].y);
    const detour = routeLength - directLength;
    const ratio = directLength > 1 ? routeLength / directLength : 1;
    const turns = Math.max(0, segments.length - 1);
    const sameScope = edge.sourceParent === edge.targetParent;
    const maxTurns = sameScope ? limits.maxTurnsSameScope : limits.maxTurnsCrossScope;
    const metric = { id: edge.id, logicalId: edge.logicalId, routeLength, directLength, detour, ratio, turns, segments };
    edgeMetrics.push(metric);

    if (turns > maxTurns) add('warning', 'turn-count', `${edge.label || edge.id} has ${turns} turns`, { ids: [edge.id], turns, maximum: maxTurns });
    if (detour > limits.minDetourPixels && ratio > limits.maxDetourRatio) add('warning', 'route-detour', `${edge.label || edge.id} is ${ratio.toFixed(1)}× the direct Manhattan distance`, {
      ids: [edge.id], routeLength: Math.round(routeLength), directLength: Math.round(directLength), ratio: Number(ratio.toFixed(2))
    });
    if (routeLength > limits.maxRouteLength) add('warning', 'route-length', `${edge.label || edge.id} is ${Math.round(routeLength)}px long`, { ids: [edge.id], routeLength: Math.round(routeLength) });
    if (directLength > limits.maxConnectedGap) add('warning', 'connected-gap', `${edge.label || edge.id} connects objects ${Math.round(directLength)}px apart`, { ids: [edge.id], directLength: Math.round(directLength) });

    const excluded = new Set([edge.sourceOwner, edge.targetOwner]);
    [edge.sourceOwner, edge.targetOwner].forEach(id => nodeById.get(id)?.ancestors?.forEach(ancestor => excluded.add(ancestor)));
    graphNodes.forEach(node => {
      if (excluded.has(node.id)) return;
      if (segments.some(segment => segmentCrossesBox(segment, node.box))) {
        add('error', 'route-through-node', `${edge.label || edge.id} crosses ${node.label || node.id}`, { ids: [edge.id, node.id] });
      }
    });

    const sourceAncestors = [edge.sourceOwner, ...(nodeById.get(edge.sourceOwner)?.ancestors || [])];
    const targetAncestors = new Set([edge.targetOwner, ...(nodeById.get(edge.targetOwner)?.ancestors || [])]);
    const common = sourceAncestors.find(id => targetAncestors.has(id));
    const commonNode = nodeById.get(common);
    if (commonNode && points.some(point => !pointInside(point, commonNode.box, 3))) {
      add('error', 'container-excursion', `${edge.label || edge.id} leaves and re-enters ${commonNode.label || commonNode.id}`, { ids: [edge.id, commonNode.id] });
    }
  }

  for (let left = 0; left < edgeMetrics.length; left++) for (let right = left + 1; right < edgeMetrics.length; right++) {
    const a = edgeMetrics[left], b = edgeMetrics[right];
    if (a.logicalId && a.logicalId === b.logicalId) continue;
    let longest = 0;
    a.segments.forEach(first => b.segments.forEach(second => { longest = Math.max(longest, collinearOverlap(first, second)); }));
    if (longest >= limits.minSharedSegment) add('warning', 'shared-route', `${a.id} and ${b.id} share ${Math.round(longest)}px of route`, {
      ids: [a.id, b.id], sharedLength: Math.round(longest)
    });
  }

  // Labels are expected to sit inside their containing bins. Only leaf-node
  // intersections obscure actual element content and therefore count here.
  labels.forEach(label => leafNodes.forEach(node => {
    if (intersection(label.box, node.box, 1)) add('warning', 'label-node-overlap', `A link label overlaps ${node.label || node.id}`, { ids: [label.id, node.id] });
  }));

  const counts = violations.reduce((result, violation) => {
    result[violation.severity] = (result[violation.severity] || 0) + 1;
    return result;
  }, { error: 0, warning: 0 });
  return {
    passed: counts.error === 0,
    counts,
    score: counts.error * 1000000 + counts.warning * 1000,
    violations: violations.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.check.localeCompare(b.check))
  };
}
