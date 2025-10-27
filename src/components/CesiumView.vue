<template>
  <div ref="cesiumContainer" class="cesium-container">
    <!-- 顶部标题栏（仿 Web AppBuilder FoldableTheme） -->
    <div class="app-header">
      <div class="app-header-left">
        <img class="app-logo" alt="logo" src="/app-logo.png" />
        <div class="app-titles">
          <div class="app-title">哈尔滨松北新区实景三维地图</div>
        </div>
      </div>
      <div class="app-header-right">
        <SearchWidget :controller="searchController" class="app-search-widget" />
        <!-- 使用文字版本的重置按钮，添加点击效果 -->
        <div class="app-header-icon clickable" title="重置视图" @click="resetView" @mousedown="handleResetClick">
          <span class="reset-text">重置</span>
        </div>
        <div class="app-header-icon clickable" :class="{ active: topicPanel.visible.value }" title="专题面板" @click.stop="handleTopicPanelToggle"><img class="app-icon-img" src="/list_icon.png" alt="list" /></div>
        <div class="app-header-icon clickable" :class="{ active: measurePanelVisible }" title="测量工具" @click.stop="toggleMeasurePanel"><img class="app-icon-img" src="/guage_icon.png" alt="gauge" /></div>
      </div>
    </div>

    <!-- 四角控件布局（样式占位，不改变地图交互） -->
    <!-- <div class="ui-corners"> -->
      <!-- 底部：坐标条（示意样式） -->
      <!-- <div class="corner bottom-left coords">
        <div class="coord-item">坐标：—</div>
        <div class="coord-item">高程：—</div>
        <div class="coord-item">视角高度：—</div>
      </div>
    </div> -->

    <!-- 量算工具面板 -->
    <div v-if="measurePanelVisible" class="measure-panel">
      <div class="measure-panel-header">
        <div class="title">量算工具</div>
        <div class="actions">
          <button class="icon-btn" title="折叠" @click="measurePanelVisible = false">×</button>
        </div>
      </div>
      <div class="measure-tabs">
        <button class="tab-btn" :class="{ active: activeMeasureTab === 'area' }" @click="switchMeasureTab('area')">
          <span class="tab-icon">🧭</span> 面积
        </button>
        <button class="tab-btn" :class="{ active: activeMeasureTab === 'distance' }" @click="switchMeasureTab('distance')">
          <span class="tab-icon">📏</span> 距离
        </button>
      </div>

      <div class="measure-body">
        <!-- 提示（无点时） -->
        <div v-if="measurementPoints.length === 0 && areaPoints.length === 0" class="hint">通过单击场景以放置您的第一个点来开始测量。</div>

        <!-- 单位选择（占位） -->
        <div class="form-row">
          <label>单位</label>
          <select class="select" v-model="measureUnit">
            <option value="metric">公制</option>
          </select>
        </div>

        <!-- 距离结果 -->
        <div v-if="activeMeasureTab === 'distance'" class="result-rows">
          <div class="result-row"><span>直线</span><b>{{ formatDistance(totalDistance3D) }}</b></div>
          <div class="result-row"><span>水平</span><b>{{ formatDistance(totalDistance) }}</b></div>
          <div class="result-row"><span>竖直</span><b>{{ formatDistance(totalVerticalDistance) }}</b></div>
        </div>

        <!-- 面积结果 -->
        <div v-if="activeMeasureTab === 'area'" class="result-rows">
          <div v-if="areaPoints.length < 3" class="hint">单击地图添加顶点以测量面积，双击结束绘制。</div>
          <template v-else>
            <div class="result-row"><span>面积</span><b>{{ formatArea(areaSquareMeters) }}</b></div>
            <div class="result-row"><span>周长</span><b>{{ formatDistance(areaPerimeterMeters) }}</b></div>
          </template>
        </div>

        <!-- 操作按钮 -->
        <div class="btn-row">
          <button class="primary-btn" @click="restartMeasurement">新测量</button>
          <button v-if="showClearButton" class="secondary-btn" @click="activeMeasureTab === 'distance' ? clearMeasurement() : clearAreaMeasurement()">清除</button>
        </div>
      </div>
    </div>

    <TopicPanel :controller="topicPanel" />

    <!-- 原有浮动工具栏（保留功能不变） -->
    <!-- <div class="floating-toolbar">
      <button class="ft-btn" @click="resetView">重置视图</button> -->
    <InfoPanel :controller="infoPanel" />
    <UiFeedbackHost />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, reactive, computed } from 'vue';
