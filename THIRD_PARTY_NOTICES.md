# Third-party notices

The production build copies browser bundles from these locked npm dependencies:

- Cytoscape.js 3.34.3 — MIT License — <https://github.com/cytoscape/cytoscape.js>
- Cytoscape-Dagre 4.0.1 — MIT License — <https://github.com/cytoscape/cytoscape.js-dagre>
- Cytoscape Navigator 2.0.2 — MIT License — <https://github.com/cytoscape/cytoscape.js-navigator>
- Dagre 0.8.5 — MIT License — <https://github.com/dagrejs/dagre>
- Viz.js 3.30.0 and its included Graphviz build — MIT and upstream component licenses — <https://github.com/mdaines/viz-js>

The GstScope-generated sample DOT files are original fixtures licensed under
GPL-2.0-or-later. Their pipeline topologies are based on examples in the
GStreamer Project documentation. Source references and credited documentation
authors are recorded in `src/sample-catalog.js` and shown in the application.
Three unmodified GStreamer 1.26 DOT captures from GstPipelineStudio are bundled
under that project's GPL-3.0-or-later license. They were introduced by Stéphane
Cerveau and remain byte-for-byte identical to the upstream files at commit
`056bea68fc5397b9355611af718e407573d624af`:

- `data/dots/gst126_filesrc_video_audio.dot`
- `data/dots/gst126_filesrc_bbb_tooltip.dot`
- `data/dots/gst126_filesrc_jelly_tooltip.dot`

Source: <https://gitlab.freedesktop.org/dabrain34/GstPipelineStudio>
