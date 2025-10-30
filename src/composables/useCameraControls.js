import { ref } from 'vue';
import { APP_CONFIG } from '../config/appConfig';

const cameraControlsConfig = APP_CONFIG.cameraControls || {};
const resolutionScaleRange = cameraControlsConfig.resolutionScaleRange || {};
const resolutionScaleMin = resolutionScaleRange.min ?? 0.6;
const resolutionScaleMaxWhileMoving = resolutionScaleRange.maxWhileMoving ?? 0.75;
const moveEndDebounceMs = cameraControlsConfig.moveEndDebounceMs ?? 120;
const wheelIdleDebounceMs = cameraControlsConfig.wheelIdleDebounceMs ?? 200;
const minTilesetSseWhileMoving = cameraControlsConfig.minTilesetSseWhileMoving ?? 8;

export function useCameraControls({
  Cesium,
  getViewer,
  getActiveTileset,
  currentActiveLayer,
  applyTilesetByLayer,
  logger = () => {}
}) {
  const isCameraMoving = ref(false);

  let moveStartHandler = null;
  let moveEndHandler = null;
  let wheelHandlerInstalled = false;
  let moveEndTimer = null;
  let wheelTimer = null;
  let prevResolutionScale = 1;
  let prevFxaaEnabled = null;
  let prevRequestRenderMode = null;
  let cameraChangedCleanup = null;

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

  const setupCameraMoveHandler = ({
    onCameraIdle = () => {},
    cancelPendingModeSwitch = () => {}
  } = {}) => {
    const viewer = ensureViewer();
    if (!viewer) {
      logWarn('[useCameraControls] viewer 未就绪，无法安装相机监听');
      return;
    }

    if (moveStartHandler || moveEndHandler || wheelHandlerInstalled) {
      callLogger('相机监听已存在，跳过重复安装');
      return;
    }

    moveStartHandler = () => {
      cancelPendingModeSwitch?.();
      isCameraMoving.value = true;
      const scene = viewer.scene;

      try {
        prevResolutionScale = viewer.resolutionScale ?? 1;
        const targetScale = Math.max(
          resolutionScaleMin,
          Math.min(prevResolutionScale, resolutionScaleMaxWhileMoving)
        );
        if (viewer.resolutionScale > targetScale) {
          viewer.resolutionScale = targetScale;
        }
      } catch (_) {}

      try {
        const fxaaStage = scene?.postProcessStages?.fxaa;
        if (fxaaStage && prevFxaaEnabled === null) {
          prevFxaaEnabled = !!fxaaStage.enabled;
          fxaaStage.enabled = false;
        }
        if (scene && prevRequestRenderMode === null) {
          prevRequestRenderMode = !!scene.requestRenderMode;
        }
        if (scene) {
          scene.requestRenderMode = false;
        }
      } catch (_) {}

        const tileset = getActiveTileset?.();
        if (tileset) {
          try {
            tileset._prevSSE = tileset.maximumScreenSpaceError;
            const baseline = tileset._prevSSE ?? 6;
            tileset.maximumScreenSpaceError = Math.max(baseline, minTilesetSseWhileMoving);
          } catch (_) {}
        }
      };

    moveEndHandler = () => {
      if (moveEndTimer) clearTimeout(moveEndTimer);
      moveEndTimer = setTimeout(() => {
        moveEndTimer = null;
        isCameraMoving.value = false;
        const scene = viewer.scene;

        try {
          if (scene) {
            if (prevRequestRenderMode !== null) {
              scene.requestRenderMode = prevRequestRenderMode;
            } else {
              scene.requestRenderMode = true;
            }
            prevRequestRenderMode = null;
            if (typeof scene.requestRender === 'function') {
              scene.requestRender();
            }
          }
        } catch (_) {}

        try {
          if (typeof prevResolutionScale === 'number') {
            viewer.resolutionScale = prevResolutionScale;
          }
        } catch (_) {}
        prevResolutionScale = viewer.resolutionScale ?? 1;

        try {
          const fxaaStage = scene?.postProcessStages?.fxaa;
          if (fxaaStage && prevFxaaEnabled !== null) {
            fxaaStage.enabled = prevFxaaEnabled;
          }
        } catch (_) {}
        prevFxaaEnabled = null;

        const tileset = getActiveTileset?.();
        if (tileset) {
          try {
            if (tileset._prevSSE != null) {
              tileset.maximumScreenSpaceError = tileset._prevSSE;
              tileset._prevSSE = null;
            }
          } catch (_) {}

          try {
            if (currentActiveLayer && currentActiveLayer.value) {
              applyTilesetByLayer?.(currentActiveLayer.value);
            }
          } catch (_) {}
        }

        try {
          onCameraIdle?.();
        } catch (_) {}
      }, moveEndDebounceMs);
    };

    try {
      viewer.camera.moveStart.addEventListener(moveStartHandler);
      viewer.camera.moveEnd.addEventListener(moveEndHandler);
    } catch (err) {
      logError('[useCameraControls] 安装相机事件失败:', err);
    }

    try {
      viewer.screenSpaceEventHandler.setInputAction(() => {
        if (wheelTimer) clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
          wheelTimer = null;
          try {
            onCameraIdle?.();
          } catch (_) {}
        }, wheelIdleDebounceMs);
      }, Cesium.ScreenSpaceEventType.WHEEL);
      wheelHandlerInstalled = true;
    } catch (err) {
      logError('[useCameraControls] 安装滚轮监听失败:', err);
    }

    callLogger('相机移动监听器已安装');
  };

  const installCameraIdleCallback = (callback, { debounceMs = 250 } = {}) => {
    const viewer = ensureViewer();
    if (!viewer || typeof callback !== 'function') return () => {};

    if (cameraChangedCleanup) {
      cameraChangedCleanup();
      cameraChangedCleanup = null;
    }

    let lodTimer = null;
    const handler = () => {
      if (isCameraMoving.value) return;
      if (lodTimer) clearTimeout(lodTimer);
      lodTimer = setTimeout(() => {
        lodTimer = null;
        try {
          callback();
        } catch (_) {}
      }, debounceMs);
    };

    viewer.camera.changed.addEventListener(handler);
    cameraChangedCleanup = () => {
      if (lodTimer) {
        clearTimeout(lodTimer);
        lodTimer = null;
      }
      try {
        viewer.camera.changed.removeEventListener(handler);
      } catch (_) {}
      cameraChangedCleanup = null;
    };

    return cameraChangedCleanup;
  };

  const teardownCameraHandlers = () => {
    const viewer = ensureViewer();

    if (moveEndTimer) clearTimeout(moveEndTimer);
    if (wheelTimer) clearTimeout(wheelTimer);
    moveEndTimer = null;
    wheelTimer = null;

    if (viewer) {
      try {
        if (moveStartHandler) viewer.camera.moveStart.removeEventListener(moveStartHandler);
      } catch (_) {}
      try {
        if (moveEndHandler) viewer.camera.moveEnd.removeEventListener(moveEndHandler);
      } catch (_) {}
      try {
        if (wheelHandlerInstalled) {
          viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.WHEEL);
        }
      } catch (_) {}
    }

    moveStartHandler = null;
    moveEndHandler = null;
    wheelHandlerInstalled = false;
    isCameraMoving.value = false;
    prevFxaaEnabled = null;
    prevRequestRenderMode = null;

    if (cameraChangedCleanup) {
      cameraChangedCleanup();
      cameraChangedCleanup = null;
    }
  };

  return {
    isCameraMoving,
    setupCameraMoveHandler,
    installCameraIdleCallback,
    teardownCameraHandlers
  };
}


