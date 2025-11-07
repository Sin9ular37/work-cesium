import { onMounted, onUnmounted, reactive, ref, computed } from 'vue';
import type { Ref } from 'vue';
import * as Cesium from 'cesium';

import { useSearchWidget } from './useSearchWidget';
import { useTopicPanel } from './useTopicPanel';
import { useInfoPanel } from './useInfoPanel';
import { useUiFeedback } from './useUiFeedback';
import { useShellLayout } from './useShellLayout';
import { installRegionalClipping } from '../utils/tilesetClipping';
import { useCesiumStore } from '../stores/cesiumStore';
import { createOfflineViewerConfig, isOfflineEnvironment } from '../config/offlineConfig';
import { createTilesetLoader } from '../utils/tilesetLoader';
import { DISPLAY_THRESHOLDS } from '../config/lodSettings';
import { useMeasurementTools } from './useMeasurementTools';
import { useGeojsonLod } from './useGeojsonLod';
import { useCameraControls } from './useCameraControls';
import { useRenderLifecycle } from './useRenderLifecycle';
import { useTilesetManagement } from './useTilesetManagement';
import { useBasemapControl } from './useBasemapControl';
import { DEFAULT_CAMERA_VIEW } from '../constants/cesium';
import { createLogger } from '../utils/logger';
import { APP_CONFIG } from '../config/appConfig';
import { applySceneOptimizations, applyDefaultCameraView, setupSceneLogging } from '../modules/cesium/bootstrap';
import {
  createViewerContext,
  installViewerPlugins,
  disposeViewerContext,
  type ViewerBootContext,
  type ViewerPluginDisposer
} from '../modules/cesium/initViewer';

const tilesetConfig = APP_CONFIG.tileset || {};
const tilesetQualityTiers = tilesetConfig.qualityTiers || [];
const tilesetGridQuality = tilesetConfig.gridQuality || {};
const tilesetSseRange = tilesetConfig.screenSpaceErrorRange || {};
const tilesetMemoryRange = tilesetConfig.memoryUsageRange || {};
const tilesetDynamicConfig = tilesetConfig.dynamicScreenSpaceError || {};
const tilesetSwitchDelayMs = tilesetConfig.switchDelayMs ?? 180;
const cesiumConfig = APP_CONFIG.cesium || {};
const presetPositions = cesiumConfig.presetPositions || {};
const buildingsPreset = presetPositions.buildings || null;
const defaultCameraOrientation = cesiumConfig.camera?.defaultOrientation || {};

export interface CesiumBootOptions {
  cesiumContainer: Ref<HTMLDivElement | null>;
}

