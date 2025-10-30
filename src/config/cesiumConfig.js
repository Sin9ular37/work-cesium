import { APP_CONFIG, cloneConfigSection } from './appConfig';

/**
 * Cesium配置文件
 */

const BASE_URL = import.meta.env.BASE_URL || '/';

const baseCesiumConfig = cloneConfigSection(APP_CONFIG.cesium || {});

if (baseCesiumConfig?.dataSources?.harbinDistricts?.url) {
  baseCesiumConfig.dataSources.harbinDistricts.url = `${BASE_URL}${baseCesiumConfig.dataSources.harbinDistricts.url}`;
}

if (baseCesiumConfig?.dataSources?.buildings?.tilesetUrl) {
  baseCesiumConfig.dataSources.buildings.tilesetUrl = `${BASE_URL}${baseCesiumConfig.dataSources.buildings.tilesetUrl}`;
}

export const CESIUM_CONFIG = baseCesiumConfig;

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
