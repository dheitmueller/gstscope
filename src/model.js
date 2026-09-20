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

export function overlapAwareLaneOffsets(items, verticalGap = 96, horizontalGap = 32, top = 44) {
  if (!items.length) return [];
  const baseOffset = top - Math.min(...items.map(item => item.minY));
  const placed = [];

  [...items]
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX || a.id.localeCompare(b.id))
    .forEach(item => {
      const lane = { ...item, offset: baseOffset };
      const overlapsX = other =>
        lane.minX + lane.xOffset < other.maxX + other.xOffset + horizontalGap &&
        lane.maxX + lane.xOffset + horizontalGap > other.minX + other.xOffset;
      let moved = true;
      while (moved) {
        moved = false;
        for (const other of placed) {
          if (!overlapsX(other)) continue;
          const topY = lane.minY + lane.offset;
          const otherBottom = other.maxY + other.offset;
          if (topY < otherBottom + verticalGap && lane.maxY + lane.offset > other.minY + other.offset - verticalGap) {
            lane.offset += otherBottom + verticalGap - topY;
            moved = true;
          }
        }
      }
      placed.push(lane);
    });

  return placed.map(({ id, offset }) => ({ id, offset }));
}

export function nonOverlappingSiblingOffsets(items, verticalGap = 76, horizontalGap = 12) {
  const placed = [];
  const offsets = [];
  [...items]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .forEach(item => {
      let offset = 0;
      for (const other of placed) {
        const overlapsX = item.x1 < other.x2 + horizontalGap && item.x2 + horizontalGap > other.x1;
        if (!overlapsX) continue;
        offset = Math.max(offset, other.y2 + other.offset + verticalGap - item.y1);
      }
      offset = Math.max(0, offset);
      placed.push({ ...item, offset });
      if (offset > 0) offsets.push({ id: item.id, offset });
    });
  return offsets;
}

export function topRightBadgeTarget(items, point, hitSize = 30) {
  return items
    .filter(item => point.x >= item.x2 - hitSize && point.x <= item.x2 && point.y >= item.y1 && point.y <= item.y1 + hitSize)
    .sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1))[0]?.id || null;
}

export function centeredLayoutTranslations(currentBoxes, layoutBoxes) {
  if (!currentBoxes.length || !layoutBoxes.length) return [];
  const center = boxes => ({
    x: (Math.min(...boxes.map(box => box.x1)) + Math.max(...boxes.map(box => box.x2))) / 2,
    y: (Math.min(...boxes.map(box => box.y1)) + Math.max(...boxes.map(box => box.y2))) / 2
  });
  const currentCenter = center(currentBoxes);
  const layoutCenter = center(layoutBoxes);
  const currentById = new Map(currentBoxes.map(box => [box.id, box]));
  return layoutBoxes.flatMap(box => {
    const current = currentById.get(box.id);
    if (!current) return [];
    return [{
      id: box.id,
      dx: currentCenter.x + (box.x1 + box.x2) / 2 - layoutCenter.x - (current.x1 + current.x2) / 2,
      dy: currentCenter.y + (box.y1 + box.y2) / 2 - layoutCenter.y - (current.y1 + current.y2) / 2
    }];
  });
}

export function compactSingleInputBranches(items, edges, preferredGap = 104, clearance = 16) {
  const boxes = new Map(items.map(item => [item.id, { ...item }]));
  const incoming = new Map(items.map(item => [item.id, new Set()]));
  const outgoing = new Map(items.map(item => [item.id, new Set()]));
  edges.forEach(({ source, target }) => {
    if (source === target || !boxes.has(source) || !boxes.has(target)) return;
    outgoing.get(source).add(target);
    incoming.get(target).add(source);
  });
  const offsets = new Map(items.map(item => [item.id, 0]));
  const verticallyOverlap = (a, b) => a.y1 < b.y2 + clearance && a.y2 + clearance > b.y1;

  // Long direct edges commonly appear where a tee's short terminal branch
  // forces Dagre to align its longer sibling branch with distant ranks. Pull a
  // single-input branch and its exclusive downstream chain left, but never
  // pass a sibling occupying the same vertical band.
  const candidates = edges
    .filter(({ source, target }) => boxes.has(source) && boxes.has(target) && incoming.get(target).size === 1)
    .sort((a, b) => (boxes.get(b.target).x1 - boxes.get(b.source).x2) - (boxes.get(a.target).x1 - boxes.get(a.source).x2));
  candidates.forEach(({ source, target }) => {
    const sourceBox = boxes.get(source);
    const targetBox = boxes.get(target);
    let shift = targetBox.x1 - sourceBox.x2 - preferredGap;
    if (shift <= 1) return;

    const moving = new Set([target]);
    const pending = [target];
    while (pending.length) {
      const current = pending.shift();
      for (const next of outgoing.get(current) || []) {
        if (moving.has(next)) continue;
        if ([...(incoming.get(next) || [])].every(id => moving.has(id))) {
          moving.add(next);
          pending.push(next);
        }
      }
    }

    for (const id of moving) {
      const movingBox = boxes.get(id);
      for (const [otherId, otherBox] of boxes) {
        if (moving.has(otherId) || otherBox.x2 > movingBox.x1 || !verticallyOverlap(movingBox, otherBox)) continue;
        shift = Math.min(shift, movingBox.x1 - otherBox.x2 - clearance);
      }
    }
    if (shift <= 1) return;
    moving.forEach(id => {
      const box = boxes.get(id);
      box.x1 -= shift;
      box.x2 -= shift;
      offsets.set(id, offsets.get(id) - shift);
    });
  });

  return [...offsets].filter(([, dx]) => Math.abs(dx) > 1).map(([id, dx]) => ({ id, dx }));
}