export function useCesiumBoot(options: CesiumBootOptions) {
  const { cesiumContainer } = options;

  // 响应式状态
  const logger = createLogger('CesiumBoot');
  const debugLog = (...args: unknown[]) => logger.debug(...args);

  let viewer: Cesium.Viewer | null = null;
  let viewerContext: ViewerBootContext | null = null;
let pluginDisposer: ViewerPluginDisposer | null = null;
let inspectorWidget: Cesium.CesiumInspector | null = null;
const inspectorVisible = ref(false);

  const {
    pauseRenderLoop,
    resumeRenderLoop,
    isCanvasRenderable,
    safeResize,
    setupResizeObservation,
    teardownResizeObservation,
    bindWebGLContextHandlers,
    scheduleViewerRestart,
    restartViewer,
    dispose: disposeRenderLifecycle
  } = useRenderLifecycle({
    cesiumContainer,
    getViewer: () => viewer,
    setViewer: (instance) => { viewer = instance; return viewer; },
    initializeViewer: () => initializeCesium(),
    onBeforeDestroy: beforeViewerDestroy,
    onAfterRestart: afterViewerRestart,
    logger
  });

  // 专题面板状态与开关
  const topicState = reactive({
    groups: { adminOpen: true },
    lod: { district: true, township: true, community: true, grid: true },
    labels: { district: true, township: true, community: true, grid: true },
    layerVisible: { district: true, township: true, community: true, grid: true }
  });

  const tilesetAllowed = ref(true);
  const lodGeojsonEnabled = ref(true);
  const tilesetVisible = ref(true);

const showBuildings = ref(false);
const showDistricts = ref(false);

const {
  isArcGisBasemap,
  addArcGisBasemap: addArcGisBasemapInternal,
  toggleArcGisBasemap: toggleArcGisBasemapInternal,
  showPrimaryImagery,
  hidePrimaryImagery
} = useBasemapControl({
  Cesium,
  getViewer: () => viewer,
  logger
});

const {
  tileset: buildingsTileset,
  preloadBuildings: preloadBuildingsInternal,
  showTileset: showTilesetInternal,
  hideTileset: hideTilesetInternal,
  toggleTileset: toggleTilesetInternal,
  destroyTileset: destroyTilesetInternal,
  alignTilesetToTerrain: alignTilesetToTerrainInternal,
  getTilesetLoader: getTilesetLoaderInternal,
  removeClipping: removeTilesetClipping
} = useTilesetManagement({
  Cesium,
  getViewer: () => viewer,
  createTilesetLoader,
  installRegionalClipping,
  tilesetAllowed,
  logger
});

let getIsCameraMoving = () => false;

const {
  geojsonLayerVisible,
  geojsonLodLayers,
  currentActiveLayer,
  updateGeojsonLOD,
  ensureGeojsonLayer,
  applyTilesetByLayer,
  updateLabelHeightsForLayer,
  refreshLabelCollectionHeights,
  toggleGeojsonLayer,
  toggleLayerVisible,
  toggleLabel,
  toggleLod,
  debugLabelStatus,
  searchQuery,
  searchResults,
  searchFilter,
  searchInGeojsonLayers,
  highlightEntity,
  resolveEntityNameForLayer
} = useGeojsonLod({
  Cesium,
  getViewer: () => viewer,
  getTilesetLoader: () => getTilesetLoaderInternal(),
  getBuildingsTileset: () => buildingsTileset.value,
  tilesetAllowed,
  logger: debugLog,
  isCameraMoving: () => getIsCameraMoving(),
  getCurrentViewDistance,
  topicState,
  lodGeojsonEnabled,
  requestSceneRender: () => viewer?.scene?.requestRender?.(),
  setupEntityInteraction
});

const uiFeedback = useUiFeedback();

const searchController = useSearchWidget({
  searchQuery,
  searchResults,
  searchFilter,
  searchInGeojsonLayers,
  highlightEntity,
  notify: uiFeedback.notify
});

const topicPanel = useTopicPanel({
  topicState,
  currentActiveLayer,
  toggleLayerVisible,
  toggleLabel,
  toggleLod,
  refreshLayers: updateGeojsonLOD,
  tilesetVisible,
  toggleTileset
});

const infoPanel = useInfoPanel();

const {
  measurePanelVisible,
  activeMeasureTab,
  measureUnit,
  isMeasurementActive,
  showClearButton,
  measurementPoints,
  totalDistance,
  totalDistance3D,
  totalVerticalDistance,
  areaPoints,
  areaSquareMeters,
  areaPerimeterMeters,
  toggleMeasurePanel,
  switchMeasureTab,
  restartMeasurement,
  clearMeasurement,
  clearAreaMeasurement,
  formatDistance,
  formatArea
} = useMeasurementTools({
  Cesium,
  cesiumContainer,
  getViewer: () => viewer,
  topicPanelVisible: topicPanel.visible,
  isCanvasRenderable,
  requestRender: () => viewer?.scene?.requestRender?.(),
  hideGridBlocksForMeasurementIfNeeded,
  restoreGridBlocksAfterMeasurement
});

const shellLayout = useShellLayout();
shellLayout.registerPanel('topic', topicPanel.visible);
shellLayout.registerPanel('measure', measurePanelVisible);
shellLayout.registerPanel('info', infoPanel.visible);
shellLayout.registerShortcut('Escape', (event) => {
  if (infoPanel.visible.value) {
    infoPanel.close();
    event.preventDefault();
    return;
  }
  if (topicPanel.visible.value) {
    topicPanel.closeTopic();
    event.preventDefault();
  }
});
shellLayout.registerShortcut('t', () => {
  handleTopicPanelToggle();
});

function handleTopicPanelToggle(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const next = !topicPanel.visible.value;
  topicPanel.visible.value = next;
  if (next) {
    measurePanelVisible.value = false;
  }
}

const {
  isCameraMoving,
  setupCameraMoveHandler,
  installCameraIdleCallback,
  teardownCameraHandlers
} = useCameraControls({
  Cesium,
  getViewer: () => viewer,
  getActiveTileset: () => buildingsTileset.value,
  currentActiveLayer,
  applyTilesetByLayer,
  logger
});

getIsCameraMoving = () => isCameraMoving.value;

// 新增：DEM地形开关状态（默认关闭，手动开启后同步）

// 测试专用：强制仅3DTiles模式（低耦合，便于删除）
const forceTilesMode = ref(false);
// 测试专用：属性拾取开关（低耦合，便于删除）
const pickInspectorEnabled = ref(false);
let disposePickInspector = null;
// 测试专用：自动标注开关（低耦合，便于删除）
const autoLabelEnabled = ref(false);
let disposeAutoLabel = null;

// 使用Pinia状态管理
const cesiumStore = useCesiumStore();

let uninstallRegionalClipping = null;
let removeCameraIdleListener = null;
let currentDisplay = 'imagery'; // 'tiles' | 'imagery'
let switchTimer = null; // 切换去抖定时器
let lastTilesetSse = null;
let lastTilesetMemory = null;

const clearPendingDisplaySwitch = () => {
  if (switchTimer) {
    clearTimeout(switchTimer);
    switchTimer = null;
  }
};

const handleCameraIdle = () => {
  checkZoomLevelAndToggleDisplay();
  logViewDistance();
  if (lodGeojsonEnabled.value) {
    updateGeojsonLOD();
  }
};

const installCameraHooks = () => {
  if (!viewer) return;
  teardownCameraHandlers();
  clearPendingDisplaySwitch();
  if (removeCameraIdleListener) {
    removeCameraIdleListener();
    removeCameraIdleListener = null;
  }
  setupCameraMoveHandler({
    onCameraIdle: handleCameraIdle,
    cancelPendingModeSwitch: clearPendingDisplaySwitch
  });
  removeCameraIdleListener = installCameraIdleCallback(() => {
    if (!lodGeojsonEnabled.value) return;
    updateGeojsonLOD();
  }, { debounceMs: 250 });
};

const detachCameraHooks = () => {
  clearPendingDisplaySwitch();
  if (removeCameraIdleListener) {
    removeCameraIdleListener();
    removeCameraIdleListener = null;
  }
  teardownCameraHandlers();
};

// 新增：显示切换的滞回与状态

// Cesium配置
// 新增：分级GeoJSON图层管理（松北：区县/乡镇/社区/网格）
// ... existing code ...

// 添加防重复初始化的标志
let isInitialized = false;

function getDefaultCameraPose() {
  const destination = DEFAULT_CAMERA_VIEW.destination;
  const orientation = (DEFAULT_CAMERA_VIEW.orientation as {
    heading?: number;
    pitch?: number;
    roll?: number;
  }) || {};

  if (destination instanceof Cesium.Cartesian3) {
    const cartographic = Cesium.Cartographic.fromCartesian(destination);
    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height,
      heading: orientation.heading ?? 0,
      pitch: orientation.pitch ?? -75,
      roll: orientation.roll ?? 0,
      duration: DEFAULT_CAMERA_VIEW.duration ?? 0
    };
  }

  return {
    longitude: destination.longitude,
    latitude: destination.latitude,
    height: destination.height,
    heading: orientation.heading ?? 0,
    pitch: orientation.pitch ?? -75,
    roll: orientation.roll ?? 0,
    duration: DEFAULT_CAMERA_VIEW.duration ?? 0
  };
}

function flyToDefaultCamera(durationOverride?: number) {
  if (!viewer) return;
  const pose = getDefaultCameraPose();
  const duration = durationOverride ?? pose.duration ?? 0;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(pose.longitude, pose.latitude, pose.height),
    orientation: {
      heading: Cesium.Math.toRadians(pose.heading ?? 0),
      pitch: Cesium.Math.toRadians(pose.pitch ?? -75),
      roll: Cesium.Math.toRadians(pose.roll ?? 0)
    },
    duration
  });
}

