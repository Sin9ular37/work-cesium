import { createLogger } from '../utils/logger';

/**
 * 3DTiles路径配置（独立服务方式）
 */

const MODE = import.meta.env.MODE
const logger = createLogger('TilesetsConfig', { level: 'warn' });

// 3DTiles 服务配置
export const TILESET_SERVICES = {
  // 开发环境：本地Python HTTP服务器
  development: {
    baseUrl: "http://localhost:8888",
    buildings: "/tileset.json"  // 直接访问根目录的tileset.json
  },

  // 生产环境：生产服务器
  // production: {
  //   baseUrl: "https://your-tiles-server.com",
  //   buildings: "/3dtiles/tileset.json"
  // }
  production: {
    baseUrl: "http://localhost:8899",
    buildings: "/tileset.json"
  }
}

/**
 * 获取 3DTiles 路径
 * @param {string} tilesetName - 3DTiles 数据集名称
 * @returns {string|null}
 */
export function getTilesetPath(tilesetName) {
  const config = TILESET_SERVICES[MODE] || TILESET_SERVICES.development
  const baseUrl = config.baseUrl
  const tilesetPath = config[tilesetName]
  
  if (!tilesetPath) {
    logger.warn(`未找到3DTiles配置: ${tilesetName}`)
    return null
  }
  
  return `${baseUrl}${tilesetPath}`
}

/**
 * 检查 3DTiles 服务是否可用
 * @param {string} tilesetName
 * @returns {Promise<boolean>}
 */
export async function checkTilesetService(tilesetName) {
  const config = TILESET_SERVICES[MODE] || TILESET_SERVICES.development
  const baseUrl = config.baseUrl
  
  try {
    // 检查服务根路径
    const response = await fetch(baseUrl, { 
      method: 'HEAD',
      mode: 'cors'
    })
    return response.ok
  } catch (error) {
    logger.warn(`3DTiles服务不可用: ${baseUrl}`, error)
    return false
  }
}

/**
 * 检查 3DTiles 文件是否存在
 * @param {string} tilesetName
 * @returns {Promise<boolean>}
 */
export async function checkTilesetExists(tilesetName) {
  const path = getTilesetPath(tilesetName)
  if (!path) return false

  try {
    const response = await fetch(path, { 
      method: 'HEAD',
      mode: 'cors'
    })
    
    if (!response.ok) return false
    
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/html')) {
      logger.warn(`检测到可能的 HTML 回退: ${path}`)
      return false
    }

    return true
  } catch (error) {
    logger.warn(`检查3DTiles文件失败: ${path}`, error)
    return false
  }
}

export default TILESET_SERVICES 
