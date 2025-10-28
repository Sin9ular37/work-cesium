export function useRenderLifecycle({
  cesiumContainer,
  getViewer,
  setViewer,
  initializeViewer,
  onBeforeDestroy = () => {},
  onAfterRestart = () => {},
  logger = () => {},
  restartCooldownMs = 2000,
  restartDelayMs = 300
}) {
  let resizeObserver = null;
  let visibilityHandler = null;
  let restartTimer = null;
  let webglContextHandlers = null;
  let renderLoopPaused = false;
  let restarting = false;
  let lastRestartAt = 0;

  const ensureViewer = () => {
    try {
      return getViewer?.() || null;
    } catch (_) {
      return null;
    }
  };

  const emitLog = (level, ...args) => {
    try {
      if (logger && typeof logger[level] === 'function') {
        logger[level](...args);
        return;
      }
      if (typeof logger === 'function') {
        if (level === 'warn' || level === 'error') {
          logger(`[${level.toUpperCase()}]`, ...args);
        } else {
          logger(...args);
        }
        return;
      }
      if (logger && typeof logger.log === 'function') {
        logger.log(...args);
      }
    } catch (_) {}
  };

  const callLogger = (...args) => emitLog('debug', ...args);
  const logWarn = (...args) => emitLog('warn', ...args);
  const logError = (...args) => emitLog('error', ...args);

  const pauseRenderLoop = () => {
    const viewer = ensureViewer();
    if (!viewer || typeof viewer.isDestroyed === 'function' && viewer.isDestroyed()) return;
    try {
      if (!renderLoopPaused && viewer.useDefaultRenderLoop) {
        viewer.useDefaultRenderLoop = false;
        renderLoopPaused = true;
      }
    } catch (_) {}
  };

  const resumeRenderLoop = () => {
    const viewer = ensureViewer();
    if (!viewer || typeof viewer.isDestroyed === 'function' && viewer.isDestroyed()) {
      renderLoopPaused = false;
      return;
    }
    try {
      if (!viewer.useDefaultRenderLoop) {
        viewer.useDefaultRenderLoop = true;
      }
      renderLoopPaused = false;
    } catch (_) {}
  };

  const isCanvasRenderable = () => {
    const viewer = ensureViewer();
    if (!viewer) return false;
    try {
      const canvas = viewer.scene?.canvas;
      if (!canvas) return false;
      return (
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    } catch (_) {
      return false;
    }
  };

  const safeResize = () => {
    const viewer = ensureViewer();
    const container = cesiumContainer?.value || null;
    if (!viewer || !container) return;

    const { clientWidth: width, clientHeight: height } = container;
    const canvas = viewer.scene?.canvas;

    if (!width || !height || !canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      try {
        if (viewer.scene) {
          viewer.scene.requestRenderMode = true;
        }
      } catch (_) {}
      pauseRenderLoop();
      scheduleViewerRestart('resize');
      return;
    }

    resumeRenderLoop();
    if (typeof viewer.resize === 'function') {
      try {
        viewer.resize();
      } catch (_) {}
    }
    if (viewer.scene) {
      try {
        viewer.scene.requestRenderMode = false;
        if (typeof viewer.scene.requestRender === 'function') {
          viewer.scene.requestRender();
        }
      } catch (_) {}
    }
  };

  const setupResizeObservation = () => {
    const container = cesiumContainer?.value;
    if (!container) return;

    if (typeof ResizeObserver !== 'undefined') {
      if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          try {
            safeResize();
          } catch (_) {}
        });
      }
      try {
        resizeObserver.observe(container);
      } catch (err) {
        logWarn('[useRenderLifecycle] ResizeObserver 观察失败:', err);
      }
    }

    window.addEventListener('resize', safeResize);
    if (!visibilityHandler) {
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          setTimeout(() => {
            try {
              safeResize();
            } catch (_) {}
          }, 0);
        }
      };
    }
    document.addEventListener('visibilitychange', visibilityHandler);
  };

  const teardownResizeObservation = () => {
    try {
      if (resizeObserver && cesiumContainer?.value) {
        resizeObserver.unobserve(cesiumContainer.value);
      }
      resizeObserver = null;
    } catch (_) {}

    window.removeEventListener('resize', safeResize);
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  };

  const unbindWebGLContextHandlers = () => {
    if (!webglContextHandlers) return;
    const { canvas, onLost, onRestored } = webglContextHandlers;
    if (canvas) {
      try { canvas.removeEventListener('webglcontextlost', onLost, false); } catch (_) {}
      try { canvas.removeEventListener('webglcontextrestored', onRestored, false); } catch (_) {}
    }
    webglContextHandlers = null;
  };

  const bindWebGLContextHandlers = () => {
    const viewer = ensureViewer();
    if (!viewer) return;
    const canvas = viewer.scene?.canvas;
    if (!canvas) return;

    if (webglContextHandlers && webglContextHandlers.canvas === canvas) {
      return;
    }

    unbindWebGLContextHandlers();

    const onLost = (event) => {
      logWarn('⚠️ WebGL 上下文丢失');
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    };
    const onRestored = () => {
      callLogger('🛠 WebGL 上下文已恢复，触发安全 resize');
      setTimeout(() => {
        try {
          safeResize();
        } catch (_) {}
      }, 0);
    };

    try {
      canvas.addEventListener('webglcontextlost', onLost, false);
      canvas.addEventListener('webglcontextrestored', onRestored, false);
      webglContextHandlers = { canvas, onLost, onRestored };
    } catch (err) {
      logWarn('[useRenderLifecycle] 绑定 WebGL 事件失败:', err);
    }
  };

  const scheduleViewerRestart = (origin = '') => {
    if (restarting) return;
    const now = Date.now();
    if (lastRestartAt && now - lastRestartAt < restartCooldownMs) return;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }

    pauseRenderLoop();
    restartTimer = setTimeout(async () => {
      restartTimer = null;
      if (restarting) return;
      const container = cesiumContainer?.value;
      const hasSize = container?.clientWidth > 0 && container?.clientHeight > 0;
      if (!hasSize || !isCanvasRenderable()) {
        await restartViewer(origin || 'schedule');
      } else {
        try {
          safeResize();
        } catch (_) {}
      }
    }, restartDelayMs);
  };

  const restartViewer = async (reason = '') => {
    if (restarting) return;
    restarting = true;
    lastRestartAt = Date.now();

    pauseRenderLoop();
    logWarn('🔁 正在重启 Cesium Viewer', reason ? `（原因：${reason}）` : '');

    try {
      teardownResizeObservation();
      unbindWebGLContextHandlers();
      try {
        await Promise.resolve(onBeforeDestroy?.());
      } catch (_) {}

      const viewer = ensureViewer();
      if (viewer) {
        try { viewer.scene?.primitives?.removeAll?.(); } catch (_) {}
        try { viewer.destroy(); } catch (_) {}
      }
      if (typeof setViewer === 'function') {
        try { setViewer(null); } catch (_) {}
      }

      const waitUntilRenderable = async (timeoutMs = 5000) => {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
          const el = cesiumContainer?.value;
          if (el && el.clientWidth > 0 && el.clientHeight > 0) return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
      };
      await waitUntilRenderable();

      const nextViewer = await Promise.resolve(initializeViewer?.());
      if (nextViewer && typeof setViewer === 'function') {
        setViewer(nextViewer);
      }
      resumeRenderLoop();
      bindWebGLContextHandlers();
      try {
        await Promise.resolve(onAfterRestart?.(nextViewer));
      } catch (_) {}
    } catch (error) {
      logError('重启 Viewer 失败:', error);
    } finally {
      restarting = false;
    }
  };

  const dispose = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    teardownResizeObservation();
    unbindWebGLContextHandlers();
  };

  return {
    pauseRenderLoop,
    resumeRenderLoop,
    isCanvasRenderable,
    safeResize,
    setupResizeObservation,
    teardownResizeObservation,
    bindWebGLContextHandlers,
    scheduleViewerRestart,
    restartViewer,
    dispose
  };
}

