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