async function initializeCesium(): Promise<Cesium.Viewer | null> {
  if (isInitialized) {
    logger('[CesiumBoot] viewer 已初始化，跳过重复初始化');
    return viewer;
  }

  const container = cesiumContainer?.value;
  if (!container || !container.clientWidth || !container.clientHeight) {
    throw new Error('容器尺寸为 0，延迟初始化');
  }

  if (isOfflineEnvironment()) {
    logger('[CesiumBoot] 检测到离线环境，启用离线模式');
  }

  container.className = 'cesium-container cesium-viewer';
  const viewerOptions = createOfflineViewerConfig();

  try {
    viewerContext = createViewerContext({
      Cesium,
      container,
      viewerOptions,
      resumeRenderLoop,
      pauseRenderLoop,
      scheduleRestart: scheduleViewerRestart,
      logger
    });

    viewer = viewerContext.viewer;

    pluginDisposer?.();
    pluginDisposer = await installViewerPlugins(viewerContext, [
      {
        beforeViewerReady: ({ viewer: instance }) => {
          applySceneOptimizations(instance, logger);

          const pose = getDefaultCameraPose();
          applyDefaultCameraView(instance, {
            longitude: pose.longitude,
            latitude: pose.latitude,
            height: pose.height,
            heading: pose.heading,
            pitch: pose.pitch,
            roll: pose.roll,
            duration: pose.duration ?? 0
          });
        }
      },
      {
        afterViewerReady: ({ viewer: instance }) => setupSceneLogging(instance, logger)
      },
      {
        afterViewerReady: async () => {
          try {
            await addArcGisBasemap();
          } catch (error) {
            logger('[CesiumBoot] addArcGisBasemap 失败', error);
          }

          try {
            await preloadBuildings();
          } catch (error) {
            logger('[CesiumBoot] 预加载 3D Tiles 失败', error);
          }

          installCameraHooks();
          handleCameraIdle();
          setupResizeObservation();
          safeResize();
          cesiumStore.setViewer(viewer);
        },
        onDestroy: () => {
          detachCameraHooks();
          removeTilesetClipping();
        }
      }
    ]);

    bindWebGLContextHandlers();
    isInitialized = true;
    return viewer;
  } catch (error) {
    logger('[CesiumBoot] 初始化失败', error);
    isInitialized = false;
    pluginDisposer?.();
    pluginDisposer = null;
    if (viewerContext) {
      try {
        disposeViewerContext(viewerContext);
      } catch (_) {
        /* ignore */
      }
      viewerContext = null;
    }
    viewer = null;
    throw error;
  }
}

// 获取影像尺寸
function getImageDimensions(imagePath) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() {
      resolve({
        width: this.width,
        height: this.height
      });
    };
    img.onerror = function() {
      reject(new Error(`无法加载影像: ${imagePath}`));
    };
    img.src = imagePath;
  });
}

// 加载本地PNG影像

// 尝试加载本地影像

// 加载备用影像

// 创建离线底图

// 创建网格背景

// 创建地理覆盖层

// 新增：加载地形数据函数（低耦合包装，便于删除）

// 修复后的地形切换函数


// 新增：检查缩放级别并切换显示
function checkZoomLevelAndToggleDisplay() {
  if (!viewer || !buildingsTileset.value) {
    logger('⚠️ viewer 或 buildingsTileset 未准备好');
    return;
  }

  // 测试强制模式：开启时屏蔽自动切换
  if (forceTilesMode.value) {
    logger('🧪 强制模式开启，跳过自动切换');
    return;
  }
  
  const distance = getCurrentViewDistance();
  if (!Number.isFinite(distance)) {
    logger('当前视点距离不可用，跳过显示切换');
    return;
  }

  const activeLodLayer = currentActiveLayer?.value ?? null;
  updateTilesetQuality(distance, activeLodLayer);

  logger(`[距离检查] 当前距离: ${distance.toFixed(2)}m, 阈值: ${DISPLAY_THRESHOLDS.showTilesBelow}m/${DISPLAY_THRESHOLDS.hideTilesAbove}m`);

  // 小工具：根据模式强制校正可见性，避免状态与显示不同步
  const ensureModeVisibility = (mode) => {
    if (mode === 'tiles') {
      if (buildingsTileset.value && !buildingsTileset.value.show) {
        logger('[模式校正] 强制显示3D Tiles');
        hideArcGISMap(); // 可选：若期望仅显示Tiles可先隐藏影像（按需保留或移除）
        show3DTiles();
      }
    } else {
      if (buildingsTileset.value && buildingsTileset.value.show) {
        logger('[模式校正] 强制隐藏3D Tiles');
        hide3DTiles();
        showArcGISMap();
      }
    };
  };

  if (activeLodLayer === 'grid') {
    clearPendingDisplaySwitch();
    if (currentDisplay !== 'tiles' || !buildingsTileset.value.show) {
      logger('[LOD联动] 当前处于网格层，启用 3D Tiles');
    }
    ensureModeVisibility('tiles');
    currentDisplay = 'tiles';
    return;
  }

  if (activeLodLayer !== null && activeLodLayer !== 'grid') {
    clearPendingDisplaySwitch();
    if (currentDisplay !== 'imagery' || (buildingsTileset.value?.show ?? false)) {
      logger('[LOD联动] 当前层级非网格，关闭 3D Tiles');
    }
    ensureModeVisibility('imagery');
    currentDisplay = 'imagery';
    return;
  }

  // 滞回判断：只有跨越成对阈值时才切换，避免在阈值附近抖动
  const wantTiles = distance < DISPLAY_THRESHOLDS.showTilesBelow; // 500米以下显示3D Tiles
  const wantImagery = distance > DISPLAY_THRESHOLDS.hideTilesAbove; // 700米以上隐藏3D Tiles

  logger(`[距离检查] wantTiles: ${wantTiles}, wantImagery: ${wantImagery}, currentDisplay: ${currentDisplay}`);

  // 若未触发任何滞回边界，则保持现状，但仍做一次可见性纠偏
  if (!wantTiles && !wantImagery) {
    logger(`当前视点距离: ${distance.toFixed(2)}米, 处于滞回带，保持: ${currentDisplay}`);
    ensureModeVisibility(currentDisplay);
    return;
  }

  const targetMode = wantTiles ? 'tiles' : 'imagery';
  if (targetMode === currentDisplay) {
    logger(`当前视点距离: ${distance.toFixed(2)}米, 目标=${targetMode}, 状态未变`);
    // 状态未变时也强制对齐一次，避免异步路径导致 tiles 残留亮起
    ensureModeVisibility(currentDisplay);
    return;
  }

  logger(`[距离检查] 准备切换模式: ${currentDisplay} -> ${targetMode}`);

  // 使用小延时确认，避免瞬时切换
  if (switchTimer) clearTimeout(switchTimer);
  switchTimer = setTimeout(() => {
    if (targetMode === 'tiles') {
      // 显示3D Tiles时保留或切换底图（按需）
      logger('[模式切换] 显示3D Tiles');
      show3DTiles();
      showArcGISMap();
    } else {
      // 仅影像模式时隐藏3D Tiles
      logger('[模式切换] 隐藏3D Tiles');
      showArcGISMap();
      hide3DTiles();
    }
    currentDisplay = targetMode;
    logger(`✅ 模式切换为: ${currentDisplay} (距离: ${distance.toFixed(0)}m)`);
  }, tilesetSwitchDelayMs);
}

