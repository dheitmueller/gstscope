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
