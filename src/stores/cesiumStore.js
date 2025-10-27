import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';

export const useCesiumStore = defineStore('cesium', () => {
  // 状态
  const viewer = ref(null);
  const isInitialized = ref(false);
  const currentPosition = reactive({
    longitude: 126.643927,
    latitude: 45.757446,
    height: 10000
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
  
  function flyToPosition(longitude, latitude, height, duration = 2.0) {
    if (viewer.value) {
      viewer.value.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-75),
          roll: 0
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
  const presetPositions = {
    harbin: {
      name: '哈尔滨市中心',
      longitude: 126.643927,
      latitude: 45.757446,
      height: 10000
    },
    buildings: {
      name: '建筑群',
      longitude: 126.53,
      latitude: 45.80,
      height: 1500
    },
    districts: {
      name: '区域概览',
      longitude: 126.643927,
      latitude: 45.757446,
      height: 15000
    }
  };
  
  function flyToPreset(presetName) {
    const preset = presetPositions[presetName];
    if (preset && viewer.value) {
      flyToPosition(preset.longitude, preset.latitude, preset.height);
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