// 新增：显示3D Tiles
async function show3DTiles() {
  const visible = await showTilesetInternal();
  showBuildings.value = !!(buildingsTileset.value && buildingsTileset.value.show);
  if (visible && buildingsTileset.value) {
    viewer?.scene?.requestRender?.();
  }
  return visible;
}

// 新增：隐藏3D Tiles
function hide3DTiles() {
  hideTilesetInternal();
  showBuildings.value = !!(buildingsTileset.value && buildingsTileset.value.show);
  viewer?.scene?.requestRender?.();
}

// 新增：显示ArcGIS地图
function showArcGISMap() {
  showPrimaryImagery();
}

// 新增：隐藏ArcGIS地图
function hideArcGISMap() {
  hidePrimaryImagery();
}

function updateTilesetQuality(distance, activeLodLayer) {
  const tileset = buildingsTileset.value;
  if (!tileset || !Number.isFinite(distance)) return;

  const sseMin = Number.isFinite(tilesetSseRange.min) ? tilesetSseRange.min : 1.8;
  const sseMax = Number.isFinite(tilesetSseRange.max) ? tilesetSseRange.max : 12;
  const memMin = Number.isFinite(tilesetMemoryRange.min) ? tilesetMemoryRange.min : 256;
  const memMax = Number.isFinite(tilesetMemoryRange.max) ? tilesetMemoryRange.max : 1536;
  const disableDynamicBelow = Number.isFinite(tilesetDynamicConfig.disableBelowDistance)
    ? tilesetDynamicConfig.disableBelowDistance
    : 0;

  let targetSse = tileset.maximumScreenSpaceError ?? sseMax;
  let targetMemory = tileset.maximumMemoryUsage ?? memMax;
  let targetDynamic =
    typeof tileset.dynamicScreenSpaceError === 'boolean'
      ? tileset.dynamicScreenSpaceError
      : true;

  if (activeLodLayer === 'grid') {
    if (Number.isFinite(tilesetGridQuality.maximumScreenSpaceError)) {
      targetSse = tilesetGridQuality.maximumScreenSpaceError;
    }
    if (Number.isFinite(tilesetGridQuality.maximumMemoryUsage)) {
      targetMemory = tilesetGridQuality.maximumMemoryUsage;
    }
    if (tilesetGridQuality.dynamicScreenSpaceError !== undefined) {
      targetDynamic = !!tilesetGridQuality.dynamicScreenSpaceError;
    }
  } else if (tilesetQualityTiers.length > 0) {
    let matchedTier = tilesetQualityTiers[tilesetQualityTiers.length - 1];
    for (const tier of tilesetQualityTiers) {
      if (!Number.isFinite(tier.maxDistance) || distance < tier.maxDistance) {
        matchedTier = tier;
        break;
      }
    }
    if (matchedTier) {
      if (Number.isFinite(matchedTier.maximumScreenSpaceError)) {
        targetSse = matchedTier.maximumScreenSpaceError;
      }
      if (Number.isFinite(matchedTier.maximumMemoryUsage)) {
        targetMemory = matchedTier.maximumMemoryUsage;
      }
      if (matchedTier.dynamicScreenSpaceError !== undefined) {
        targetDynamic = !!matchedTier.dynamicScreenSpaceError;
      }
    }
  }

  targetSse = Cesium.Math.clamp(targetSse, sseMin, sseMax);
  targetMemory = Math.max(memMin, Math.min(targetMemory, memMax));

  if (typeof tileset.maximumScreenSpaceError === 'number') {
    if (lastTilesetSse == null || Math.abs(lastTilesetSse - targetSse) > 0.05) {
      tileset.maximumScreenSpaceError = targetSse;
      lastTilesetSse = targetSse;
    }
  }

  if (typeof tileset.maximumMemoryUsage === 'number') {
    if (lastTilesetMemory == null || Math.abs(lastTilesetMemory - targetMemory) >= 32) {
      tileset.maximumMemoryUsage = targetMemory;
      lastTilesetMemory = targetMemory;
    }
  }

  if (activeLodLayer === 'grid') {
    tileset.dynamicScreenSpaceError = targetDynamic;
    return;
  }

  if (Number.isFinite(disableDynamicBelow) && distance < disableDynamicBelow) {
    tileset.dynamicScreenSpaceError = false;
    return;
  }

  tileset.dynamicScreenSpaceError = targetDynamic;
}

// 修改preloadBuildings函数，添加防重复加载
async function preloadBuildings() {
  const tileset = await preloadBuildingsInternal();
  showBuildings.value = !!(buildingsTileset.value && buildingsTileset.value.show);
  return tileset;
}
// 清除建筑模型
function clearBuildings() {
  hideTilesetInternal();
  showBuildings.value = !!(buildingsTileset.value && buildingsTileset.value.show);
}
// 彻底移除 3D Tiles（销毁 primitives/实体，并移除区域裁剪监听）
function destroyBuildings() {
  destroyTilesetInternal();
  removeTilesetClipping();
  showBuildings.value = false;
}

