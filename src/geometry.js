export function orthogonalSegmentData(source, target, turnRatio = 0.5) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1 || Math.abs(dy) < 1) return null;

  const ratio = Math.max(0, Math.min(1, Number.isFinite(turnRatio) ? turnRatio : 0.5));
  const length = Math.sqrt(lengthSquared);
  const turnX = source.x + dx * ratio;
  const controls = [{ x: turnX, y: source.y }, { x: turnX, y: target.y }];
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

export function orthogonalRouteSegments(source, target, turnRatio = 0.5) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(turnRatio) ? turnRatio : 0.5));
  const turnX = source.x + (target.x - source.x) * ratio;
  return {
    vertical: { x: turnX, start: Math.min(source.y, target.y), end: Math.max(source.y, target.y) },
    horizontals: [
      { y: source.y, start: Math.min(source.x, turnX), end: Math.max(source.x, turnX) },
      { y: target.y, start: Math.min(turnX, target.x), end: Math.max(turnX, target.x) }
    ]
  };
}

export function orthogonalRouteOverlapScore(route, reservedRoutes, clearance = 16) {
  const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  let score = 0;
  for (const reserved of reservedRoutes) {
    if (Math.abs(route.vertical.x - reserved.vertical.x) <= clearance) {
      const length = overlap(route.vertical, reserved.vertical);
      if (length > 1) score += 200 + length * 3;
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

export function horizontalLabelPlacement(source, target, turnRatio, labelSize, obstacles = [], occupied = [], gap = 7) {
  const turnX = source.x + (target.x - source.x) * Math.max(0, Math.min(1, turnRatio));
  const segments = Math.abs(target.y - source.y) < 1
    ? [{ anchor: 'source', x1: source.x, x2: target.x, y: source.y }]
    : [
        { anchor: 'source', x1: source.x, x2: turnX, y: source.y },
        { anchor: 'target', x1: turnX, x2: target.x, y: target.y }
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
      let score = Math.max(0, width + 12 - length) * 25 + (side > 0 ? 0.1 : 0);
      for (const obstacle of obstacles) if (intersects(box, obstacle)) score += 10000;
      for (const other of occupied) if (intersects(box, other)) score += 5000;
      candidates.push({ anchor: segment.anchor, offset: length / 2, marginY: side * (height / 2 + gap), box, score, length });
    }
  }

  return candidates.sort((a, b) => a.score - b.score || b.length - a.length)[0] || null;
}
