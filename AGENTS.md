# GstScope contributor instructions

These instructions apply to every change in this repository.

## Product invariants

- Treat the GStreamer DOT file as the semantic source of truth. Do not invent
  links, pads, or ordering that the input does not support.
- Preserve left-to-right flow: links leave the right side of sources and enter
  the left side of sinks. Multiple pads use distinct attachment points.
- Linked and unlinked pads are rendered inside their owning node. The unlinked
  pads control hides only unlinked pads; it must not hide linked pads.
- Bin boundary pads sit just inside the bin edge and connect to their represented
  internal pads. Internal routes must not leave and re-enter their container.
- Keep declaration order as the deterministic ordering fallback. Do not infer
  order from trailing numbers in element or pad names.
- Expanding and collapsing a bin must preserve sibling order and make every
  previously expanded descendant collapsible after its parent is reopened.
- Search may expand ancestors to reveal a match. Clearing search restores normal
  visibility without corrupting expansion or selection state.

## Canonical layout fixture

The primary acceptance scenario is `/Users/dheitmueller/proto1.dot` in **Normal**
view. Use the Normal defaults: queues hidden, redundant tees shown, unlinked pads
hidden, and caps set to **Media Type**. Do not substitute Architectural view or
an Expand All state when evaluating this fixture.

Use the local build in the Codex web panel while iterating. Do not take control of
the user's browser. Verify GitHub Pages only once after local checks pass and the
change is deployed.

## Required checks

Before showing or deploying a result:

1. Run `pnpm run check`.
2. Load the canonical fixture locally and wait for layout settling.
3. Read `window.gstscopeLayoutAudit()` and require zero hard errors:
   sibling overlap, containment failure, route-through-node, and container
   excursion/re-entry, extreme bin density, and multi-screen gaps between
   connected containers.
4. Review all new or worsened warnings for excessive turns, route detours, route
   length, connected-object gaps, shared route segments, label/node overlap, and
   poor bin density. Inspect the highest-cost offenders visually.
5. Check the built-in Architectural and stress samples when the change affects
   projection, expansion, routing, labels, pads, or compound layout.
6. Run `git diff --check` and inspect the final diff before committing.
7. After deployment, verify the GitHub Pages build in the Codex web panel.

See `LAYOUT_QUALITY.md` for thresholds and the acceptance sequence. A warning is
not automatically fatal, but it must be understood before accepting a regression.

## Change discipline

- Prefer deterministic, testable geometry helpers over accumulating special-case
  offsets in the renderer.
- Add a focused synthetic test when changing routing, ordering, containment,
  labels, pads, or expand/collapse behavior.
- Diagnose an audit failure before adjusting thresholds. Relax a threshold only
  when the metric is a false positive across legitimate layouts.
- Preserve unrelated user changes and avoid destructive Git operations.
- Keep GitHub Pages assets repository-relative and bump the application script's
  cache key when browser-visible code changes.
