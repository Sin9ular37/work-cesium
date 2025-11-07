<template>
  <div ref="cesiumContainer" class="cesium-container">
    <!-- 顶部标题栏（仿 Web AppBuilder FoldableTheme） -->
    <div class="app-header">
      <div class="app-header-left">
        <img class="app-logo" alt="logo" :src="appLogo" />
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
        <div class="app-header-icon clickable" :class="{ active: topicPanel.visible.value }" title="专题面板" @click.stop="handleTopicPanelToggle"><img class="app-icon-img" :src="listIcon" alt="list" /></div>
        <div class="app-header-icon clickable" :class="{ active: measurePanelVisible }" title="测量工具" @click.stop="toggleMeasurePanel"><img class="app-icon-img" :src="gaugeIcon" alt="gauge" /></div>
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
    <div v-if="showDebugTestButton" class="debug-button-stack">
      <DebugFlyButton @trigger="debugFlyToTileset">定位 Tileset</DebugFlyButton>
      <DebugFlyButton @trigger="toggleDebugInspector">包围盒</DebugFlyButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { SearchWidget } from '../modules/search';
import TopicPanel from '../modules/topicPanel/index.vue';
import InfoPanel from '../modules/infoPanel/index.vue';
import UiFeedbackHost from '../modules/ui/UiFeedbackHost.vue';
import DebugFlyButton from './DebugFlyButton.vue';
import 'cesium/Build/Cesium/Widgets/widgets.css';

import { useCesiumBoot } from '../composables/useCesiumBoot';

const cesiumContainer = ref<HTMLDivElement | null>(null);

const appLogo = new URL('../assets/icons/app-logo.png', import.meta.url).href;
const listIcon = new URL('../assets/icons/list_icon.png', import.meta.url).href;
const gaugeIcon = new URL('../assets/icons/guage_icon.png', import.meta.url).href;

const {
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
} = useCesiumBoot({ cesiumContainer });

const showDebugTestButton = true;
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

.debug-button-stack {
  position: absolute;
  right: 16px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 1300;
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










