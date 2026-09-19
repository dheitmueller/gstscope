import { orthogonalRouteOverlapScore, orthogonalRouteSegments, orthogonalSegmentData } from './geometry.js';
import { isRedundantProxyPad, padsShareFlowChannel, preferredPadId, projectedEdgeKey, siblingOrderAssignments } from './model.js';

/* GstScope proof of concept: authoritative GStreamer model -> semantic projection -> Cytoscape view. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const EXPAND_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect x="0.75" y="0.75" width="16.5" height="16.5" rx="4" fill="#0b151d" stroke="#67d9ce" stroke-width="1.5"/>
      <path d="M5 9h8M9 5v8" fill="none" stroke="#c4fff9" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `)}`;
  const COLLAPSE_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect x="0.75" y="0.75" width="16.5" height="16.5" rx="4" fill="#0b151d" stroke="#67d9ce" stroke-width="1.5"/>
      <path d="M5 9h8" fill="none" stroke="#c4fff9" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `)}`;
  const ui = {
    fileName: $('fileName'), fileInput: $('fileInput'), openButton: $('openButton'),
    search: $('searchInput'), stats: $('stats'), details: $('details'), loading: $('loading'),
    queues: $('toggleQueues'), tees: $('toggleTees'), pads: $('togglePads'), caps: $('capsMode'),
    dropOverlay: $('dropOverlay'), compare: $('compareDialog'), padTooltip: $('padTooltip')
  };

  const state = {
    graph: null,
    cy: null,
    collapsed: new Set(),
    positions: new Map(),
    preset: 'architectural',
    options: { queues: false, redundantTees: false, unlinkedPads: false, caps: 'media' },
    lastTap: { id: null, at: 0 },
    selectedId: null,
    filename: 'playbin3-hang.dot'
  };

  function decode(value = '') {
    const raw = value.trim().replace(/^"|"$/g, '');
    return raw.replace(/\\l/g, '\n').replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  function attrs(text = '') {
    const out = {};
    const re = /([A-Za-z][\w-]*)\s*=\s*("(?:\\.|[^"\\])*"|[^,\]]+)/g;
    let m;
    while ((m = re.exec(text))) out[m[1]] = decode(m[2]);
    return out;
  }

  // GStreamer writes long labels as quoted strings containing literal newlines.
  // Treat a physical line break as a statement boundary only when it is outside
  // a quoted string and an attribute list.
  function logicalStatements(text) {
    const statements = [];
    let current = '';
    let inQuote = false;
    let escaped = false;
    let bracketDepth = 0;

    for (const ch of text.replace(/\r/g, '')) {
      current += ch;
      if (inQuote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inQuote = false;
      } else if (ch === '"') inQuote = true;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);

      if (ch === '\n' && !inQuote && bracketDepth === 0) {
        const statement = current.trim();
        if (statement) statements.push(statement);
        current = '';
      }
    }
    const statement = current.trim();
    if (statement) statements.push(statement);
    return statements;
  }

  function labelLines(label = '') {
    // Some GStreamer builds concatenate the first property directly after the
    // state marker (for example "[>]qos=TRUE"). Recover the missing boundary.
    return label
      .replace(/(\[[~0\-=<>]\](?:\s*->\s*\[[~0\-=<>]\])?)(?=[A-Za-z_][\w-]*=)/g, '$1\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
  }

  function parseDot(text, filename) {
    const graphLabel = text.match(/digraph\s+[^\s{]+\s*\{[\s\S]*?^\s*label\s*=\s*"((?:\\.|[^"\\])*)"\s*;/m);
    const root = { id: '__dot__', parent: null, children: [], label: graphLabel ? decode(`"${graphLabel[1]}"`) : '', nodes: [] };
    const scopes = new Map([[root.id, root]]);
    const stack = [root];
    const rawNodes = new Map();
    const rawEdges = [];
    const lines = logicalStatements(text);

    for (const original of lines) {
      const line = original.trim();
      if (!line || line.startsWith('//')) continue;
      const sg = line.match(/^subgraph\s+("?[^\s{"}]+"?)\s*\{/);
      if (sg) {
        const id = sg[1].replace(/"/g, '');
        const scope = { id, parent: stack.at(-1), children: [], label: '', nodes: [] };
        stack.at(-1).children.push(scope);
        scopes.set(id, scope);
        stack.push(scope);
        continue;
      }
      if (/^}\s*;?$/.test(line)) { if (stack.length > 1) stack.pop(); continue; }
      const edge = line.match(/^("?[^\s"]+"?)\s*->\s*("?[^\s\[]+"?)\s*(?:\[([\s\S]*)\])?\s*;?$/);
      if (edge) {
        rawEdges.push({ source: edge[1].replace(/"/g, ''), target: edge[2].replace(/[";]/g, ''), attrs: attrs(edge[3]) });
        continue;
      }
      const node = line.match(/^("?[^\s\[]+"?)\s*\[([\s\S]*)\]\s*;?$/);
      if (node && !['node', 'edge', 'legend'].includes(node[1])) {
        const id = node[1].replace(/"/g, '');
        const item = { id, scope: stack.at(-1), attrs: attrs(node[2]) };
        rawNodes.set(id, item);
        stack.at(-1).nodes.push(item);
        continue;
      }
      const label = line.match(/^label\s*=\s*("(?:\\.|[^"\\])*")\s*;?$/);
      if (label && stack.at(-1) !== root) stack.at(-1).label = decode(label[1]);
    }

    const isPadScope = (scope) => /_(sink|src)$/.test(scope.id) || scope.label === '' && /(?:sink|src)/.test(scope.id);
    const semanticScopes = [...scopes.values()].filter(s => s !== root && s.id.startsWith('cluster_') && !isPadScope(s) && s.label);
    const semanticSet = new Set(semanticScopes);
    const nearestSemantic = (scope) => {
      let s = scope;
      while (s && !semanticSet.has(s)) s = s.parent;
      return s;
    };
    const rootBits = labelLines(root.label);
    const labelledFactory = rootBits[0]?.startsWith('<');
    const pipeline = {
      id: '__pipeline__', name: rootBits.find(x => !x.startsWith('<') && !x.startsWith('[')) || filename.replace(/\.dot$/i, ''),
      factory: labelledFactory ? rootBits[0].replace(/[<>]/g, '') : 'GstPipeline', kind: 'bin', parent: null,
      state: rootBits.find(x => /^\[/.test(x)) || '', properties: {}, pads: [], depth: 0, rawLabel: root.label
    };
    const items = new Map([[pipeline.id, pipeline]]);
    const scopeToItem = new Map();

    const orderedScopes = semanticScopes.sort((a, b) => scopeDepth(a) - scopeDepth(b));
    for (const scope of orderedScopes) {
      const bits = labelLines(scope.label);
      const parentScope = nearestSemantic(scope.parent);
      const parent = parentScope ? scopeToItem.get(parentScope)?.id : pipeline.id;
      const directSemanticChildren = scope.children.some(ch => semanticSet.has(ch));
      const factory = (bits[0] || 'GstElement').replace(/[<>]/g, '');
      const name = bits[1] && !/^\[/.test(bits[1]) ? bits[1] : factory;
      const props = {};
      for (const bit of bits.slice(2)) {
        const eq = bit.indexOf('=');
        if (eq > 0) props[bit.slice(0, eq)] = bit.slice(eq + 1);
      }
      const item = {
        id: scope.id, name, factory, kind: directSemanticChildren ? 'bin' : 'element', parent,
        state: bits.find(x => /^\[/.test(x)) || '', properties: props, pads: [],
        depth: (items.get(parent)?.depth ?? 0) + 1, rawLabel: scope.label
      };
      items.set(item.id, item);
      scopeToItem.set(scope, item);
    }

    const pads = new Map();
    for (const raw of rawNodes.values()) {
      const ownerScope = nearestSemantic(raw.scope);
      if (!ownerScope) continue;
      const owner = scopeToItem.get(ownerScope);
      if (!owner) continue;
      const labelBits = labelLines(raw.attrs.label || raw.id);
      const direction = /_src$/.test(raw.scope.id) ? 'src' : /_sink$/.test(raw.scope.id) ? 'sink' : 'unknown';
      const pad = { id: raw.id, name: labelBits[0], direction, element: owner.id, declarationOrder: owner.pads.length, flags: labelBits.slice(1).join(' '), linked: false, raw: raw.attrs };
      pads.set(pad.id, pad);
      owner.pads.push(pad.id);
    }

    const padAliases = new Map();
    const addPadAlias = (a, b) => {
      if (!padAliases.has(a)) padAliases.set(a, new Set());
      if (!padAliases.has(b)) padAliases.set(b, new Set());
      padAliases.get(a).add(b);
      padAliases.get(b).add(a);
    };
    const links = [];
    for (const edge of rawEdges) {
      const sp = pads.get(edge.source), tp = pads.get(edge.target);
      if (!sp || !tp || edge.attrs.style === 'invis') continue;
      if (sp.element === tp.element) {
        if (edge.attrs.style === 'dashed') {
          sp.linked = true; tp.linked = true;
          addPadAlias(sp.id, tp.id);
        }
        continue;
      }
      sp.linked = true; tp.linked = true;
      const sourcePad = sp.direction === 'src' ? sp : tp.direction === 'src' ? tp : sp;
      const sinkPad = sourcePad === sp ? tp : sp;
      const label = edge.attrs.label || edge.attrs.taillabel || edge.attrs.headlabel || '';
      links.push({
        id: `link-${links.length}`, sourceElement: sourcePad.element, sourcePad: sourcePad.id,
        sinkElement: sinkPad.element, sinkPad: sinkPad.id, caps: label, ghost: edge.attrs.style === 'dashed', raw: edge.attrs
      });
    }

    const children = new Map();
    for (const item of items.values()) {
      if (!children.has(item.parent)) children.set(item.parent, []);
      children.get(item.parent).push(item.id);
    }
    return { filename, source: text, pipeline: pipeline.id, items, pads, padAliases, links, children, raw: { scopes, nodes: rawNodes, edges: rawEdges } };
  }

  function scopeDepth(scope) { let n = 0; while (scope?.parent) { n++; scope = scope.parent; } return n; }
  function typeClass(item) {
    const t = `${item.factory} ${item.name}`.toLowerCase();
    if (item.kind === 'bin') return 'bin';
    if (/(source|src|demux|typefind|filesrc|urisource)/.test(t)) return 'source';
    if (/(sink|render|output)/.test(t)) return 'sink';
    if (/(tee|selector|funnel)/.test(t)) return 'branch';
    if (/(queue)/.test(t)) return 'queue';
    if (/(decode|convert|scale|parse|filter|balance|deinterlace)/.test(t)) return 'process';
    return 'element';
  }
  function isQueue(item) { return /(^|\b)(multi)?queue/i.test(`${item.factory} ${item.name}`); }
  function isTee(item) { return /(^|\b)(tee|GstTee)/i.test(`${item.factory} ${item.name}`); }
  function mediaType(caps = '') {
    const m = caps.match(/(?:^|\n|\s)(audio|video|image|text|application)\/[-\w.+]+/i);
    return m ? m[0].trim() : caps.split(/[;,\n]/)[0].trim();
  }

  function formatCaps(caps = '') {
    return caps
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  function capsLabelMetrics(label = '') {
    if (!label) return { above: 0, beside: 0 };
    const lines = label.split('\n');
    const wrappedLines = label.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 36)), 0);
    const longestLine = Math.min(36, Math.max(...lines.map(line => line.length)));
    return {
      above: -(wrappedLines * 9 * 1.25 / 2 + 10),
      beside: longestLine * 4.8 / 2 + 10
    };
  }

  function displayLabel(item, collapsed) {
    if (!collapsed || item.kind !== 'bin') return item.name;
    const name = item.name.replace(/-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, '');
    if (name.length <= 28) return name;
    const lines = [];
    for (const part of name.split('-')) {
      const token = `${part}-`;
      if (!lines.length || `${lines.at(-1)}${token}`.length > 27) lines.push(token);
      else lines[lines.length - 1] += token;
    }
    const cleaned = lines.map(line => line.replace(/-$/, ''));
    if (cleaned.length <= 3) return cleaned.join('\n');
    return `${cleaned.slice(0, 2).join('\n')}\n${cleaned.slice(2).join('-').slice(0, 25)}…`;
  }

  function projectGraph() {
    const g = state.graph;
    const rep = (id) => {
      let item = g.items.get(id), result = item;
      while (item?.parent) {
        const parent = g.items.get(item.parent);
        if (parent && state.collapsed.has(parent.id)) result = parent;
        item = parent;
      }
      return result?.id || id;
    };

    const baseNodes = new Set();
    for (const item of g.items.values()) if (item.id !== g.pipeline) baseNodes.add(rep(item.id));
    const baseEdges = [];
    for (const link of g.links) {
      const source = rep(link.sourceElement), target = rep(link.sinkElement);
      if (source !== target) baseEdges.push({ source, target, links: [link], hiddenPath: [] });
    }

    const transparent = new Set([...baseNodes].filter(id => {
      const item = g.items.get(id);
      return item?.kind === 'bin' && !state.collapsed.has(id);
    }));
    const padsEquivalent = (a, b) => a === b || g.padAliases.get(a)?.has(b) || g.padAliases.get(b)?.has(a);

    const outgoing = new Map();
    for (const e of baseEdges) {
      if (!outgoing.has(e.source)) outgoing.set(e.source, []);
      outgoing.get(e.source).push(e);
    }
    const hidden = new Set();
    for (const id of baseNodes) {
      const item = g.items.get(id);
      if (!item || item.kind === 'bin') continue;
      if (!state.options.queues && isQueue(item)) hidden.add(id);
      if (!state.options.redundantTees && isTee(item) && new Set((outgoing.get(id) || []).map(e => e.target)).size <= 1) hidden.add(id);
    }

    const projectedEdges = [];
    const walk = (edge, path, seen) => {
      if (seen.has(edge.target)) return;
      if (!hidden.has(edge.target) && !transparent.has(edge.target)) {
        projectedEdges.push({ source: edge.source, target: edge.target, links: edge.links, hiddenPath: path });
        return;
      }
      const nextSeen = new Set(seen).add(edge.target);
      let next = outgoing.get(edge.target) || [];
      if (transparent.has(edge.target) || hidden.has(edge.target)) {
        const incomingPad = edge.links.at(-1)?.sinkPad;
        const matched = next.filter(n => {
          const outgoingPad = n.links[0]?.sourcePad;
          if (transparent.has(edge.target)) return padsEquivalent(incomingPad, outgoingPad);
          return padsShareFlowChannel(g.pads.get(incomingPad), g.pads.get(outgoingPad));
        });
        next = matched.length ? matched : next.length === 1 ? next : [];
      }
      const nextPath = hidden.has(edge.target) ? [...path, edge.target] : path;
      for (const n of next) walk({ source: edge.source, target: n.target, links: [...edge.links, ...n.links] }, nextPath, nextSeen);
    };
    for (const e of baseEdges) if (!hidden.has(e.source) && !transparent.has(e.source)) walk(e, [], new Set([e.source]));

    const nodes = [...baseNodes].filter(id => !hidden.has(id));
    const nodeSet = new Set(nodes);
    const edgeMap = new Map();
    for (const e of projectedEdges) {
      if (!nodeSet.has(e.source) || !nodeSet.has(e.target) || e.source === e.target) continue;
      const key = projectedEdgeKey(e);
      if (!edgeMap.has(key)) edgeMap.set(key, { ...e, links: [...e.links], hiddenPath: [...e.hiddenPath] });
      else {
        const current = edgeMap.get(key);
        current.links.push(...e.links);
        current.hiddenPath.push(...e.hiddenPath.filter(x => !current.hiddenPath.includes(x)));
      }
    }

    const allPadsByOwner = new Map();
    for (const pad of g.pads.values()) {
      const owner = pad.element;
      if (!nodeSet.has(owner) || hidden.has(owner)) continue;
      // A bin's proxypad and its concrete ghost-pad target are two DOT nodes
      // for one logical boundary port. Show the meaningful concrete name and
      // keep the alias only in the parsed model for endpoint resolution.
      if (isRedundantProxyPad(pad, g.pads, g.padAliases)) continue;
      const groups = allPadsByOwner.get(owner) || { sink: [], src: [] };
      (pad.direction === 'src' ? groups.src : groups.sink).push(pad);
      allPadsByOwner.set(owner, groups);
    }
    const endpointPadId = (owner, direction, padId) =>
      preferredPadId(allPadsByOwner.get(owner)?.[direction] || [], padId, padsEquivalent);
    const projectedEdgePads = [...edgeMap.values()].map(edge => ({
      edge,
      sourcePadId: endpointPadId(edge.source, 'src', edge.links[0]?.sourcePad),
      targetPadId: endpointPadId(edge.target, 'sink', edge.links.at(-1)?.sinkPad)
    }));
    const visibleEndpointPads = new Set(projectedEdgePads.flatMap(({ sourcePadId, targetPadId }) => [sourcePadId, targetPadId].filter(Boolean)));
    const padsByOwner = new Map();
    for (const [owner, groups] of allPadsByOwner) {
      const visible = {
        sink: groups.sink.filter(pad => visibleEndpointPads.has(pad.id) || state.options.unlinkedPads),
        src: groups.src.filter(pad => visibleEndpointPads.has(pad.id) || state.options.unlinkedPads)
      };
      if (visible.sink.length || visible.src.length) padsByOwner.set(owner, visible);
    }

    const cyNodes = nodes.map(id => {
      const item = g.items.get(id);
      let parent;
      if (item?.parent) {
        const p = rep(item.parent);
        if (p !== id && nodeSet.has(p) && !state.collapsed.has(p)) parent = p;
      }
      const collapsed = state.collapsed.has(id);
      const padGroups = padsByOwner.get(id);
      const padRows = padGroups ? Math.max(padGroups.sink.length, padGroups.src.length) : 0;
      const baseHeight = collapsed ? 76 : isQueue(item) ? 34 : 48;
      const nodeHeight = padRows ? Math.max(baseHeight, 42 + padRows * 18) : baseHeight;
      const nodeLabelOffsetY = padRows ? -(nodeHeight / 2 - 13) : 0;
      return {
        data: { id, parent, label: displayLabel(item, collapsed), subtitle: item.factory, kind: item.kind, typeClass: typeClass(item), collapsed, collapsible: item.kind === 'bin' && id !== g.pipeline, nodeHeight, nodeLabelOffsetY },
        classes: padRows ? 'has-pad-badges' : ''
      };
    });
    const cyEdges = projectedEdgePads.map(({ edge: e, sourcePadId, targetPadId }, i) => {
      const caps = [...new Set(e.links.map(l => formatCaps(l.caps)).filter(Boolean))].join('\n\n');
      const label = state.options.caps === 'full' ? caps : state.options.caps === 'media' ? mediaType(caps) : '';
      const labelMetrics = capsLabelMetrics(label);
      return { data: { id: `edge-${i}`, source: e.source, target: e.target, label, labelAbove: labelMetrics.above, labelBeside: labelMetrics.beside, labelOffsetX: 0, labelOffsetY: labelMetrics.above, sourceEndpoint: '50% 0%', targetEndpoint: '-50% 0%', sourcePadId, targetPadId, segmentDistances: '0', segmentWeights: '0.5', caps, links: e.links, hiddenPath: e.hiddenPath, synthetic: e.hiddenPath.length > 0 } };
    });

    for (const [owner, groups] of padsByOwner) {
      for (const pad of [...groups.sink, ...groups.src]) {
        const id = `pad:${pad.id}`;
        const padWidth = Math.max(30, Math.min(56, 14 + pad.name.length * 5));
        cyNodes.push({
          data: { id, label: pad.name, kind: 'pad', typeClass: pad.direction, padId: pad.id, ownerId: owner, padWidth, linked: visibleEndpointPads.has(pad.id), graphLinked: pad.linked },
          classes: visibleEndpointPads.has(pad.id) ? 'linked-pad' : 'unlinked-pad',
          grabbable: false
        });
      }
    }
    return { nodes: cyNodes, edges: cyEdges, hiddenCount: hidden.size };
  }

  function stylesheet() {
    return [
      { selector: 'node', style: { 'background-color': '#151e2b', 'border-color': '#35445a', 'border-width': 1.5, 'shape': 'round-rectangle', width: 126, height: 48, label: 'data(label)', color: '#edf3f8', 'font-size': 12, 'font-weight': 600, 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'ellipsis', 'text-max-width': 110, 'overlay-opacity': 0 } },
      { selector: 'node[typeClass="source"]', style: { 'background-color': '#102b2a', 'border-color': '#4dd6c6' } },
      { selector: 'node[typeClass="sink"]', style: { 'background-color': '#2b1d19', 'border-color': '#f5a65b' } },
      { selector: 'node[typeClass="branch"]', style: { 'background-color': '#251d3d', 'border-color': '#a78bfa', shape: 'round-rectangle', width: 126, height: 48 } },
      { selector: 'node[typeClass="queue"]', style: { width: 76, height: 34, 'font-size': 10, 'border-style': 'dashed', 'border-color': '#718198' } },
      { selector: 'node[kind="bin"][collapsed]', style: { 'background-color': '#14202b', 'border-color': '#58a6b7', 'border-width': 2, width: 210, height: 76, 'text-wrap': 'wrap', 'text-max-width': 172, 'font-size': 11, 'line-height': 1.25, 'background-image': EXPAND_ICON, 'background-image-opacity': 1, 'background-fit': 'none', 'background-repeat': 'no-repeat', 'background-width': '18px', 'background-height': '18px', 'background-position-x': '96%', 'background-position-y': '10%' } },
      { selector: 'node[kind="bin"]:parent', style: { 'background-color': '#0e1722', 'background-opacity': .72, 'border-color': '#30445b', 'border-width': 1.5, 'border-style': 'dashed', 'padding': 28, 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': 16, 'font-size': 12, 'font-weight': 650, color: '#b9ccdc', 'z-compound-depth': 'bottom' } },
      { selector: 'node[kind="bin"][collapsible]:parent', style: { 'background-image': COLLAPSE_ICON, 'background-image-opacity': 1, 'background-fit': 'none', 'background-repeat': 'no-repeat', 'background-width': '18px', 'background-height': '18px', 'background-position-x': '98%', 'background-position-y': '2%' } },
      { selector: 'node.has-pad-badges:childless', style: { height: 'data(nodeHeight)', 'text-valign': 'center', 'text-margin-y': 'data(nodeLabelOffsetY)' } },
      { selector: 'node[kind="pad"]', style: { width: 'data(padWidth)', height: 14, shape: 'round-rectangle', 'font-size': 8, 'font-weight': 600, 'background-color': '#182536', 'border-width': 1, 'border-color': '#74849b', color: '#dbe7f2', 'text-wrap': 'ellipsis', 'text-max-width': 50, 'text-valign': 'center', 'text-halign': 'center', 'z-compound-depth': 'top', 'z-index-compare': 'manual', 'z-index': 1001 } },
      { selector: 'node[kind="pad"][typeClass="sink"]', style: { 'background-color': '#39271d', 'border-color': '#f5a65b', color: '#ffd9b3' } },
      { selector: 'node[kind="pad"][typeClass="src"]', style: { 'background-color': '#133330', 'border-color': '#4dd6c6', color: '#baf5ee' } },
      { selector: 'node.unlinked-pad', style: { 'border-style': 'dashed', opacity: .78 } },
      { selector: 'edge', style: { width: 1.6, 'line-color': '#60758b', 'target-arrow-color': '#60758b', 'target-arrow-shape': 'triangle', 'arrow-scale': .8, 'curve-style': 'segments', 'segment-distances': 'data(segmentDistances)', 'segment-weights': 'data(segmentWeights)', 'edge-distances': 'endpoints', 'source-endpoint': 'data(sourceEndpoint)', 'target-endpoint': 'data(targetEndpoint)', label: 'data(label)', color: '#aebccc', 'font-size': 9, 'line-height': 1.25, 'text-wrap': 'wrap', 'text-max-width': 190, 'text-justification': 'center', 'text-margin-x': 'data(labelOffsetX)', 'text-margin-y': 'data(labelOffsetY)', 'text-background-color': '#091019', 'text-background-opacity': .94, 'text-background-padding': 3, 'text-rotation': 'none', 'overlay-opacity': 0 } },
      { selector: 'edge[synthetic]', style: { 'line-style': 'dashed', 'line-color': '#b78a59', 'target-arrow-color': '#b78a59' } },
      { selector: 'node.trace-dim', style: { opacity: .48 } },
      { selector: 'edge.trace-dim', style: { opacity: .28 } },
      { selector: 'node.trace-node', style: { 'border-color': '#77e6da', 'border-width': 2.5, 'z-index': 998 } },
      { selector: 'edge.trace-edge', style: { 'line-color': '#a78bfa', 'target-arrow-color': '#a78bfa', width: 3, 'z-compound-depth': 'top', 'z-index-compare': 'manual', 'z-index': 998 } },
      { selector: 'edge.trace-in', style: { 'line-color': '#f5a65b', 'target-arrow-color': '#f5a65b', width: 3, 'z-compound-depth': 'top', 'z-index-compare': 'manual', 'z-index': 998 } },
      { selector: 'edge.trace-out', style: { 'line-color': '#4dd6c6', 'target-arrow-color': '#4dd6c6', width: 3, 'z-compound-depth': 'top', 'z-index-compare': 'manual', 'z-index': 998 } },
      { selector: '.search-match', style: { 'border-color': '#f5d06f', 'border-width': 4 } },
      { selector: '.search-dim', style: { opacity: .2 } },
      { selector: 'node:selected', style: { 'background-color': '#2b3d54', 'border-color': '#ffffff', 'border-width': 4, 'underlay-color': '#4dd6c6', 'underlay-opacity': .32, 'underlay-padding': 8, 'z-index': 999 } },
      { selector: 'node[kind="pad"]:selected', style: { 'border-width': 2, 'border-color': '#ffffff', 'underlay-opacity': 0, 'z-index': 1002 } },
      { selector: 'edge:selected', style: { 'line-color': '#ffffff', 'target-arrow-color': '#ffffff', width: 4, 'z-compound-depth': 'top', 'z-index-compare': 'manual', 'z-index': 999 } }
    ];
  }

  function rememberPositions() {
    if (!state.cy) return;
    state.cy.nodes().filter(n => n.data('kind') !== 'pad').forEach(n => state.positions.set(n.id(), { ...n.position() }));
  }

  function clearTrace() {
    state.cy?.elements().removeClass('trace-node trace-edge trace-in trace-out trace-dim');
  }

  function focusTrace(target) {
    const cy = state.cy;
    if (!cy || !target?.length) return;
    clearTrace();
    let focus;
    if (target.isNode()) {
      const coreNodes = target.union(target.descendants());
      const coreIds = new Set(coreNodes.map(node => node.id()));
      const padBadges = cy.nodes().filter(node => node.data('kind') === 'pad' && coreIds.has(node.data('ownerId')));
      const incidentEdges = coreNodes.connectedEdges();
      focus = coreNodes.union(padBadges).union(incidentEdges).union(incidentEdges.connectedNodes());
      incidentEdges.filter(edge => coreNodes.contains(edge.source()) && coreNodes.contains(edge.target())).addClass('trace-edge');
      incidentEdges.filter(edge => !coreNodes.contains(edge.source()) && coreNodes.contains(edge.target())).addClass('trace-in');
      incidentEdges.filter(edge => coreNodes.contains(edge.source()) && !coreNodes.contains(edge.target())).addClass('trace-out');
    } else {
      focus = target.union(target.source()).union(target.target());
      target.addClass('trace-edge');
    }
    cy.elements().not(focus).addClass('trace-dim');
    focus.filter('node').addClass('trace-node');
  }

  function render({ layout = true, fit = true } = {}) {
    if (!state.graph) return;
    ui.padTooltip.classList.remove('show');
    const previousVisible = state.cy ? new Set(state.cy.nodes().map(node => node.id())) : new Set();
    rememberPositions();
    const view = projectGraph();
    if (state.cy) state.cy.destroy();
    state.cy = cytoscape({
      container: $('cy'), elements: [...view.nodes, ...view.edges], style: stylesheet(),
      minZoom: .07, maxZoom: 3.5, boxSelectionEnabled: false
    });
    const cy = state.cy;
    cy.on('tap', 'node', evt => {
      const target = evt.target;
      if (target.data('kind') === 'pad') {
        const owner = cy.getElementById(target.data('ownerId'));
        state.selectedId = owner.id();
        cy.nodes().unselect();
        target.select();
        focusTrace(owner);
        showDetails(target);
        return;
      }
      state.selectedId = target.id();
      focusTrace(target);
      showDetails(target);
    });
    cy.on('tap', 'edge', evt => { state.selectedId = null; focusTrace(evt.target); showDetails(evt.target); });
    cy.on('tap', evt => { if (evt.target === cy) { state.selectedId = null; clearTrace(); } });
    const hidePadTooltip = () => ui.padTooltip.classList.remove('show');
    cy.on('mouseover', 'node[kind="pad"]', evt => {
      const pad = state.graph.pads.get(evt.target.data('padId'));
      if (!pad) return;
      ui.padTooltip.textContent = pad.name;
      ui.padTooltip.classList.add('show');
      const position = evt.target.renderedPosition();
      const left = Math.max(8, Math.min(cy.width() - ui.padTooltip.offsetWidth - 8, position.x + 12));
      const top = Math.max(8, position.y - ui.padTooltip.offsetHeight - 12);
      ui.padTooltip.style.left = `${left}px`;
      ui.padTooltip.style.top = `${top}px`;
    });
    cy.on('mouseout', 'node[kind="pad"]', hidePadTooltip);
    cy.on('pan zoom resize', hidePadTooltip);
    cy.on('tap', 'node[kind="bin"]', evt => {
      const now = Date.now(), id = evt.target.id();
      if (state.lastTap.id === id && now - state.lastTap.at < 420) toggleBin(id);
      state.lastTap = { id, at: now };
    });
    cy.on('dragfree', 'node', evt => {
      if (evt.target.data('kind') === 'pad') return;
      state.positions.set(evt.target.id(), { ...evt.target.position() });
      placePadBadges();
      applyEdgeGeometry();
    });

    if (layout) runLayout(fit, previousVisible);
    else {
      const center = { x: cy.width() / 2, y: cy.height() / 2 };
      cy.nodes().filter(n => n.data('kind') !== 'pad').forEach((n, i) => n.position(state.positions.get(n.id()) || { x: center.x + (i % 5) * 28, y: center.y + Math.floor(i / 5) * 28 }));
      placePadBadges();
      applyEdgeGeometry();
      if (fit) cy.fit(undefined, 42);
    }
    ui.loading.classList.add('hidden');
    const visibleElements = view.nodes.filter(node => node.data.kind !== 'pad').length;
    ui.stats.textContent = `${state.graph.items.size - 1} elements · ${state.graph.links.length} links · ${visibleElements} visible · ${view.hiddenCount} contracted`;
    syncControls();
    const selected = state.selectedId ? cy.getElementById(state.selectedId) : null;
    if (selected?.length) { selected.select(); focusTrace(selected); showItem(state.selectedId); }
    if (ui.search.value.trim()) requestAnimationFrame(search);
  }

  function placePadBadges() {
    const cy = state.cy;
    if (!cy) return;
    const groups = new Map();
    cy.nodes().filter(node => node.data('kind') === 'pad').forEach(pad => {
      const key = `${pad.data('ownerId')}|${pad.data('typeClass')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pad);
    });
    cy.batch(() => {
      for (const pads of groups.values()) {
        // Keep the original DOT declaration order within each pad direction.
        const owner = cy.getElementById(pads[0].data('ownerId'));
        if (!owner.length) continue;
        const direction = pads[0].data('typeClass');
        const badgeHeight = 14;
        const gap = 4;
        const totalHeight = pads.length * badgeHeight + (pads.length - 1) * gap;
        const ownerPosition = owner.position();
        const ownerWidth = owner.outerWidth();
        const ownerHeight = owner.outerHeight();
        const firstY = ownerPosition.y + ownerHeight / 2 - 5 - totalHeight + badgeHeight / 2;
        pads.forEach((pad, index) => {
          const width = pad.outerWidth();
          pad.position({
            x: ownerPosition.x + (direction === 'src' ? ownerWidth / 2 - width / 2 - 4 : -ownerWidth / 2 + width / 2 + 4),
            y: firstY + index * (badgeHeight + gap)
          });
        });
      }
    });
  }

  function applyEdgeGeometry() {
    const cy = state.cy;
    if (!cy) return;
    const endpoint = (node, side, offset) => {
      return `${side === 'source' ? 50 : -50}% ${offset}%`;
    };
    const assignPorts = (node, side) => {
      const edges = [...(side === 'source' ? node.outgoers('edge') : node.incomers('edge'))]
        .sort((a, b) => {
          const aPeer = side === 'source' ? a.target() : a.source();
          const bPeer = side === 'source' ? b.target() : b.source();
          return aPeer.position('y') - bPeer.position('y') || aPeer.id().localeCompare(bPeer.id());
        });
      if (!edges.length) return;
      const spread = Math.min(38, 24 + (edges.length - 2) * 7);
      edges.forEach((edge, index) => {
        const padId = edge.data(`${side}PadId`);
        const pad = padId ? cy.getElementById(`pad:${padId}`) : null;
        const fallbackOffset = edges.length < 2 ? 0 : -spread + index * (2 * spread / (edges.length - 1));
        const offset = pad?.length && pad.data('ownerId') === node.id()
          ? (pad.position('y') - node.position('y')) / node.outerHeight() * 100
          : fallbackOffset;
        edge.data(`${side}Endpoint`, endpoint(node, side, offset));
        edge.scratch(`_${side}Turn`, edges.length < 2 ? 50 : 42 + index * (16 / (edges.length - 1)));
      });
    };

    // Only fan out edges at the node where they are actually siblings. A
    // graph-wide lane assignment makes unrelated links take large detours and
    // can force Cytoscape's taxi renderer to fall back to diagonal segments.
    const assignRouteLanes = () => {
      cy.edges().forEach(edge => {
        const sourceTurn = edge.scratch('_sourceTurn');
        const targetTurn = edge.scratch('_targetTurn');
        const turn = Number.isFinite(sourceTurn) ? sourceTurn
          : Number.isFinite(targetTurn) ? targetTurn
            : 50;
        edge.scratch('_routeTurn', turn / 100);
      });
    };

    const endpointPosition = (edge, side) => {
      const node = side === 'source' ? edge.source() : edge.target();
      const value = edge.data(`${side}Endpoint`);
      const match = /^(-?[\d.]+)%\s+(-?[\d.]+)%$/.exec(value || '');
      const xPercent = match ? Number(match[1]) : side === 'source' ? 50 : -50;
      const yPercent = match ? Number(match[2]) : 0;
      const position = node.position();
      return {
        x: position.x + node.outerWidth() * xPercent / 100,
        y: position.y + node.outerHeight() * yPercent / 100
      };
    };

    const graphNodes = cy.nodes().filter(node => node.data('kind') !== 'pad');
    const obstacles = graphNodes.filter(node => !node.isParent());
    const overlaps = (a1, a2, b1, b2) => Math.max(Math.min(a1, a2), b1) <= Math.min(Math.max(a1, a2), b2);
    const reservedRoutes = [];
    const chooseTurnRatio = (edge, source, target) => {
      const preferred = edge.scratch('_routeTurn') ?? .5;
      const candidates = [...new Set([
        preferred, preferred - .3, preferred - .2, preferred - .1, preferred + .1, preferred + .2, preferred + .3,
        .15, .25, .35, .5, .65, .75, .85
      ].map(value => Math.max(.15, Math.min(.85, value)).toFixed(3)))].map(Number);
      let best = preferred;
      let bestScore = Infinity;
      for (const ratio of candidates) {
        const turnX = source.x + (target.x - source.x) * ratio;
        let score = Math.abs(ratio - preferred);
        obstacles.forEach(node => {
          if (node.same(edge.source()) || node.same(edge.target())) return;
          const box = node.boundingBox({ includeLabels: false });
          const pad = 9;
          const x1 = box.x1 - pad, x2 = box.x2 + pad;
          const y1 = box.y1 - pad, y2 = box.y2 + pad;
          const firstHorizontal = source.y >= y1 && source.y <= y2 && overlaps(source.x, turnX, x1, x2);
          const vertical = turnX >= x1 && turnX <= x2 && overlaps(source.y, target.y, y1, y2);
          const lastHorizontal = target.y >= y1 && target.y <= y2 && overlaps(turnX, target.x, x1, x2);
          if (firstHorizontal) score += 12;
          if (vertical) score += 10;
          if (lastHorizontal) score += 12;
        });
        const routeOverlap = orthogonalRouteOverlapScore(orthogonalRouteSegments(source, target, ratio), reservedRoutes);
        score += routeOverlap;
        if (score < bestScore) { bestScore = score; best = ratio; }
      }
      return best;
    };

    const applySegments = edge => {
      const source = endpointPosition(edge, 'source');
      const target = endpointPosition(edge, 'target');
      const turnRatio = chooseTurnRatio(edge, source, target);
      const geometry = orthogonalSegmentData(source, target, turnRatio);
      if (!geometry) {
        edge.data('segmentWeights', '0.5');
        edge.data('segmentDistances', '0');
        return;
      }
      reservedRoutes.push(orthogonalRouteSegments(source, target, turnRatio));
      edge.data('segmentWeights', geometry.weights.map(value => value.toFixed(5)).join(' '));
      edge.data('segmentDistances', geometry.distances.map(value => value.toFixed(2)).join(' '));
    };

    cy.batch(() => {
      const graphBounds = graphNodes.boundingBox({ includeLabels: false });
      cy.edges().forEach(edge => {
        edge.data('sourceEndpoint', endpoint(edge.source(), 'source', 0));
        edge.data('targetEndpoint', endpoint(edge.target(), 'target', 0));
        edge.data('taxiTurn', '50%');
        edge.scratch('_sourceTurn', null);
        edge.scratch('_targetTurn', null);
      });
      graphNodes.forEach(node => {
        assignPorts(node, 'source');
        assignPorts(node, 'target');
      });
      assignRouteLanes();
      cy.edges().forEach(applySegments);
      cy.edges().forEach(edge => {
        const source = edge.source().position();
        const target = edge.target().position();
        const dx = Math.abs(target.x - source.x);
        const dy = Math.abs(target.y - source.y);
        const vertical = dy > Math.max(80, dx * .65);
        if (vertical && edge.data('label')) {
          const midpointX = (source.x + target.x) / 2;
          const beside = edge.data('labelBeside') || 36;
          const side = midpointX + beside + 18 > graphBounds.x2 ? -1 : 1;
          edge.data('labelOffsetX', side * beside);
          edge.data('labelOffsetY', 0);
        } else {
          edge.data('labelOffsetX', 0);
          edge.data('labelOffsetY', edge.data('labelAbove') || 0);
        }
      });
    });
  }

  function runLayout(fit = true, previousVisible = null) {
    if (!state.cy) return;
    const cy = state.cy;
    const graphNodes = cy.nodes().filter(node => node.data('kind') !== 'pad');
    const nodeCount = graphNodes.length;
    const leaves = graphNodes.filter(node => !node.isParent());
    const leafIds = new Set(leaves.map(node => node.id()));

    // Dagre's compound-graph ranking can place downstream nodes to the left of
    // their sources when edges cross expanded bin boundaries. Rank the visible
    // leaves as one directed graph, then let Cytoscape wrap their bin parents.
    const guide = new dagre.graphlib.Graph({ multigraph: true })
      .setGraph({ rankdir: 'LR', ranksep: nodeCount > 100 ? 92 : 132, nodesep: 62, edgesep: 34, marginx: 44, marginy: 44 })
      .setDefaultEdgeLabel(() => ({}));
    leaves.forEach(node => guide.setNode(node.id(), { width: Math.max(node.outerWidth(), 40), height: Math.max(node.outerHeight(), 30) }));
    const boundaryLeaves = (node, side) => {
      if (!node.isParent()) return leafIds.has(node.id()) ? [node.id()] : [];
      const descendants = node.descendants().filter(child => !child.isParent());
      const descendantIds = new Set(descendants.map(child => child.id()));
      const boundary = descendants.filter(child => {
        const internal = side === 'source'
          ? child.outgoers('edge').filter(edge => descendantIds.has(edge.target().id()))
          : child.incomers('edge').filter(edge => descendantIds.has(edge.source().id()));
        return internal.length === 0;
      }).map(child => child.id());
      return boundary.length ? boundary : [...descendantIds];
    };
    cy.edges().forEach((edge, index) => {
      const sources = boundaryLeaves(edge.source(), 'source');
      const targets = boundaryLeaves(edge.target(), 'target');
      sources.forEach((source, sourceIndex) => targets.forEach((target, targetIndex) => {
        if (source !== target) guide.setEdge(source, target, {}, `${edge.id()}:${index}:${sourceIndex}:${targetIndex}`);
      }));
    });
    dagre.layout(guide);

    // Dagre is free to order nodes that share a rank. Preserve the source
    // pads' declaration order from the DOT file for direct sibling branches.
    leaves.forEach(source => {
      const groups = new Map();
      source.outgoers('edge').forEach(edge => {
        const target = edge.target();
        if (!leafIds.has(target.id())) return;
        const position = guide.node(target.id());
        const pad = state.graph.pads.get(edge.data('sourcePadId'));
        const order = pad?.declarationOrder;
        if (!position || !Number.isFinite(order)) return;
        const parentId = target.parent().id() || '__root__';
        const key = `${parentId}|${position.x.toFixed(3)}`;
        if (!groups.has(key)) groups.set(key, new Map());
        const siblings = groups.get(key);
        const current = siblings.get(target.id());
        if (!current || order < current.order) siblings.set(target.id(), { id: target.id(), order, y: position.y });
      });
      groups.forEach(siblings => {
        if (siblings.size < 2) return;
        siblingOrderAssignments([...siblings.values()]).forEach(({ id, y }) => { guide.node(id).y = y; });
      });
    });

    const placements = [];
    const transitionGroups = new Map();
    const priorIds = previousVisible || new Set(leaves.map(node => node.id()));
    leaves.forEach(node => {
      const position = guide.node(node.id());
      if (!position) return;
      let parent = node.parent(), topParent = null;
      while (parent.length) {
        topParent = parent;
        parent = parent.parent();
      }
      const laneId = topParent ? topParent.id() : '__root__';
      const halfHeight = Math.max(node.outerHeight(), 30) / 2;
      let anchorNode = node;
      while (anchorNode.length && !priorIds.has(anchorNode.id())) anchorNode = anchorNode.parent();
      const groupId = anchorNode.length ? anchorNode.id() : node.id();
      const groupKey = `${laneId}|${groupId}`;
      const group = transitionGroups.get(groupKey) || {
        laneId,
        anchorY: state.positions.get(groupId)?.y,
        minY: Infinity,
        maxY: -Infinity,
        offset: 0,
        padded: anchorNode.length ? anchorNode.isParent() : false,
        transitioned: anchorNode.length ? anchorNode.id() !== node.id() : false
      };
      group.minY = Math.min(group.minY, position.y - halfHeight);
      group.maxY = Math.max(group.maxY, position.y + halfHeight);
      transitionGroups.set(groupKey, group);
      placements.push({ node, position, laneId, groupKey, halfHeight });
    });

    // Newly revealed descendants share the old collapsed bin as a transition
    // anchor. Correct only order inversions involving those blocks so Dagre's
    // compact layout is retained while adjacent siblings do not swap sides.
    const groupsByLane = new Map();
    for (const group of transitionGroups.values()) {
      if (group.padded) { group.minY -= 36; group.maxY += 36; }
      if (!groupsByLane.has(group.laneId)) groupsByLane.set(group.laneId, []);
      groupsByLane.get(group.laneId).push(group);
    }
    const groupGap = nodeCount > 100 ? 44 : 62;
    for (const groups of groupsByLane.values()) {
      const transitioned = groups.filter(group => group.transitioned && Number.isFinite(group.anchorY));
      for (const group of transitioned) {
        const originalCenter = (group.minY + group.maxY) / 2;
        const formerlyAbove = groups.filter(other => other !== group && Number.isFinite(other.anchorY) && other.anchorY < group.anchorY - 1);
        for (const other of formerlyAbove) {
          const otherCenter = (other.minY + other.maxY) / 2 + other.offset;
          if (otherCenter >= originalCenter + group.offset) {
            group.offset = Math.max(group.offset, other.maxY + other.offset + groupGap - group.minY);
          }
        }
        const adjustedCenter = originalCenter + group.offset;
        const formerlyBelow = groups.filter(other => other !== group && Number.isFinite(other.anchorY) && other.anchorY > group.anchorY + 1);
        for (const other of formerlyBelow) {
          const otherCenter = (other.minY + other.maxY) / 2 + other.offset;
          if (otherCenter <= adjustedCenter) {
            other.offset = Math.max(other.offset, group.maxY + group.offset + groupGap - other.minY);
          }
        }
      }
    }

    const lanes = new Map();
    placements.forEach(placement => {
      const group = transitionGroups.get(placement.groupKey);
      placement.position = { ...placement.position, y: placement.position.y + group.offset };
      const lane = lanes.get(placement.laneId) || { id: placement.laneId, minY: Infinity, maxY: -Infinity, offset: 0 };
      lane.minY = Math.min(lane.minY, placement.position.y - placement.halfHeight);
      lane.maxY = Math.max(lane.maxY, placement.position.y + placement.halfHeight);
      lanes.set(placement.laneId, lane);
    });

    // Compound parents resize around their children after layout. Keep each
    // expanded top-level bin in its own vertical lane so that resize cannot
    // engulf or overlap unrelated root-level nodes.
    const orderedLanes = [...lanes.values()].sort((a, b) => {
      if (a.id === '__root__') return -1;
      if (b.id === '__root__') return 1;
      return a.minY - b.minY;
    });
    let laneTop = 44;
    const laneGap = nodeCount > 100 ? 96 : 140;
    orderedLanes.forEach(lane => {
      lane.offset = laneTop - lane.minY;
      laneTop += lane.maxY - lane.minY + laneGap;
    });
    cy.batch(() => placements.forEach(({ node, position, laneId }) => {
      node.position({ x: position.x, y: position.y + lanes.get(laneId).offset });
    }));
    placePadBadges();
    applyEdgeGeometry();
    if (fit) cy.fit(undefined, 44);
    rememberPositions();
  }

  function toggleBin(id) {
    if (id === state.graph.pipeline) return;
    const expanding = state.collapsed.has(id);
    if (expanding) state.collapsed.delete(id); else state.collapsed.add(id);
    render({ layout: true, fit: !expanding });
    if (expanding) {
      const bin = state.cy.getElementById(id);
      const descendants = bin.descendants();
      const boundary = descendants.connectedEdges().connectedNodes();
      state.cy.fit(bin.union(descendants).union(boundary), 58);
    }
    showItem(id);
  }

  function isDescendantOf(id, ancestorId) {
    let item = state.graph.items.get(id);
    while (item?.parent) {
      if (item.parent === ancestorId) return true;
      item = state.graph.items.get(item.parent);
    }
    return false;
  }

  function expandOneLevel() {
    const selected = state.graph.items.get(state.selectedId);
    let candidates;
    if (selected?.kind === 'bin' && selected.id !== state.graph.pipeline) {
      candidates = state.collapsed.has(selected.id)
        ? [selected.id]
        : [...state.collapsed].filter(id => isDescendantOf(id, selected.id));
    } else {
      candidates = [...state.collapsed];
    }
    if (!candidates.length) return;
    const depth = Math.min(...candidates.map(id => state.graph.items.get(id)?.depth ?? 999));
    for (const id of candidates) if (state.graph.items.get(id)?.depth === depth) state.collapsed.delete(id);
    state.preset = '';
    render({ layout: true });
  }

  function showDetails(target) {
    if (target.isEdge()) return showEdge(target.data());
    const padId = target.data('padId');
    if (padId) return showPad(state.graph.pads.get(padId), target.data('linked'));
    showItem(target.id());
  }

  const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  function showItem(id) {
    const item = state.graph.items.get(id);
    if (!item) return;
    const parent = item.parent ? state.graph.items.get(item.parent) : null;
    const padRows = item.pads.map(pid => state.graph.pads.get(pid)).filter(Boolean).map(p => `<span class="pill">${esc(p.direction)} · ${esc(p.name)}${p.linked ? '' : ' · unlinked'}</span>`).join('');
    const props = Object.keys(item.properties).length ? `<div class="section-label">Properties</div><div class="code">${Object.entries(item.properties).map(([k,v]) => `${esc(k)} = ${esc(v)}`).join('\n')}</div>` : '';
    const action = item.kind === 'bin' && id !== state.graph.pipeline ? `<button class="button" id="inspectorToggle">${state.collapsed.has(id) ? 'Expand bin' : 'Collapse bin'}</button>` : '';
    ui.details.innerHTML = `<div class="eyebrow">${esc(item.kind)}</div><h2>${esc(item.name)}</h2><div class="detail-grid"><dt>Factory</dt><dd>${esc(item.factory)}</dd><dt>State</dt><dd>${esc(item.state || 'Not reported')}</dd><dt>Parent</dt><dd>${esc(parent?.name || '—')}</dd><dt>DOT id</dt><dd>${esc(item.id)}</dd></div>${action}<div class="section-label">Pads · ${item.pads.length}</div><div>${padRows || '<span class="muted">No pads recovered</span>'}</div>${props}`;
    $('inspectorToggle')?.addEventListener('click', () => toggleBin(id));
  }

  function showPad(pad, visiblyLinked = pad.linked) {
    const owner = state.graph.items.get(pad.element);
    ui.details.innerHTML = `<div class="eyebrow">${esc(pad.direction)} pad</div><h2>${esc(pad.name)}</h2><div class="detail-grid"><dt>Element</dt><dd>${esc(owner?.name)}</dd><dt>Visible link</dt><dd>${visiblyLinked ? 'Yes' : 'No'}</dd><dt>Linked in DOT</dt><dd>${pad.linked ? 'Yes' : 'No'}</dd><dt>Flags</dt><dd>${esc(pad.flags || '—')}</dd><dt>DOT id</dt><dd>${esc(pad.id)}</dd></div>`;
  }

  function showEdge(data) {
    const first = data.links?.[0];
    const last = data.links?.at(-1);
    const source = first ? state.graph.items.get(first.sourceElement) : state.graph.items.get(data.source);
    const target = last ? state.graph.items.get(last.sinkElement) : state.graph.items.get(data.target);
    const srcPad = first ? state.graph.pads.get(first.sourcePad) : null;
    const sinkPad = last ? state.graph.pads.get(last.sinkPad) : null;
    const hidden = (data.hiddenPath || []).map(id => state.graph.items.get(id)?.name || id);
    ui.details.innerHTML = `<div class="eyebrow">${data.synthetic ? 'Contracted link' : 'Link'}</div><h2>${esc(source?.name || data.source)} → ${esc(target?.name || data.target)}</h2><div class="detail-grid"><dt>Source</dt><dd>${esc(source?.name)}${srcPad ? ':' + esc(srcPad.name) : ''}</dd><dt>Sink</dt><dd>${esc(target?.name)}${sinkPad ? ':' + esc(sinkPad.name) : ''}</dd><dt>Paths</dt><dd>${data.links?.length || 1}</dd></div>${hidden.length ? `<div class="section-label">Contracted path</div><div class="code path-chip">${esc(source?.name)} → ${hidden.map(esc).join(' → ')} → ${esc(target?.name)}</div>` : ''}<div class="section-label">Negotiated caps</div><div class="code">${esc(data.caps || 'No caps reported')}</div>`;
  }

  function syncControls() {
    ui.queues.checked = state.options.queues;
    ui.tees.checked = state.options.redundantTees;
    ui.pads.checked = state.options.unlinkedPads;
    ui.caps.value = state.options.caps;
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === state.preset));
  }

  function applyPreset(name) {
    const bins = [...state.graph.items.values()].filter(x => x.kind === 'bin' && x.id !== state.graph.pipeline);
    state.preset = name;
    if (name === 'architectural') {
      state.options = { queues: false, redundantTees: false, unlinkedPads: false, caps: 'media' };
      state.collapsed = new Set(bins.map(x => x.id));
    } else if (name === 'normal') {
      state.options = { queues: false, redundantTees: true, unlinkedPads: false, caps: 'media' };
      state.collapsed = new Set(bins.filter(x => x.depth >= 3).map(x => x.id));
    } else {
      state.options = { queues: true, redundantTees: true, unlinkedPads: true, caps: 'full' };
      state.collapsed.clear();
    }
    render({ layout: true });
  }

  function search() {
    if (!state.cy) return;
    const q = ui.search.value.trim().toLowerCase();
    state.cy.elements().removeClass('search-match search-dim');
    if (!q) return;
    const modelMatches = [...state.graph.items.values()].filter(item =>
      item.id !== state.graph.pipeline && `${item.name} ${item.factory}`.toLowerCase().includes(q)
    );

    if (modelMatches.length === 1) {
      const item = modelMatches[0];
      let changed = false;
      let ancestor = item.parent ? state.graph.items.get(item.parent) : null;
      while (ancestor) {
        if (state.collapsed.delete(ancestor.id)) changed = true;
        ancestor = ancestor.parent ? state.graph.items.get(ancestor.parent) : null;
      }
      if (isQueue(item) && !state.options.queues) { state.options.queues = true; changed = true; }
      if (isTee(item) && !state.options.redundantTees) { state.options.redundantTees = true; changed = true; }
      if (changed) {
        state.preset = '';
        state.selectedId = item.id;
        render({ layout: true, fit: false });
        return;
      }
    }

    const modelMatchIds = new Set(modelMatches.map(item => item.id));
    const matches = state.cy.nodes().filter(n => n.data('kind') !== 'pad' && modelMatchIds.has(n.id()));
    const matchIds = new Set(matches.map(node => node.id()));
    const matchedPadBadges = state.cy.nodes().filter(node => node.data('kind') === 'pad' && matchIds.has(node.data('ownerId')));
    state.cy.elements().addClass('search-dim');
    matches.removeClass('search-dim').addClass('search-match');
    matchedPadBadges.removeClass('search-dim');
    matches.connectedEdges().removeClass('search-dim');
    if (matches.length) {
      const primary = modelMatches.length === 1 ? state.cy.getElementById(modelMatches[0].id) : matches[0];
      state.cy.animate({ center: { eles: primary }, zoom: Math.max(state.cy.zoom(), .9) }, { duration: 260 });
      state.selectedId = primary.id();
      state.cy.nodes().unselect();
      primary.select();
      focusTrace(primary);
      showDetails(primary);
    }
    ui.stats.textContent = `${modelMatches.length} match${modelMatches.length === 1 ? '' : 'es'} for “${ui.search.value}”`;
  }

  async function loadText(text, filename) {
    try {
      ui.loading.classList.remove('hidden');
      ui.fileName.textContent = filename;
      state.filename = filename;
      state.graph = parseDot(text, filename);
      state.positions.clear();
      state.selectedId = null;
      applyPreset('architectural');
      showItem(state.graph.pipeline);
    } catch (error) {
      ui.loading.classList.add('hidden');
      ui.stats.textContent = 'Could not parse DOT';
      ui.details.innerHTML = `<div class="eyebrow">Import error</div><h2>This DOT file could not be read</h2><p class="muted">${esc(error.message)}</p>`;
      console.error(error);
    }
  }

  async function loadBuiltIn() {
    const response = await fetch('samples/playbin3-hang.dot');
    if (!response.ok) throw new Error('Built-in sample is unavailable');
    loadText(await response.text(), 'playbin3-hang.dot');
  }

  function makeStressDot() {
    const out = ['digraph pipeline {', 'rankdir=LR;', 'label="<GstPipeline>\\nstress-pipeline\\n[>]";'];
    let previous = null;
    for (let stage = 0; stage < 14; stage++) {
      out.push(`subgraph cluster_stage_${stage} {`, `label="GstBin\\nstage_${String(stage).padStart(2, '0')}\\n[>]";`);
      for (let i = 0; i < 20; i++) {
        const id = `s${stage}_e${i}`;
        const factory = i === 0 && stage === 0 ? 'GstVideoTestSrc' : i % 7 === 0 ? 'GstTee' : i % 4 === 0 ? 'GstQueue' : i % 3 === 0 ? 'GstVideoConvert' : 'GstIdentity';
        const name = factory === 'GstQueue' ? `queue_${stage}_${i}` : factory === 'GstTee' ? `tee_${stage}_${i}` : `element_${stage}_${i}`;
        out.push(
          `subgraph cluster_${id} {`,
          `label="${factory}\\n${name}\\n[>]";`,
          `subgraph cluster_${id}_sink {`, 'label="";', `${id}_sink [label="sink\\n[>][bfb]"];`, '}',
          `subgraph cluster_${id}_src {`, 'label="";', `${id}_src [label="src\\n[>][bfb]"];`, '}',
          '}'
        );
        if (previous) out.push(`${previous} -> ${id}_sink [label="video/x-raw\\l format: NV12\\l width: 1920\\l height: 1080\\l framerate: 60/1\\l"];`);
        previous = `${id}_src`;
      }
      out.push('}');
    }
    out.push('}');
    return out.join('\n');
  }

  ui.openButton.addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', async () => { const file = ui.fileInput.files[0]; if (file) loadText(await file.text(), file.name); });
  $('sampleSelect').addEventListener('change', e => {
    if (e.target.value === 'stress') loadText(makeStressDot(), 'synthetic-stress-280.dot');
    else loadBuiltIn();
  });
  document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => applyPreset(btn.dataset.preset)));
  $('fitButton').addEventListener('click', () => state.cy?.fit(undefined, 42));
  $('layoutButton').addEventListener('click', () => runLayout(true));
  ui.queues.addEventListener('change', () => { state.preset = ''; state.options.queues = ui.queues.checked; render({ layout: true }); });
  ui.tees.addEventListener('change', () => { state.preset = ''; state.options.redundantTees = ui.tees.checked; render({ layout: true }); });
  ui.pads.addEventListener('change', () => { state.preset = ''; state.options.unlinkedPads = ui.pads.checked; render({ layout: true }); });
  ui.caps.addEventListener('change', () => { state.preset = ''; state.options.caps = ui.caps.value; render({ layout: false, fit: false }); });
  let searchTimer;
  ui.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 180);
  });
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.search.focus(); } });
  $('collapseAll').addEventListener('click', () => { state.collapsed = new Set([...state.graph.items.values()].filter(x => x.kind === 'bin' && x.id !== state.graph.pipeline).map(x => x.id)); state.preset = ''; render({ layout: true }); });
  $('expandAll').addEventListener('click', () => { state.collapsed.clear(); state.preset = ''; render({ layout: true }); });
  $('expandLevel').addEventListener('click', expandOneLevel);
  $('compareButton').addEventListener('click', async () => {
    ui.compare.showModal();
    const host = $('rawGraphviz');
    if (host.dataset.rendered === state.filename) return;
    host.dataset.rendered = state.filename;
    host.innerHTML = '<div class="loading-inline"><span></span>Rendering the complete DOT graph…</div>';
    try {
      const renderer = await Viz.instance();
      const svg = renderer.renderSVGElement(state.graph.source);
      host.replaceChildren(svg);
      requestAnimationFrame(() => {
        const hostBox = host.getBoundingClientRect();
        const firstNode = [...svg.querySelectorAll('g.node')]
          .filter(node => node.querySelector('title')?.textContent !== 'legend')
          .sort((a, b) => {
            const aBox = a.getBoundingClientRect();
            const bBox = b.getBoundingClientRect();
            return aBox.left - bBox.left || aBox.top - bBox.top;
          })[0];
        const nodeBox = firstNode?.getBoundingClientRect();
        host.scrollTo({
          left: Math.max(0, (nodeBox?.left || hostBox.left) - hostBox.left - 28),
          top: Math.max(0, (nodeBox?.top || hostBox.top) - hostBox.top - 48)
        });
      });
    } catch (error) {
      host.innerHTML = `<div class="muted">Graphviz could not render this file: ${esc(error.message)}</div>`;
    }
  });
  $('closeCompare').addEventListener('click', () => ui.compare.close());

  let dragDepth = 0;
  document.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; ui.dropOverlay.classList.add('show'); });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; ui.dropOverlay.classList.remove('show'); } });
  document.addEventListener('drop', async e => { e.preventDefault(); dragDepth = 0; ui.dropOverlay.classList.remove('show'); const file = [...e.dataTransfer.files].find(f => f.name.endsWith('.dot')); if (file) loadText(await file.text(), file.name); });

  if (new URLSearchParams(location.search).get('sample') === 'stress') {
    $('sampleSelect').value = 'stress';
    loadText(makeStressDot(), 'synthetic-stress-280.dot');
  } else {
    loadBuiltIn().catch(error => { ui.loading.textContent = error.message; console.error(error); });
  }
})();
