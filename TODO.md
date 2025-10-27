# TODO

- [x] Wire up pauseRenderLoop()/resumeRenderLoop() helpers in `src/components/CesiumView.vue` to guard render when container/canvas is zero-sized.
- [x] Integrate render-loop pause in `scheduleViewerRestart()`/`restartViewer()` and resume after `initializeCesium()` finishes.
- [x] In preRender handlers, when `!isCanvasRenderable()`:
  - [x] Set `scene.requestRenderMode = true` (existing).
  - [x] Pause the default render loop and debounce restart to avoid thrash.
- [x] In `safeResize()`: when size becomes valid, resume the render loop and call `requestRender()` safely.
- [ ] Guard Viewer construction with a stronger wait (e.g. ResizeObserver readiness plus timeout) before instantiation.
- [ ] Validate manually: shrink container to zero height, navigate away/back, toggle panels rapidly.
- [ ] Add console breadcrumbs for size changes and restart reasons.
- [ ] If the issue persists, experiment with disabling globe depth/shadows while size==0 to rule out FBO creation failures.
