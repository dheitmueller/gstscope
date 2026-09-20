# Layout quality gate

Layout changes are not ready to show or deploy until they pass this gate.

## Canonical acceptance view

1. Build and serve the application locally.
2. Load `/Users/dheitmueller/proto1.dot`.
3. Select **Normal** view and leave its normal defaults in place: queues hidden,
   redundant tees shown, unlinked pads hidden, and caps set to **Media Type**.
4. Wait for the layout to settle, then inspect `window.gstscopeLayoutAudit()`.

This exact view is the primary regression fixture. The built-in Architectural and
stress views are secondary checks.

## Hard failures

The audit must report zero errors:

- no overlap between sibling elements or bins;
- every child remains inside its parent bin;
- no route crosses through an unrelated node or bin;
- no route between objects in the same container leaves and re-enters it.
- no bin is extremely oversized for its visible element count;
- no logically connected containers are separated by a multi-screen gap.

## Regression warnings

Warnings identify the first places to inspect and compare with the previous
accepted baseline:

- excessive route turns or detours;
- bin-pad connectors that bend despite unobstructed room to align the boundary
  pad with its visible internal peer pad;
- very long links or excessive gaps between connected objects or containers;
- long route segments shared by unrelated links;
- link labels overlapping nodes;
- expanded bins whose area is disproportionate to their visible element count.

The report includes the involved Cytoscape IDs and measured values. A warning is
not automatically fatal, but a new or materially worse warning must be understood
before the result is shown or deployed.

## Acceptance sequence

1. Run `pnpm run check`.
2. Run the canonical local view in the Codex web panel.
3. Require zero hard errors and review the highest-cost warnings, especially the
   named bins involved in the current change.
4. Visually inspect the canonical view and the relevant secondary fixture.
5. Commit and deploy only after those checks pass.
6. Verify the deployed GitHub Pages build once, in the Codex web panel.