// 飞行到建筑群
function flyToBuildings() {
  const activeViewer = viewer;
  const tileset = buildingsTileset.value;
  if (!activeViewer) return;

  if (tileset?.boundingSphere) {
    activeViewer.zoomTo(
      tileset,
      new Cesium.HeadingPitchRange(0.0, -0.5, tileset.boundingSphere.radius * 2.0)
    );
    return;
  }

  if (buildingsPreset) {
    const { longitude, latitude, height, orientation, duration } = buildingsPreset as {
      longitude?: number;
      latitude?: number;
      height?: number;
      orientation?: { heading?: number; pitch?: number; roll?: number };
      duration?: number;
    };

    if (
      Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      Number.isFinite(height)
    ) {
      const orientSource = orientation ?? defaultCameraOrientation;
      activeViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude!, latitude!, height!),
        orientation: {
          heading: Cesium.Math.toRadians(orientSource?.heading ?? 0),
          pitch: Cesium.Math.toRadians(orientSource?.pitch ?? -75),
          roll: Cesium.Math.toRadians(orientSource?.roll ?? 0)
        },
        duration: duration ?? 1.0
      });
      return;
    }
  }

  flyToDefaultCamera(1.0);
}

function debugFlyToTileset() {
  const activeViewer = viewer;
  const tileset = buildingsTileset.value;
  if (!activeViewer || !tileset) {
    logger.warn('[Debug] viewer 或 tileset 尚未就绪，无法定位');
    return;
  }
  const execute = () => {
    try {
      activeViewer.zoomTo(
        tileset,
        new Cesium.HeadingPitchRange(0.0, -0.5, tileset.boundingSphere.radius * 2.0),
      );
    } catch (error) {
      logger.warn('[Debug] zoomTo 执行失败', error);
    }
  };
  if (tileset.ready) {
    execute();
  } else {
    const readyPromise = tileset.readyPromise;
    if (readyPromise && typeof readyPromise.then === 'function') {
      readyPromise.then(execute).catch((error) => {
        logger.warn('[Debug] tileset readyPromise 失败', error);
      });
    } else {
      logger.warn('[Debug] tileset 缺少 readyPromise，直接执行 zoom');
      execute();
    }
  }
}

function toggleDebugInspector() {
  if (!viewer || !viewer.scene) {
    logger.warn('[Debug] viewer 未初始化，无法切换 Inspector');
    return;
  }
  inspectorVisible.value = !inspectorVisible.value;
  if (inspectorVisible.value) {
    if (!inspectorWidget) {
      try {
        inspectorWidget = new Cesium.CesiumInspector(viewer.scene);
        inspectorWidget.container.style.right = '16px';
        inspectorWidget.container.style.bottom = '120px';
      } catch (error) {
        inspectorVisible.value = false;
        logger.warn('[Debug] 创建 CesiumInspector 失败', error);
        return;
      }
    }
    inspectorWidget.container.style.display = '';
    inspectorWidget.viewModel.tilesetBoundingVolumes = true;
  } else if (inspectorWidget) {
    inspectorWidget.container.style.display = 'none';
  }
  viewer.scene.debugShowBoundingVolume = inspectorVisible.value;
  logger(
    `[Debug] Tileset bounding volumes ${inspectorVisible.value ? '已开启' : '已关闭'}`,
  );
}

// 切换建筑显示
async function toggleBuildings() {
  const visible = await toggleTilesetInternal();
  showBuildings.value = !!(buildingsTileset.value && buildingsTileset.value.show);
  viewer?.scene?.requestRender?.();
  return visible;
}

// 切换区域显示
function toggleDistricts() {
  logger('切换区域显示，当前状态:', showDistricts.value);
  showDistricts.value = !showDistricts.value;
  logger('切换后状态:', showDistricts.value);
  if (showDistricts.value) {
    loadHarbinDistricts();
  } else {
    clearHarbinDistricts();
  }
}

// 切换本地影像

// 使用市政ArcGIS底图
async function addArcGisBasemap() {
  const ok = await addArcGisBasemapInternal();
  if (!ok) {
    logger('⚠️ ArcGIS 底图加载失败');
  }
  return ok;
}

// 切换市政底图
async function toggleArcGisBasemap() {
  return toggleArcGisBasemapInternal();
}

// 重置视图
function resetView() {
  logger('[CesiumBoot] 重置视图');
  flyToDefaultCamera(0);
  if (currentDisplay !== 'imagery') {
    currentDisplay = 'imagery';
    showArcGISMap();
    hide3DTiles();
  }
}


// 新增：通过俯仰角与垂直差计算视点到摄影机距离
function computeDistanceByPitchAndVertical(pitchRadians, verticalMeters) {
  const s = Math.sin(Math.abs(pitchRadians));
  if (s < 1e-6) return Infinity; // 近乎水平视角
  return verticalMeters / s;
}

// 新增：在控制台打印视点到摄影机的直线距离
function logViewDistance() {
  if (!logger.enabled) return;
  if (!viewer) return;
  const scene = viewer.scene;
  const camera = viewer.camera;

  const pitch = camera.pitch; // 弧度
  const cameraCarto = camera.positionCartographic;
  const canvas = scene.canvas;

  // 以屏幕中心作为视点射线
  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const ray = camera.getPickRay(center);

  let targetCartesian = null;

  // 先与地表相交（包含地形）
  if (scene.globe) {
    targetCartesian = scene.globe.pick(ray, scene);
  }
  // 回退：与椭球相交
  if (!targetCartesian) {
    targetCartesian = Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84) ? Cesium.Ray.getPoint(ray, Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84).start) : null;
  }

  let distance = Infinity;
  if (targetCartesian) {
    const targetCarto = Cesium.Cartographic.fromCartesian(targetCartesian);
    const vertical = Math.abs((cameraCarto?.height ?? 0) - (targetCarto?.height ?? 0));
    distance = computeDistanceByPitchAndVertical(pitch, vertical);
  }

  logger(`📏 视点-摄影机距离: ${Number.isFinite(distance) ? distance.toFixed(2) + ' 米' : '∞'}`);
}

// 新增：获取当前视点-摄影机的直线距离（米）
function getCurrentViewDistance() {
  if (!viewer) return Infinity;
  const scene = viewer.scene;
  const camera = viewer.camera;

  const pitch = camera.pitch; // 弧度
  const cameraCarto = camera.positionCartographic;
  const canvas = scene.canvas;

  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const ray = camera.getPickRay(center);

  let targetCartesian = null;

  if (scene.globe) {
    targetCartesian = scene.globe.pick(ray, scene);
  }
  if (!targetCartesian) {
    const inter = Cesium.IntersectionTests.rayEllipsoid(ray, Cesium.Ellipsoid.WGS84);
    if (inter) {
      targetCartesian = Cesium.Ray.getPoint(ray, inter.start);
    }
  }

  if (!targetCartesian) return Infinity;

  const targetCarto = Cesium.Cartographic.fromCartesian(targetCartesian);
  const vertical = Math.abs((cameraCarto?.height ?? 0) - (targetCarto?.height ?? 0));
  return computeDistanceByPitchAndVertical(pitch, vertical);
}

