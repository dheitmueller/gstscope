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

export function preferredPadId(pads, endpointPadId, equivalent) {
  const exact = pads.find(pad => pad.id === endpointPadId);
  if (exact) return exact.id;
  return pads.find(pad => equivalent(pad.id, endpointPadId))?.id || null;
}
