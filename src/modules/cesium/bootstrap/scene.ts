import type { Viewer } from 'cesium';
import {
  Math as CesiumMath,
  Cartesian3,
  ScreenSpaceEventType,
  Cartesian2
} from 'cesium';

import type { CesiumLogHandler } from '@/constants/cesium';
import { APP_CONFIG } from '../../../config/appConfig';

export function applySceneOptimizations(
  viewer: Viewer,
  logger: CesiumLogHandler = () => {}
): void {
  const { scene } = viewer;

  const sceneConfig = APP_CONFIG.scene || {};
  const toggles = sceneConfig.toggles || {};
  const requestRender = sceneConfig.requestRender || {};
  const globeConfig = sceneConfig.globe || {};
  const controllerConfig = sceneConfig.cameraController || {};
  const clockConfig = sceneConfig.clock || {};

  scene.highDynamicRange = !!toggles.highDynamicRange;
  scene.logarithmicDepthBuffer = !!toggles.logarithmicDepthBuffer;
  scene.fog.enabled = !!toggles.fog;
  scene.skyAtmosphere.show = !!toggles.skyAtmosphere;
  scene.sun.show = !!toggles.sun;
  scene.moon.show = !!toggles.moon;

  scene.requestRenderMode = !!requestRender.enabled;
  if (Number.isFinite(requestRender.maximumRenderTimeChangeMs)) {
    scene.maximumRenderTimeChange = requestRender.maximumRenderTimeChangeMs;
  }

  if (scene.globe) {
    if (Number.isFinite(globeConfig.maximumScreenSpaceError)) {
      scene.globe.maximumScreenSpaceError = globeConfig.maximumScreenSpaceError;
    }
    if (Number.isFinite(globeConfig.tileCacheSize)) {
      scene.globe.tileCacheSize = globeConfig.tileCacheSize;
    }
  }

  const controller = scene.screenSpaceCameraController;
  controller.enableCollisionDetection =
    controllerConfig.enableCollisionDetection ?? controller.enableCollisionDetection;
  if (Number.isFinite(controllerConfig.minimumCollisionTerrainHeight)) {
    controller.minimumCollisionTerrainHeight = controllerConfig.minimumCollisionTerrainHeight;
  }

  try {
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  } catch (_) {
    /* ignore */
  }

  try {
    viewer.screenSpaceEventHandler.setInputAction((event) => {
      try {
        const picked = scene.pick(event.position);
        if (picked?.id) {
          logger('[CesiumBoot] 双击实体', picked.id.name ?? picked.id.id);
        }
      } catch (_) {
        /* ignore */
      }
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  } catch (_) {
    /* ignore */
  }

  viewer.clock.shouldAnimate = !!clockConfig.shouldAnimate;
}

export function applyDefaultCameraView(
  viewer: Viewer,
  pose: {
    longitude: number;
    latitude: number;
    height: number;
    heading?: number;
    pitch?: number;
    roll?: number;
    duration?: number;
  }
): void {
  const { longitude, latitude, height, heading = 0, pitch = -75, roll = 0, duration = 0 } = pose;

  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(longitude, latitude, height),
    orientation: {
      heading: CesiumMath.toRadians(heading),
      pitch: CesiumMath.toRadians(pitch),
      roll: CesiumMath.toRadians(roll)
    },
    duration
  });
}

export function setupSceneLogging(viewer: Viewer, logger: CesiumLogHandler): () => void {
  const disposeFns: Array<() => void> = [];

  const tileProgress = (queuedTileCount: number) => {
    if (queuedTileCount === 0) {
      logger('[CesiumBoot] 所有地形瓦片加载完成');
    }
  };

  const renderError = (_scene: Viewer['scene'], error: Error) => {
    logger('[CesiumBoot] Cesium 渲染错误', error);
  };

  viewer.scene.globe.tileLoadProgressEvent.addEventListener(tileProgress);
  viewer.scene.renderError.addEventListener(renderError);

  disposeFns.push(() => {
    viewer.scene.globe.tileLoadProgressEvent.removeEventListener(tileProgress);
    viewer.scene.renderError.removeEventListener(renderError);
  });

  const preRender = () => {
    if (viewer.scene.canvas.clientWidth > 0 && viewer.scene.canvas.clientHeight > 0) {
      try {
        viewer.scene.requestRenderMode = false;
      } catch (_) {
        /* ignore */
      }
    }
  };

  viewer.scene.preRender.addEventListener(preRender);
  disposeFns.push(() => {
    viewer.scene.preRender.removeEventListener(preRender);
  });

  const clickHandler = (movement: { position: Cartesian2 }) => {
    try {
      const picked = viewer.scene.pick(movement.position);
      if (picked?.id) {
        logger('[CesiumBoot] 点击实体', picked.id.id ?? picked.id.name);
      }
    } catch (_) {
      /* ignore */
    }
  };

  try {
    viewer.screenSpaceEventHandler.setInputAction(clickHandler, ScreenSpaceEventType.LEFT_CLICK);
    disposeFns.push(() => {
      try {
        viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      } catch (_) {
        /* ignore */
      }
    });
  } catch (_) {
    /* ignore */
  }

  return () => {
    while (disposeFns.length) {
      const disposer = disposeFns.pop();
      try {
        disposer?.();
      } catch (_) {
        /* ignore */
      }
    }
  };
}