// 生命周期钩子
onMounted(async () => {
  logger('CesiumView 组件已挂载');
  
  // 防止重复初始化
  if (isInitialized) {
    logger('Cesium 已经初始化，跳过重复挂载');
    return;
  }
  
  // 检测离线状态
  if (isOfflineEnvironment()) {
    logger('🌐 网络状态:', navigator.onLine ? '在线' : '离线');
    logger('🚫 离线模式已启用');
  }
  
  // 确保容器已渲染且具有有效尺寸再初始化 Viewer
  await Promise.resolve(); // 让出一次事件循环，等待DOM渲染
  const container = cesiumContainer?.value;
  if (!container) {
    logger.warn('Cesium容器尚未就绪，延迟初始化');
    await new Promise(r => setTimeout(r, 0));
  }
  const ensureReady = () => {
    const el = cesiumContainer?.value;
    if (!el) return false;
    const w = el.clientWidth;
    const h = el.clientHeight;
    return !!(w && h);
  };
  if (!ensureReady()) {
    // 再给一次时机
    await new Promise(r => setTimeout(r, 0));
  }
  if (!ensureReady()) {
    logger.warn('容器尺寸为0，暂不初始化Cesium，等待首次resize');
    setupResizeObservation();
    // 监听一次尺寸变化后再初始化
    const tryInitLater = () => {
      if (ensureReady()) {
        window.removeEventListener('resize', tryInitLater);
        initializeCesium().then(() => {
          // 初始化后再开启观察，避免重复绑定
          // 已在 initializeCesium 内部/后续逻辑调用 requestRender
        });
      }
    };
    window.addEventListener('resize', tryInitLater);
    return;
  }
  
  // 初始化Cesium（等待完成后再绑定事件）
  await initializeCesium();
    try { setupCesiumEventHandlers && setupCesiumEventHandlers(); } catch (_) {} // rebind after restart
  
  // 添加网络状态监听
  window.addEventListener('online', handleNetworkChange);
  window.addEventListener('offline', handleNetworkChange);

  // 绑定搜索框
  
  // 初始化完成后再绑定全局事件处理器
  setupCesiumEventHandlers();
});

onUnmounted(() => {
  logger('CesiumView 组件已卸载');
  isInitialized = false;

  window.removeEventListener('online', handleNetworkChange);
  window.removeEventListener('offline', handleNetworkChange);

  beforeViewerDestroy();
  teardownResizeObservation();
  disposeRenderLifecycle();

  try { disposePickInspector && disposePickInspector(); } catch {}
  disposePickInspector = null;
  pickInspectorEnabled.value = false;

  try { disposeAutoLabel && disposeAutoLabel(); } catch {}
  disposeAutoLabel = null;
  autoLabelEnabled.value = false;

  clearHarbinDistricts();
  destroyBuildings();

  try {
    for (const key of Object.keys(geojsonLodLayers)) {
      const ds = geojsonLodLayers[key]?.dataSource;
      if (ds) {
        viewer?.dataSources?.remove?.(ds, true);
        geojsonLodLayers[key].dataSource = null;
      }
    }
  } catch (_) {}
});

// 处理网络状态变化
function handleNetworkChange() {
  const isOnline = navigator.onLine;
  logger(`[CesiumBoot] 网络状态变化: ${isOnline ? '在线' : '离线'}`);

  if (!isOnline && isOfflineEnvironment()) {
    logger('[CesiumBoot] 网络断开，保持离线模式');
  }
}

function beforeViewerDestroy() {
  detachCameraHooks();
  pluginDisposer?.();
  pluginDisposer = null;
  if (inspectorWidget) {
    inspectorWidget.destroy();
    inspectorWidget = null;
    inspectorVisible.value = false;
  }
  if (viewer?.scene) {
    viewer.scene.debugShowBoundingVolume = false;
  }
  if (viewerContext) {
    try {
      disposeViewerContext(viewerContext);
    } catch (_) {
      /* ignore */
    }
    viewerContext = null;
  }
  viewer = null;
  try {
    cesiumStore.setViewer(null);
  } catch (_) {
    /* ignore */
  }
}

function afterViewerRestart(nextViewer) {
  if (nextViewer) {
    viewer = nextViewer;
  }
  installCameraHooks();
  handleCameraIdle();
  try { setupCesiumEventHandlers && setupCesiumEventHandlers(); } catch (_) {}
}

// 新增：安全resize函数，避免容器为0导致的渲染崩溃


// 测试：基于3DTiles高自动标注（低耦合，便于删除）
function toggleAutoLabel() {
  if (disposeAutoLabel) { try { disposeAutoLabel(); } catch {} disposeAutoLabel = null; }
        autoLabelEnabled.value = false;
  logger('自动标注入口已禁用（由 LOD 系统统一管理）。');
}

// 测试：强制仅3DTiles模式开关（低耦合，便于删除）
function toggleForceTilesMode() {
  forceTilesMode.value = !forceTilesMode.value;
  if (forceTilesMode.value) {
    // 进入强制模式：显示Tiles并保留底图
    show3DTiles();
    showArcGISMap();
    currentDisplay = 'tiles';
    logger('🧪 已进入测试模式：显示 3D Tiles 并保留底图');
  } else {
    // 退出强制模式：恢复自动切换一次
    logger('🧪 已退出测试模式：恢复自动切换');
    checkZoomLevelAndToggleDisplay();
  }
}

// 计算并应用Tileset到地形的对齐偏移（低耦合，便于删除）

// 新增：一键加载 3857 ArcGIS 地形（WebMercator），低耦合、易删除

// 新增：懒加载并应用样式的 GeoJSON 数据源（集成自动标注）

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function requestImmediateRefresh() {
  try { checkZoomLevelAndToggleDisplay(); } catch {}
  try { if (lodGeojsonEnabled?.value) updateGeojsonLOD(); else updateGeojsonLOD(); } catch {}
  try { viewer && viewer.scene && viewer.scene.requestRender && viewer.scene.requestRender(); } catch {}
}

