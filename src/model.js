export function projectedEdgeKey(edge) {
  const first = edge.links?.[0];
  const last = edge.links?.at(-1);
  return JSON.stringify([
    edge.source,
    edge.target,
    first?.sourcePad || '',
    last?.sinkPad || ''
  ]);
}
