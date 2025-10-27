/**
 * Cesium配置文件
 */

const BASE_URL = import.meta.env.BASE_URL || '/'

export const CESIUM_CONFIG = {
  // 移除访问令牌，避免Ion相关网络请求
  // accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzMzJlNGY2My0wZDZhLTRlYmUtODBhZC01YTA5OTBkNmJlMTUiLCJpZCI6MzI0OTc2LCJpYXQiOjE3NTM2Njg5NzZ9.GWVyIn3FOVp0WN3rCEb8dJSmIs49iLG-3LYMa1HPP2Y',
  
  // 默认位置（哈尔滨）
  defaultPosition: {
    longitude: 126.643927,
    latitude: 45.757446,
    height: 10000
  },
  
  // 建筑位置配置
  buildingPositions: [
    { 
      longitude: 126.53, 
      latitude: 45.80, 
      height: 100, 
      name: '市中心主建筑',
      color: '#4A90E2'
    },
    { 
      longitude: 126.535, 
      latitude: 45.805, 
      height: 80, 
      name: '商业区建筑',
      color: '#50C878'
    },
    { 
      longitude: 126.525, 
      latitude: 45.795, 
      height: 120, 
      name: '高层建筑',
      color: '#FF6B35'
    }
  ],
  
  // 性能优化配置
  performance: {
    // 场景优化
    scene: {
      highDynamicRange: false,
      logarithmicDepthBuffer: false,
      fog: false,
      skyAtmosphere: false,
      sun: false,
      moon: false
    },
    
    // 地形优化
    terrain: {
      maximumScreenSpaceError: 4.0,
      tileCacheSize: 1000
    }
  },
  
  // 预设位置
  presetPositions: {
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
    },
    airport: {
      name: '哈尔滨太平国际机场',
      longitude: 126.25,
      latitude: 45.62,
      height: 8000
    },
    railway: {
      name: '哈尔滨火车站',
      longitude: 126.63,
      latitude: 45.76,
      height: 2000
    }
  },
  
  // 数据源配置
  dataSources: {
    harbinDistricts: {
      url: `${BASE_URL}data/harbin-districts.geojson`,
      style: {
        polygonAlpha: 0.3,
        outlineColor: '#FFFFFF',
        outlineWidth: 2,
        labelFont: '14px sans-serif',
        labelColor: '#FFFFFF',
        labelOutlineColor: '#000000',
        labelOutlineWidth: 2
      }
    },
    buildings: {
      tilesetUrl: `${BASE_URL}data/harbin-buildings-tileset.json`,
      style: {
        color: '#4A90E2',
        alpha: 0.7
      }
    }
  },
  
  // UI配置
  ui: {
    controlPanel: {
      position: 'top-left',
      theme: 'dark'
    }
  },
  
  // 相机配置
  camera: {
    defaultOrientation: {
      heading: 0,
      pitch: -75,
      roll: 0
    },
    flyToDuration: 2.0,
    minDistance: 100,
    maxDistance: 50000
  },
  
  // 事件配置
  events: {
    enableDoubleClick: false,
    enableRightClick: true,
    enableMouseWheel: true
  }
};

/**
 * 获取配置项
 * @param {string} path - 配置路径，如 'performance.scene.highDynamicRange'
 * @param {*} defaultValue - 默认值
 * @returns {*} 配置值
 */
export function getConfig(path, defaultValue = null) {
  const keys = path.split('.');
  let value = CESIUM_CONFIG;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }
  
  return value;
}

/**
 * 设置配置项
 * @param {string} path - 配置路径
 * @param {*} value - 配置值
 */
export function setConfig(path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  let target = CESIUM_CONFIG;
  
  for (const key of keys) {
    if (!(key in target)) {
      target[key] = {};
    }
    target = target[key];
  }
  
  target[lastKey] = value;
}

export default CESIUM_CONFIG; 