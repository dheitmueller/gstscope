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

export function padsShareFlowChannel(inputPad, outputPad) {
  if (!inputPad || !outputPad || inputPad.element !== outputPad.element) return false;
  const channel = pad => {
    const match = /^(?:sink|src)(?:_(.+))?$/i.exec(pad.name || '');
    return match ? match[1] || '__single__' : null;
  };
  const inputChannel = channel(inputPad);
  return inputChannel !== null && inputChannel === channel(outputPad);
}

export function siblingOrderAssignments(items) {
  const slots = items.map(item => item.y).sort((a, b) => a - b);
  return [...items]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((item, index) => ({ id: item.id, y: slots[index] }));
}

export function isolatedSiblingPlacements(items, gap = 62) {
  const connected = items.filter(item => item.connected);
  const isolated = items.filter(item => !item.connected);
  if (!connected.length || !isolated.length) return [];

  const left = Math.min(...connected.map(item => item.x - item.width / 2));
  const bottom = Math.max(...connected.map(item => item.y + item.height / 2));
  const rowHeight = Math.max(...isolated.map(item => item.height));
  let cursor = left;
  return isolated.map(item => {
    const placement = {
      id: item.id,
      x: cursor + item.width / 2,
      y: bottom + gap + rowHeight / 2
    };
    cursor += item.width + gap;
    return placement;
  });
}

export function topRightBadgeTarget(items, point, hitSize = 30) {
  return items
    .filter(item => point.x >= item.x2 - hitSize && point.x <= item.x2 && point.y >= item.y1 && point.y <= item.y1 + hitSize)
    .sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1))[0]?.id || null;
}
