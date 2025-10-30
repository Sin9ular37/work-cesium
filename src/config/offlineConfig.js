import { APP_CONFIG, cloneConfigSection } from './appConfig';

/**
 * 离线部署配置文件
 * 确保在无网络环境中完全离线运行
 */

const MODE = import.meta.env.MODE;
const BASE_URL = import.meta.env.BASE_URL || '/';
const isProd = MODE === 'production';

const baseOfflineConfig = cloneConfigSection(APP_CONFIG.offline || {});
const localDataSources = baseOfflineConfig.localDataSources || {};

const prefixPath = (value) => {
  if (!value && value !== '') return value;
  return `${BASE_URL}${value}`;
};

if (localDataSources.imagery) {
  if (localDataSources.imagery.primary) {
    localDataSources.imagery.primary = prefixPath(localDataSources.imagery.primary);
  }
  if (localDataSources.imagery.fallback) {
    localDataSources.imagery.fallback = prefixPath(localDataSources.imagery.fallback);
  }
}

if (localDataSources.models) {
  if (localDataSources.models.buildings) {
    localDataSources.models.buildings = prefixPath(localDataSources.models.buildings);
  }
  if (localDataSources.models.terrain) {
    localDataSources.models.terrain = prefixPath(localDataSources.models.terrain);
  }
}

if (localDataSources.geospatial) {
  if (localDataSources.geospatial.districts) {
    localDataSources.geospatial.districts = prefixPath(localDataSources.geospatial.districts);
  }
  if (localDataSources.geospatial.boundaries) {
    localDataSources.geospatial.boundaries = prefixPath(localDataSources.geospatial.boundaries);
  }
}

export const OFFLINE_CONFIG = {
  ...baseOfflineConfig,
  localDataSources,
  isOfflineMode: isProd ? true : import.meta.env.VITE_OFFLINE_MODE === 'true'
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
  const viewerOptions = cloneConfigSection(baseOfflineConfig.viewerOptions || {});
  viewerOptions.creditContainer = document.createElement('div');
  if (!('requestRenderMode' in viewerOptions)) {
    viewerOptions.requestRenderMode = true;
  }
  if (!('maximumRenderTimeChange' in viewerOptions)) {
    viewerOptions.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
  }
  if (!('imageryProvider' in viewerOptions)) {
    viewerOptions.imageryProvider = false;
  }
  return viewerOptions;
}

export default OFFLINE_CONFIG;