const isTilesVisible = computed(() => !!(buildingsTileset.value && buildingsTileset.value.show));

function toggleTilesVisibility() {
  if (!buildingsTileset.value) return;
  buildingsTileset.value.show = !buildingsTileset.value.show;
  // 同步 currentDisplay，避免不同步
  currentDisplay = buildingsTileset.value.show ? 'tiles' : 'imagery';
  requestImmediateRefresh();
}

// 在script部分添加重置按钮点击效果处理函数
function handleResetClick(event) {
  // 添加点击动画效果
  const button = event.currentTarget;
  button.style.transform = 'scale(0.95)';
  button.style.transition = 'transform 0.1s ease';
  
  // 恢复原始状态
  setTimeout(() => {
    button.style.transform = 'scale(1)';
  }, 100);
  
  // 执行重置视图
  resetView();
}

// 新增：交互状态管理

// 新增：信息面板显示
function showEntityInfo(entity, layerKey) {
  const layer = geojsonLodLayers[layerKey];
  const name = resolveEntityNameForLayer(layerKey, entity);
  
  let info = ``;
  
  // 显示属性信息
  if (entity.properties) {
    const now = Cesium.JulianDate.now();
    const props = entity.properties;
    info += '<div class="entity-properties">';
    
    // 根据层级显示推荐字段（优先）
    const fields = getFieldsForLayer(layerKey);
    const printed = new Set();
    fields.forEach(field => {
      const value = props[field]?.getValue ? props[field].getValue(now) : props[field];
      if (value != null) {
        printed.add(field);
        info += `<div class="property-item"><strong>${field}:</strong> ${value}</div>`;
      }
    });

    // 自动附加更多可读字段（去重、限量）
    try {
      const MAX_EXTRA = 10; // 附加最多10项
      const candidates = props.propertyNames || Object.keys(props) || [];
      const blacklist = new Set(['OBJECTID','FID','id','ID','_id','Shape_Area','Shape_Leng','shape_area','shape_length']);
      let extraCount = 0;
      for (const key of candidates) {
        if (printed.has(key) || blacklist.has(key)) continue;
        const val = props[key]?.getValue ? props[key].getValue(now) : props[key];
        if (val === undefined || val === null) continue;
        const txt = String(val).trim();
        if (!txt) continue;
        info += `<div class="property-item"><strong>${key}:</strong> ${txt}</div>`;
        printed.add(key);
        extraCount++;
        if (extraCount >= MAX_EXTRA) break;
      }
    } catch {}

    info += '</div>';
  }
  
  // 显示几何信息
  if (entity.polygon) {
    const area = calculatePolygonArea(entity);
    if (area > 0) {
      info += `<div class="geometry-info">`;
      info += `<div class="property-item"><strong>面积:</strong> ${formatArea(area)}</div>`;
      info += `</div>`;
    }
  }
  
  infoPanel.open({ content: info, entity, layerKey });
}

// 新增：获取层级字段
function getFieldsForLayer(layerKey) {
  const fieldMap = {
    district: ['区县名称', '面积', '人口'],
    township: ['街道名称', '面积', '人口'],
    community: ['社区名称', '面积', '人口'],
    grid: ['Name', '面积', '类型']
  };
  return fieldMap[layerKey] || ['name', 'area'];
}

// 新增：计算多边形面积
function calculatePolygonArea(entity) {
  if (!entity.polygon) return 0;
  
  try {
    const now = Cesium.JulianDate.now();
    const hierarchy = entity.polygon.hierarchy?.getValue ? 
      entity.polygon.hierarchy.getValue(now) : entity.polygon.hierarchy;
    
    if (!hierarchy || !hierarchy.positions) return 0;
    
    const positions = hierarchy.positions;
    if (positions.length < 3) return 0;
    
    // 使用 Cesium 计算面积
    const area = Cesium.PolygonGeometryLibrary.computeArea2D(positions);
    return area;
  } catch (e) {
    logger.warn('计算面积失败:', e);
    return 0;
  }
}

// 新增：设置实体交互事件
function setupEntityInteraction(entity, layerKey) {
  if (!entity || !viewer) return;
  
  const layer = geojsonLodLayers[layerKey];
  if (!layer?.interactive) return;
  
  // 为实体添加自定义属性，用于事件识别
  entity.layerKey = layerKey;
  entity.interactive = true;
}

