import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import * as Cesium from 'cesium';
import { APP_CONFIG, cloneConfigSection } from '../config/appConfig';

const cesiumConfig = APP_CONFIG.cesium || {};
const defaultPositionConfig = cloneConfigSection(cesiumConfig.defaultPosition || {});
const presetPositionsConfig = cloneConfigSection(cesiumConfig.presetPositions || {});
const cameraConfig = cesiumConfig.camera || {};
const defaultOrientation = cloneConfigSection(cameraConfig.defaultOrientation || {
  heading: 0,
  pitch: -75,
  roll: 0
});
const defaultFlyDuration = cameraConfig.flyToDuration ?? 2.0;

export const useCesiumStore = defineStore('cesium', () => {
  // 状态
  const viewer = ref(null);
  const isInitialized = ref(false);
  const currentPosition = reactive({
    longitude: defaultPositionConfig.longitude ?? 0,
    latitude: defaultPositionConfig.latitude ?? 0,
    height: defaultPositionConfig.height ?? 0
  });
  
  const sceneState = reactive({
    showBuildings: false,
    showDistricts: false,
    buildingsLoaded: false,
    districtsLoaded: false
  });
  
  const performanceMetrics = reactive({
    fps: 0,
    memoryUsage: 0,
    drawCalls: 0,
    triangles: 0
  });
  
  // Actions
  function setViewer(cesiumViewer) {
    viewer.value = cesiumViewer;
    isInitialized.value = true;
  }
  
  function clearViewer() {
    if (viewer.value) {
      viewer.value.destroy();
      viewer.value = null;
    }
    isInitialized.value = false;
    resetSceneState();
  }
  
  function setCurrentPosition(longitude, latitude, height) {
    currentPosition.longitude = longitude;
    currentPosition.latitude = latitude;
    currentPosition.height = height;
  }
  
  function updateSceneState(newState) {
    Object.assign(sceneState, newState);
  }
  
  function resetSceneState() {
    Object.assign(sceneState, {
      showBuildings: false,
      showDistricts: false,
      buildingsLoaded: false,
      districtsLoaded: false
    });
  }
  
  function updatePerformanceMetrics(metrics) {
    Object.assign(performanceMetrics, metrics);
  }
  
  function flyToPosition(
    longitude,
    latitude,
    height,
    duration = defaultFlyDuration,
    orientation = defaultOrientation
  ) {
    if (viewer.value) {
      viewer.value.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
        orientation: {
          heading: Cesium.Math.toRadians(orientation?.heading ?? defaultOrientation.heading ?? 0),
          pitch: Cesium.Math.toRadians(orientation?.pitch ?? defaultOrientation.pitch ?? -75),
          roll: Cesium.Math.toRadians(orientation?.roll ?? defaultOrientation.roll ?? 0)
        },
        duration: duration
      });
      
      setCurrentPosition(longitude, latitude, height);
    }
  }
  
  function resetView() {
    if (viewer.value) {
      flyToPosition(
        currentPosition.longitude,
        currentPosition.latitude,
        currentPosition.height,
        1.0
      );
    }
  }
  
  // 预设位置
  const presetPositions = presetPositionsConfig;
  
  function flyToPreset(presetName) {
    const preset = presetPositions[presetName];
    if (preset && viewer.value) {
      const targetOrientation = {
        heading: preset.heading ?? preset.orientation?.heading ?? defaultOrientation.heading,
        pitch: preset.pitch ?? preset.orientation?.pitch ?? defaultOrientation.pitch,
        roll: preset.roll ?? preset.orientation?.roll ?? defaultOrientation.roll
      };
      flyToPosition(
        preset.longitude,
        preset.latitude,
        preset.height,
        preset.duration ?? defaultFlyDuration,
        targetOrientation
      );
    }
  }
  
  return {
    // 状态
    viewer,
    isInitialized,
    currentPosition,
    sceneState,
    performanceMetrics,
    presetPositions,
    
    // Actions
    setViewer,
    clearViewer,
    setCurrentPosition,
    updateSceneState,
    resetSceneState,
    updatePerformanceMetrics,
    flyToPosition,
    resetView,
    flyToPreset
  };
}); 
