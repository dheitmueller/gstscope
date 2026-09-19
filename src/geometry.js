export function orthogonalSegmentData(source, target, turnRatio = 0.5) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1 || Math.abs(dy) < 1) return null;

  const ratio = Math.max(0, Math.min(1, Number.isFinite(turnRatio) ? turnRatio : 0.5));
  const turnX = source.x + dx * ratio;
  const controls = [{ x: turnX, y: source.y }, { x: turnX, y: target.y }];
  return segmentDataForControls(source, target, controls);
}

export function segmentDataForControls(source, target, controls = []) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1) return null;
  const length = Math.sqrt(lengthSquared);
  const weights = [];
  const distances = [];

  for (const point of controls) {
    const px = point.x - source.x;
    const py = point.y - source.y;
    weights.push((px * dx + py * dy) / lengthSquared);
    distances.push((px * -dy + py * dx) / length);
  }

  return { weights, distances, controls };
}

export function orthogonalPolylineSegments(points = []) {
  const verticals = [];
  const horizontals = [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index], b = points[index + 1];
    if (Math.abs(a.x - b.x) < 1) verticals.push({ x: a.x, start: Math.min(a.y, b.y), end: Math.max(a.y, b.y) });
    else if (Math.abs(a.y - b.y) < 1) horizontals.push({ y: a.y, start: Math.min(a.x, b.x), end: Math.max(a.x, b.x) });
  }
  return { verticals, horizontals, vertical: verticals[0] || { x: 0, start: 0, end: 0 } };
}

export function orthogonalRouteSegments(source, target, turnRatio = 0.5) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(turnRatio) ? turnRatio : 0.5));
  const turnX = source.x + (target.x - source.x) * ratio;
  return orthogonalPolylineSegments([
    source,
    { x: turnX, y: source.y },
    { x: turnX, y: target.y },
    target
  ]);
}

export function orthogonalRouteOverlapScore(route, reservedRoutes, clearance = 16) {
  const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  let score = 0;
  for (const reserved of reservedRoutes) {
    for (const vertical of route.verticals || [route.vertical]) {
      for (const otherVertical of reserved.verticals || [reserved.vertical]) {
        if (Math.abs(vertical.x - otherVertical.x) > clearance) continue;
        const length = overlap(vertical, otherVertical);
        if (length > 1) score += 200 + length * 3;
      }
    }
    for (const horizontal of route.horizontals) {
      for (const other of reserved.horizontals) {
        if (Math.abs(horizontal.y - other.y) > clearance) continue;
        const length = overlap(horizontal, other);
        if (length > 1) score += 2 + length / 100;
      }
    }
  }
  return score;
}

export function horizontalLabelPlacement(source, target, turnRatio, labelSize, obstacles = [], occupied = [], routes = [], gap = 7) {
  const turnX = source.x + (target.x - source.x) * Math.max(0, Math.min(1, turnRatio));
  const segments = Math.abs(target.y - source.y) < 1
    ? [{ anchor: 'source', x1: source.x, x2: target.x, y: source.y, outsideSide: -1 }]
    : [
        { anchor: 'source', x1: source.x, x2: turnX, y: source.y, outsideSide: Math.sign(source.y - target.y) },
        { anchor: 'target', x1: turnX, x2: target.x, y: target.y, outsideSide: Math.sign(target.y - source.y) }
      ];
  const width = Math.max(1, labelSize.width);
  const height = Math.max(1, labelSize.height);
  const intersects = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  const candidates = [];

  for (const segment of segments) {
    const length = Math.abs(segment.x2 - segment.x1);
    const centerX = (segment.x1 + segment.x2) / 2;
    for (const side of [-1, 1]) {
      const centerY = segment.y + side * (height / 2 + gap);
      const box = { x1: centerX - width / 2, x2: centerX + width / 2, y1: centerY - height / 2, y2: centerY + height / 2 };
      let score = Math.max(0, width + 12 - length) * 25 + (side === segment.outsideSide ? 0 : 50);
      for (const obstacle of obstacles) if (intersects(box, obstacle)) score += 10000;
      for (const other of occupied) if (intersects(box, other)) score += 5000;
      for (const route of routes) {
        for (const vertical of route.verticals || [route.vertical]) {
          const verticalHit = vertical.x >= box.x1 - 10 && vertical.x <= box.x2 + 10 && vertical.end >= box.y1 && vertical.start <= box.y2;
          if (verticalHit) score += 3000;
        }
        for (const horizontal of route.horizontals) {
          const horizontalHit = horizontal.y >= box.y1 - 3 && horizontal.y <= box.y2 + 3 && horizontal.end >= box.x1 && horizontal.start <= box.x2;
          if (horizontalHit) score += 3000;
        }
      }
      candidates.push({ anchor: segment.anchor, offset: length / 2, marginY: side * (height / 2 + gap), box, score, length });
    }
  }

  return candidates.sort((a, b) => a.score - b.score || b.length - a.length)[0] || null;
}