// 新增：设置 Cesium 全局事件处理器
function setupCesiumEventHandlers() {
  if (!viewer) return;
  
  // 使用优化的点击处理器
  setupOptimizedClickHandler();
  
  // 保持原有的鼠标移动事件处理器
  viewer.cesiumWidget.screenSpaceEventHandler.setInputAction((event) => {
    // 如果正在测量，禁用悬停效果
    if (isMeasurementActive.value) {
      return;
    }
    
    const pickedObject = viewer.scene.pick(event.endPosition);
    
    // 清除之前的悬停效果
    clearHoverEffect();
    
    if (pickedObject && pickedObject.id && pickedObject.id.interactive) {
      const entity = pickedObject.id;
      const layerKey = entity.layerKey;
      const layer = geojsonLodLayers[layerKey];
      
      if (layer?.interactive?.hoverable) {
        // 应用悬停样式
        applyHoverStyle(entity, layer.interactive.hoverStyle);
        
        // 显示悬停标注
        if (layer.labelStyle.showOnHover) {
          showHoverLabel(entity, layerKey);
        }
        
        infoPanel.setHover({ entity, layerKey });
      }
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

// 修改：应用悬停样式函数
function applyHoverStyle(entity, hoverStyle) {
  if (!entity.polygon) return;
  
  // 保存原始样式
  if (!entity._originalStyle) {
    entity._originalStyle = {
      material: entity.polygon.material,
      outline: entity.polygon.outline,
      outlineColor: entity.polygon.outlineColor,
      outlineWidth: entity.polygon.outlineWidth
    };
  }
  
  // 应用悬停样式
  entity.polygon.material = new Cesium.ColorMaterialProperty(
    Cesium.Color.fromCssColorString(hoverStyle.fill).withAlpha(hoverStyle.fillAlpha)
  );
  entity.polygon.outline = true;
  entity.polygon.outlineColor = Cesium.Color.fromCssColorString(hoverStyle.outline);
  entity.polygon.outlineWidth = hoverStyle.outlineWidth;
}

// 修改：清除悬停效果函数
function clearHoverEffect() {
  const hovered = infoPanel.hovered.value?.entity;
  if (hovered && hovered._originalStyle) {
    const entity = hovered;
    const original = entity._originalStyle;
    
    entity.polygon.material = original.material;
    entity.polygon.outline = original.outline;
    entity.polygon.outlineColor = original.outlineColor;
    entity.polygon.outlineWidth = original.outlineWidth;
  }
  
  // �����ͣ��ע
  if (hovered) {
    clearHoverLabel(hovered);
  }

  infoPanel.clearHover();
}

// 修改：显示悬停标注函数
function showHoverLabel(entity, layerKey) {
  const layer = geojsonLodLayers[layerKey];
  const name = resolveEntityNameForLayer(layerKey, entity);
  
  if (!name) return;
  
  // 清除之前的悬停标注
  clearHoverLabel(entity);
  
  // 创建临时标注
  const label = viewer.entities.add({
    position: entity.position,
    label: {
      text: name,
      font: layer.labelStyle.font,
      fillColor: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      scale: layer.labelStyle.scale * 1.2,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -10)
    }
  });
  
  // 保存引用以便清除
  entity._hoverLabel = label;
}

// 修改：清除悬停标注函数
function clearHoverLabel(entity) {
  if (entity._hoverLabel) {
    viewer.entities.remove(entity._hoverLabel);
    entity._hoverLabel = null;
  }
}

// 新增：关闭信息面板

// 新增：点击拖拽检测状态
const clickDragState = reactive({
  isMouseDown: false,
  startPosition: null,
  dragThreshold: 5 // 像素阈值
});

// 新增：优化的点击事件处理器
function setupOptimizedClickHandler() {
  if (!viewer) return;
  
  const handler = viewer.cesiumWidget.screenSpaceEventHandler;
  
  // 鼠标按下事件
  handler.setInputAction((event) => {
    clickDragState.isMouseDown = true;
    clickDragState.startPosition = {
      x: event.position.x,
      y: event.position.y
    };
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
  
  // 鼠标抬起事件
  handler.setInputAction((event) => {
    if (!clickDragState.isMouseDown) return;
    
    // 计算鼠标移动距离
    const deltaX = Math.abs(event.position.x - clickDragState.startPosition.x);
    const deltaY = Math.abs(event.position.y - clickDragState.startPosition.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // 重置状态
    clickDragState.isMouseDown = false;
    clickDragState.startPosition = null;
    
    // 只有移动距离小于阈值才认为是点击
    if (distance < clickDragState.dragThreshold) {
      handleEntityClick(event.position);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

// 新增：处理实体点击逻辑
function handleEntityClick(position) {
  // 如果正在测量，禁用地图交互
  if (isMeasurementActive.value) {
    return;
  }
  
  const pickedObject = viewer.scene.pick(position);
  if (pickedObject && pickedObject.id && pickedObject.id.interactive) {
    const entity = pickedObject.id;
    const layerKey = entity.layerKey;
    const layer = geojsonLodLayers[layerKey];
    
    if (layer?.interactive?.clickable) {
      logger(`点击了 ${layer.name}:`, entity);
      showEntityInfo(entity, layerKey);
      
      // 高亮显示
      highlightEntity(entity, { layerKey });
    }
  }
}

// 新增：独立网格三维模型显隐，不影响斑块/标注
async function toggleTileset() {
  if (!viewer) return;
  try {
    // 切换状态
    tilesetVisible.value = !tilesetVisible.value;
    tilesetAllowed.value = tilesetVisible.value;

    if (tilesetVisible.value) {
      // 需要显示：若未加载则加载
      if (!gridTileset) {
        const t = await Cesium.Cesium3DTileset.fromUrl('/tiles/grid/tileset.json');
        gridTileset = viewer.scene.primitives.add(t);
        await t.readyPromise.catch(() => {});
      }
      if (gridTileset) gridTileset.show = true;
    } else {
      if (gridTileset) gridTileset.show = false;
    }

    requestImmediateRefresh();
  } catch (e) {
    logger.warn('toggleTileset error:', e);
  }
}

// 网格层级的 3D Tiles 模型
let gridTileset = null;
// 新增：3D Tiles 加载允许总开关（按钮关闭时禁止 LOD 触发加载/显示）
// 新增：信息面板/高亮跳转的独立飞行高度（与 LOD 阈值解耦，单位：米）
// 测量期间临时隐藏网格层"板块"并在清除时恢复（通过 toggleLayerVisible 保留标注）
let _measurementGridHideState = { toggled: false };
function hideGridBlocksForMeasurementIfNeeded() {
  try {
    if (!viewer) return;
    const isGridActive = (currentActiveLayer && currentActiveLayer.value === 'grid');
    if (!isGridActive) return;
    // 仅当当前网格层板块处于显示状态时，临时隐藏一次
    if (topicState?.layerVisible?.grid) {
      toggleLayerVisible('grid');
      _measurementGridHideState.toggled = true;
    } else {
      _measurementGridHideState.toggled = false;
    }
  } catch (_) {}
}
function restoreGridBlocksAfterMeasurement() {
  try {
    // 仅在开始测量时曾经切换过的情况下恢复
    if (_measurementGridHideState.toggled && topicState?.layerVisible?.grid === false) {
      toggleLayerVisible('grid');
    }
  } catch (_) { } finally {
    _measurementGridHideState = { toggled: false };
  }
}

// 新增：Canvas 尺寸可渲染判断
  return {
    searchController,
    topicPanel,
    handleTopicPanelToggle,
    infoPanel,
    resetView,
    handleResetClick,
    measurePanelVisible,
    toggleMeasurePanel,
    switchMeasureTab,
    measurementPoints,
    areaPoints,
    measureUnit,
    formatDistance,
    totalDistance3D,
    totalDistance,
    totalVerticalDistance,
    formatArea,
    areaSquareMeters,
    areaPerimeterMeters,
    restartMeasurement,
    clearMeasurement,
    clearAreaMeasurement,
    activeMeasureTab,
    showClearButton,
    debugFlyToTileset,
    toggleDebugInspector
  };
}