import * as Cesium from 'cesium';

import { SearchWidget } from '../modules/search';
import TopicPanel from '../modules/topicPanel/index.vue';
import InfoPanel from '../modules/infoPanel/index.vue';
import UiFeedbackHost from '../modules/ui/UiFeedbackHost.vue';
import { useSearchWidget } from '../composables/useSearchWidget';
import { useTopicPanel } from '../composables/useTopicPanel';
import { useInfoPanel } from '../composables/useInfoPanel';
import { useUiFeedback } from '../composables/useUiFeedback';
import { useShellLayout } from '../composables/useShellLayout';
import { installRegionalClipping } from '../utils/tilesetClipping';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useCesiumStore } from '../stores/cesiumStore';
import { createOfflineViewerConfig, isOfflineEnvironment } from '../config/offlineConfig';
import { createTilesetLoader } from '../utils/tilesetLoader';
import { DISPLAY_THRESHOLDS } from '../config/lodSettings';
import { useMeasurementTools } from '../composables/useMeasurementTools';
import { useGeojsonLod } from '../composables/useGeojsonLod';
import { useCameraControls } from '../composables/useCameraControls';
import { useRenderLifecycle } from '../composables/useRenderLifecycle';
import { useTilesetManagement } from '../composables/useTilesetManagement';
import { useBasemapControl } from '../composables/useBasemapControl';

// 响应式状态
const cesiumContainer = ref(null);
 
const DEBUG_LOG = false;
const logger = (...args) => { if (DEBUG_LOG) console.log(...args); };
const debugLog = logger;

let viewer = null;

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
  initializeViewer: () => initializeCesium(true),
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
const CESIUM_CONFIG = {
  defaultPosition: {
    longitude: 126.535263,
    latitude: 45.803411,
    height: 50000
  },
  // 新增：缩放级别配置
  zoomLevels: {
    maxLevel: 18, // 最大缩放级别，超过此级别显示3D Tiles
    minLevel: 10  // 最小缩放级别，低于此级别显示ArcGIS地图
  }
};

// 新增：分级GeoJSON图层管理（松北：区县/乡镇/社区/网格）
// ... existing code ...

// 添加防重复初始化的标志
let isInitialized = false;

// 修改initializeCesium函数，添加防重复调用
async function initializeCesium() {
  if (isInitialized) {
    console.log('Cesium已经初始化，跳过重复初始化');
    return viewer;
  }
  
  try {
  // 检查是否为离线环境
  if (isOfflineEnvironment()) {
    console.log('🚫 检测到离线环境，启用完全离线模式');
  }
  
  cesiumContainer.value.className = 'cesium-container cesium-viewer';
  
  // 使用离线配置创建查看器（在容器有效尺寸时）
  const el = cesiumContainer?.value;
  if (!el || !el.clientWidth || !el.clientHeight) {
    throw new Error('容器尺寸为0，延迟初始化');
  }
  const viewerOptions = createOfflineViewerConfig();
  viewer = new Cesium.Viewer(cesiumContainer.value, viewerOptions);
  resumeRenderLoop();

  // preRender 宽高校验：无效尺寸时跳过渲染并启用 requestRenderMode
  try {
    viewer.scene.preRender.addEventListener(() => {
      if (!isCanvasRenderable()) {
        pauseRenderLoop();
        try { viewer.scene.requestRenderMode = true; } catch (_) {}
        scheduleViewerRestart('preRender');
        return;
      }
      resumeRenderLoop();
      try { viewer.scene.requestRenderMode = false; } catch (_) {}
    });
  } catch (_) {}

  // 新增：绑定WebGL上下文丢失与恢复处理
  bindWebGLContextHandlers();
  // 额外 preRender 安全检查：异常尺寸时请求重启
  // preRender 恢复检查：尺寸恢复时关闭 requestRenderMode
  try {
    viewer.scene.preRender.addEventListener(() => {
      if (isCanvasRenderable()) {
        resumeRenderLoop();
      }
    });
  } catch (_) {}


  try {
    viewer.scene.preRender.addEventListener(() => {
      if (!isCanvasRenderable()) {
        pauseRenderLoop();
      }
    });
  } catch (_) {}
  
  // 初始化3DTiles加载器（必须在预加载前）
  // 性能优化设置
  optimizeSceneSettings();
  
  // 设置相机位置
  setCameraPosition();
  
  // 默认加载市政ArcGIS底图（防空纹理错误）
  try {
    await addArcGisBasemap();
  } catch (e) {
    console.warn('addArcGisBasemap 调用失败，跳过底图：', e);
  }
  
  // 预加载3D Tiles（但不显示）
  await preloadBuildings().catch((e) => console.warn('预加载3D Tiles失败：', e));

  installCameraHooks();
  handleCameraIdle();

  // 添加错误处理
  viewer.scene.globe.tileLoadProgressEvent.addEventListener((queuedTileCount) => {
    if (queuedTileCount === 0) {
      console.log('✅ 所有地形瓦片加载完成');
    }
  });

  viewer.scene.renderError.addEventListener((scene, error) => {
    console.error('Cesium渲染错误:', error);
  });
  
  // 启用尺寸观察与安全resize
  setupResizeObservation();
  safeResize();

  // 存储到store
  cesiumStore.setViewer(viewer);
    
    // 标记为已初始化
    isInitialized = true;
  
  return viewer;
  } catch (error) {
    console.error('Cesium初始化失败:', error);
    isInitialized = false; // 初始化失败时重置标志
  }
}

