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

export function isRedundantProxyPad(pad, pads, aliases) {
  if (!/^proxypad/i.test(pad?.name || '')) return false;
  const equivalents = aliases.get(pad.id) || new Set();
  return [...equivalents].some(id => {
    const candidate = pads.get(id);
    return candidate && candidate.element === pad.element && !/^proxypad/i.test(candidate.name || '');
  });
}
