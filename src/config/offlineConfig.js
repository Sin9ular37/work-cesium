/**
 * 离线部署配置文件
 * 确保在无网络环境中完全离线运行
 */

const MODE = import.meta.env.MODE
const BASE_URL = import.meta.env.BASE_URL || '/'
const isProd = MODE === 'production'

export const OFFLINE_CONFIG = {
  // 离线模式标识：生产环境强制离线，开发环境可通过 .env.development 配置
  isOfflineMode: isProd ? true : (import.meta.env.VITE_OFFLINE_MODE === 'true'),
  
  // 本地数据源配置
  localDataSources: {
    // 本地影像
    imagery: {
      primary: `${BASE_URL}a605d-main/a605d-main/233/233_Level_6.png`,
      fallback: `${BASE_URL}a605d-main/a605d-main/233/233_Level_6.png`,
      bounds: {
        west: -180.0,
        south: -89.6484375,
        east: 179.6484375,
        north: 90.0
      }
    },
    
    // 本地3D模型
    models: {
      buildings: `${BASE_URL}example-3dtiles/tileset.json`,
      terrain: null // 离线环境不使用地形
    },
    
    // 本地地理数据
    geospatial: {
      districts: `${BASE_URL}ceshi.geojson`,
      boundaries: `${BASE_URL}ceshi.geojson`
    }
  },
  
  // 离线功能配置
  features: {
    // 禁用所有网络相关功能
    networkFeatures: {
      ionServices: false,
      worldTerrain: false,
      onlineImagery: false,
      geocoding: false,
      weather: false
    },
    
    // 启用本地功能
    localFeatures: {
      localImagery: true,
      local3DModels: true,
      localGeoData: true,
      staticBackground: true
    }
  },
  
  // 性能优化配置（离线环境）
  performance: {
    scene: {
      highDynamicRange: false,
      logarithmicDepthBuffer: false,
      fog: false,
      skyAtmosphere: false,
      sun: false,
      moon: false
    },
    
    // 离线环境不使用地形，节省资源
    terrain: {
      enabled: false,
      maximumScreenSpaceError: 0,
      tileCacheSize: 0
    },
    
    // 减少内存使用
    memory: {
      maximumMemoryUsage: 512, // MB
      enableFrustumCulling: true,
      enableOcclusionCulling: true
    }
  },
  
  // 错误处理配置
  errorHandling: {
    // 网络错误时自动回退到本地资源
    networkErrorFallback: true,
    
    // 本地资源加载失败时的处理
    localResourceFallback: {
      imagery: 'createStaticBackground',
      models: 'hideModels',
      data: 'showErrorMessage'
    }
  }
};

/**
 * 检查是否为离线环境
 * @returns {boolean}
 */
export function isOfflineEnvironment() {
  return !navigator.onLine || OFFLINE_CONFIG.isOfflineMode;
}

/**
 * 获取离线配置
 * @param {string} path - 配置路径
 * @param {*} defaultValue - 默认值
 * @returns {*} 配置值
 */
export function getOfflineConfig(path, defaultValue = null) {
  const keys = path.split('.');
  let value = OFFLINE_CONFIG;
  
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
 * 创建完全离线的Cesium查看器配置
 * @returns {Object} 查看器配置
 */
export function createOfflineViewerConfig() {
  return {
    homeButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    shadows: false,
    shouldAnimate: false,
    animation: false,
    timeline: false,
    geocoder: false,
    navigationHelpButton: false,
    // 完全禁用地形
    terrain: undefined,
    // 禁用所有网络请求
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    // 使用本地资源
    imageryProvider: false,
    // 自定义信用信息
    creditContainer: document.createElement('div')
  };
}

export default OFFLINE_CONFIG; 