// 优化场景设置
function optimizeSceneSettings() {
  const scene = viewer.scene;
  
  // 关闭不必要的效果
  scene.highDynamicRange = false;
  scene.logarithmicDepthBuffer = false;
  scene.fog.enabled = false;
  scene.skyAtmosphere.show = false;
  scene.sun.show = false;
  scene.moon.show = false;
  
  // 启用按需渲染 + 限帧，进一步减载
  scene.requestRenderMode = true;
  scene.maximumRenderTimeChange = 1000 / 30; // 约30FPS
  
  // 优化地形设置
  scene.globe.maximumScreenSpaceError = 6.0;
  scene.globe.tileCacheSize = 800;
  
  // 设置最大倾斜角（限制相机能多"平"）
  // scene.screenSpaceCameraController.maximumTiltAngle = Cesium.Math.toRadians(55);
  
  // 设置摄影机高度限制（更保守）
  const controller = scene.screenSpaceCameraController;
  // controller.minimumZoomDistance = 50.0;        // 最小高度：900米
  // controller.maximumZoomDistance = 2500.0;       // 最大高度：2500米
  controller.enableCollisionDetection = true;    // 启用碰撞检测
  controller.minimumCollisionTerrainHeight = 5.0; // 最小碰撞地形高度：5米
  
  // 禁用双击飞行
  viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  
  // 自定义双击事件
  viewer.screenSpaceEventHandler.setInputAction((event) => {
    const pickedObject = scene.pick(event.position);
    if (pickedObject && pickedObject.id) {
      console.log('双击了建筑:', pickedObject.id.name);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  
  viewer.clock.shouldAnimate = false;
  
  console.log('✅ 摄影机高度限制已设置 - 最小: 900米, 最大: 2500米');

  // viewer.scene.skyBox = undefined; // 取消星空
  // viewer.scene.skyAtmosphere.show = false; // 你项目里已关闭
  // viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#D8D2C7'); // 改成任意颜色
}

// 设置相机位置
function setCameraPosition() {
  const { longitude, latitude, height } = CESIUM_CONFIG.defaultPosition;
  
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-75),
      roll: 0
    },
    duration: 0
  });
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
  }, 180);
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

  activeViewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(126.53, 45.8, 1500),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-25),
      roll: 0
    },
    duration: 1.0
  });
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
  console.log('切换区域显示，当前状态:', showDistricts.value);
  showDistricts.value = !showDistricts.value;
  console.log('切换后状态:', showDistricts.value);
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
  console.log('重置视图');
  if (viewer) {
    const { longitude, latitude, height } = CESIUM_CONFIG.defaultPosition;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-75),
        roll: 0
      },
      duration: 2.0
    });
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
  if (!DEBUG_LOG) return;
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
  console.log('CesiumView组件已挂载');
  
  // 防止重复初始化
  if (isInitialized) {
    console.log('Cesium已经初始化，跳过重复挂载');
    return;
  }
  
  // 检测离线状态
  if (isOfflineEnvironment()) {
    console.log('🌐 网络状态:', navigator.onLine ? '在线' : '离线');
    console.log('🚫 离线模式已启用');
  }
  
  // 确保容器已渲染且具有有效尺寸再初始化 Viewer
  await Promise.resolve(); // 让出一次事件循环，等待DOM渲染
  const container = cesiumContainer?.value;
  if (!container) {
    console.warn('Cesium容器尚未就绪，延迟初始化');
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
    console.warn('容器尺寸为0，暂不初始化Cesium，等待首次resize');
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
  console.log('CesiumView组件已卸载');
  isInitialized = false;

  window.removeEventListener('online', handleNetworkChange);
  window.removeEventListener('offline', handleNetworkChange);

  detachCameraHooks();
  teardownResizeObservation();
  disposeRenderLifecycle();

  try { disposePickInspector && disposePickInspector(); } catch {}
  disposePickInspector = null;
  pickInspectorEnabled.value = false;

  try { disposeAutoLabel && disposeAutoLabel(); } catch {}
  disposeAutoLabel = null;
  autoLabelEnabled.value = false;

  if (viewer) {
    clearHarbinDistricts();
    destroyBuildings();
    try { viewer.scene?.primitives?.removeAll?.(); } catch (_) {}
    try { viewer.destroy(); } catch (_) {}
    viewer = null;
  }

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
  console.log(`🌐 网络状态变化: ${isOnline ? '在线' : '离线'}`);
  
  if (!isOnline && isOfflineEnvironment()) {
    console.log('🚫 网络断开，确保离线模式运行');
    // 可以在这里添加额外的离线处理逻辑
  }
}

function beforeViewerDestroy() {
  detachCameraHooks();
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
  console.log('自动标注入口已禁用（由LOD系统统一管理）。');
}

// 测试：强制仅3DTiles模式开关（低耦合，便于删除）
function toggleForceTilesMode() {
  forceTilesMode.value = !forceTilesMode.value;
  if (forceTilesMode.value) {
    // 进入强制模式：显示Tiles并保留底图
    show3DTiles();
    showArcGISMap();
    currentDisplay = 'tiles';
    console.log('🧪 已进入测试模式：显示3D Tiles并保留底图');
  } else {
    // 退出强制模式：恢复自动切换一次
    console.log('🧪 已退出测试模式：恢复自动切换');
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
    console.warn('计算面积失败:', e);
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
      console.log(`点击了${layer.name}:`, entity);
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
    console.warn('toggleTileset error:', e);
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
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
  /* 新增：给最小高度，避免父容器布局抖动导致瞬时为0 */
  min-height: 320px;
}

/* 顶部标题栏样式（仿 FoldableTheme Blue） */
.app-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  background-color: #005FA2;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  z-index: 1100;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
}
.app-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-logo {
  width: 35px;
  height: 35px;
  background: transparent;
}
.app-titles { display: flex; flex-direction: column; line-height: 18px; }
.app-title { font-size: 22px; font-weight: 600; }
.app-header-right { 
  display: grid; 
  align-items: center; 
  gap: 6px; 
  position: relative; 
  grid-template-columns: minmax(0,1fr) 40px 40px 40px; /* 增加一列给重置按钮 */
}
.app-header-icon {
  width: 40px; height: 40px;
  background-color: rgba(0,0,0,0.3);
  border-right: 1px solid #323e4f;
  display: flex; align-items: center; justify-content: center;
  position: relative;
  z-index: 2;
}
/* 点击型头部图标：默认透明底，选中高亮 */
.app-header-icon.clickable { background-color: transparent; }
.app-header-icon.clickable.active { background-color: #004271; }
.app-header-icon:first-child { border-left: 1px solid #323e4f; }

.app-search-widget {
  width: 100%;
}
.app-icon-img { width: 22px; height: 22px; display: block; pointer-events: none; }
/* 搜索框样式 */

/* 头部图标内的图片尺寸 */

/* 四角控件容器 */
.ui-corners { position: absolute; inset: 40px 0 0 0; z-index: 1050; pointer-events: none; }
.corner { position: absolute; pointer-events: none; }
.bottom-left { left: 0; bottom: 16px; }

/* 坐标信息条 */
.coords {
  pointer-events: none;
  background: rgba(0,0,0,0.5);
  color: #fff;
  font-size: 10px;
  line-height: 17px;
  display: flex;
  gap: 8px;
  padding: 2px 6px;
}
.coord-item { white-space: nowrap; }

/* 浮动工具栏样式（保留） */
.floating-toolbar {
  position: absolute;
  top: 60px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 10px;
  border-radius: 10px;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.ft-btn {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.ft-btn:hover { background: rgba(255, 255, 255, 0.2); transform: translateY(-1px); }
.ft-btn.active { background: #2196F3; border-color: #2196F3; }

/* 确保Cesium canvas按钮点击不受阻 */
.cesium-container canvas { pointer-events: none; }
.cesium-container .cesium-viewer { pointer-events: none; }
.cesium-container .cesium-viewer canvas { pointer-events: auto; }

/* 隐藏旧遗留面板 */
.toolbar,
.measurement-info-panel,
.imagery-toggle,
.measurement-tools,
.measurement-panel { display: none; }

.app-header-icon.clickable { cursor: pointer; }

/* 量算面板 */
.measure-panel {
  position: absolute;
  top: 60px;
  right: 10px;
  width: 320px;
  height: calc(100vh - 80px);
  background: #fff;
  color: #333;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  z-index: 1200;
  display: flex;
  flex-direction: column;
}
.measure-panel-header {
  height: 44px;
  background: #005FA2;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}
.measure-panel-header .title { font-weight: 600; }
.measure-panel-header .actions .icon-btn {
  width: 28px; height: 28px; border: none; background: transparent; color: #fff; cursor: pointer;
}
.measure-tabs { display: flex; gap: 10px; padding: 10px; }
.tab-btn { flex: 1; height: 36px; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 4px; cursor: pointer; }
.tab-btn.active { background: #e6f2fb; border-color: #b6dcff; color: #005FA2; font-weight: 600; }
.tab-icon { margin-right: 6px; }
.measure-body { padding: 10px; overflow: auto; }
.hint { color: #4b5563; font-size: 13px; margin: 8px 0 12px; }
.form-row { margin: 8px 0 12px; }
.form-row label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
.select { width: 100%; height: 34px; border: 1px solid #d1d5db; border-radius: 4px; padding: 0 8px; }
.result-rows { display: grid; gap: 10px; margin: 8px 0 16px; }
.result-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
.result-row b { font-weight: 600; }
.btn-row { margin-top: auto; padding-top: 10px; }
.primary-btn { width: 100%; height: 36px; background: #0b74da; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.primary-btn:hover { background: #0a64bd; }
</style>

<style scoped>
/* 响应式与细节优化 */
@media (max-width: 992px) {
  .app-title { font-size: 18px; }
  .app-header-right { 
    grid-template-columns: minmax(0,1fr) 36px 36px 36px; 
    gap: 6px; 
  }
    .floating-toolbar { top: 56px; left: 10px; gap: 6px; padding: 8px; }
  .measure-panel { width: 300px; }
}

@media (max-width: 768px) {
  .app-header { height: 44px; padding: 0 8px; }
  .app-logo { width: 30px; height: 30px; }
  .app-title { font-size: 16px; }
  .app-header-right { 
    grid-template-columns: minmax(0,1fr) 32px 32px 32px; 
    gap: 4px; 
  }
    .floating-toolbar { top: 54px; left: 8px; padding: 6px; border-radius: 8px; }
  .ft-btn { padding: 5px 8px; font-size: 12px; }
  .measure-panel { top: 56px; right: 8px; width: 280px; height: calc(100vh - 70px); }
}

@media (max-width: 576px) {
  .app-header-left { gap: 6px; }
  .app-titles { display: none; }
  .app-header-right { 
    grid-template-columns: 1fr 32px 32px 32px; 
  }
    .floating-toolbar { top: auto; bottom: 14px; left: 10px; right: 10px; flex-wrap: nowrap; justify-content: center; }
  .measure-panel { top: auto; bottom: 0; right: 0; left: 0; width: 100%; height: 48vh; border-radius: 12px 12px 0 0; }
  .measure-panel-header { border-radius: 12px 12px 0 0; }
}

/* 轻微的视觉微调 */
.app-header-icon { border-radius: 6px; }
.floating-toolbar { backdrop-filter: blur(6px); }
</style>

<style scoped>
/* 专题数据面板样式 */
.topic-panel {
  position: absolute;
  top: 60px;
  right: 10px;
  width: 320px;
  height: calc(100vh - 80px);
  background: #fff;
  color: #333;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  z-index: 1200;
  display: flex;
  flex-direction: column;
}
.topic-header {
  height: 44px;
  background: #005FA2;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}
.topic-header .title { font-weight: 600; }
.topic-header .icon-btn { width: 28px; height: 28px; border: none; background: transparent; color: #fff; cursor: pointer; }
.topic-body { padding: 8px 10px; overflow: auto; }
.topic-group { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 10px; }
.group-head { display: flex; align-items: center; gap: 8px; padding: 10px; background: #f9fafb; cursor: pointer; }
.group-title { font-weight: 600; }
.group-content { padding: 6px; }
.topic-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 6px; border-bottom: 1px solid #f0f2f5; }
.topic-item:last-child { border-bottom: none; }
.topic-item.disabled { color: #9ca3af; }
.topic-item .label { font-size: 14px; }
/* 非当前层级半透明显示，当前层级高亮 */
.topic-item:not(.active):not(.disabled) .label { opacity: 0.5; }
.topic-item.active .label { opacity: 1; font-weight: 600; }
.topic-item .actions { display: flex; align-items: center; gap: 8px; }
.act-btn { height: 28px; padding: 0 10px; border: 1px solid #d1d5db; background: #f6f8fa; border-radius: 4px; cursor: pointer; }
.act-btn:hover { background: #e6f2fb; border-color: #b6dcff; }
.divider { height: 10px; }

@media (max-width: 992px) {
  .topic-panel { right: 12px; width: 300px; }
}
@media (max-width: 576px) {
  .topic-panel { top: auto; bottom: 0; right: 0; left: 0; width: 100%; height: 52vh; border-radius: 12px 12px 0 0; }
}
</style>

<style scoped>
/* 在现有样式中添加 */
.btn-row {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  gap: 8px;
}

.primary-btn {
  flex: 1;
  height: 36px;
  background: #0b74da;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.primary-btn:hover {
  background: #0a64bd;
}

.secondary-btn {
  flex: 1;
  height: 36px;
  background: #6c757d;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.secondary-btn:hover {
  background: #5a6268;
}
</style>

<style scoped>
.reset-text {
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  pointer-events: none;
  transition: all 0.2s ease;
}

.app-header-icon.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.app-header-icon.clickable:hover {
  background-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.app-header-icon.clickable:active {
  transform: scale(0.95);
  background-color: rgba(255, 255, 255, 0.2);
}
</style>

<style scoped>
/* 新增：信息面板样式 */
.info-panel {
  position: absolute;
  top: 50px;
  right: 20px;
  width: 300px;
  max-height: 400px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
}

.info-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #005FA2;
  color: white;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
}

.info-panel-body {
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
  /* 新增：视觉优化 */
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,250,250,0.98));
}

.entity-properties {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}

/* 移除最后一项分割线并优化卡片化显示 */
.property-item {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  font-size: 13px;
  line-height: 1.45;
}

.property-item strong {
  display: inline-block;
  min-width: 88px;
  color: #0b74da;
}

/* 新增：几何信息区块样式加强 */
.geometry-info {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 2px solid #005FA2;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

/* 新增：滚动条样式（仅视觉轻量） */
.info-panel-body::-webkit-scrollbar { width: 8px; }
.info-panel-body::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.15);
  border-radius: 8px;
}
.info-panel-body::-webkit-scrollbar-track { background: transparent; }
</style>








