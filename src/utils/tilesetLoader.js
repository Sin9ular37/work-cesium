/**
 * 3DTiles加载工具函数
 * 提供统一的3DTiles加载接口，支持独立服务
 */

import * as Cesium from "cesium"
import { getTilesetPath, checkTilesetExists, checkTilesetService } from "../config/tilesetsConfig"

/**
 * 3DTiles加载配置
 */
export const TILESET_CONFIG = {
  // 默认配置
  default: {
    show: false, // 默认隐藏
    heightOffset: 0, // 高度偏移
    debug: false, // 调试模式
    cullWithChildrenBounds: true, // 优化渲染
    dynamicScreenSpaceError: true, // 动态屏幕空间误差
    maximumScreenSpaceError: 48, // 合理SSE，保证视角内加载
    maximumMemoryUsage: 256, // 降低最大内存使用量(MB)
    skipLevelOfDetail: true, // 跳过细节层次
    baseScreenSpaceError: 2048, // 提高基础SSE
    skipScreenSpaceErrorFactor: 24, // 提高跳过因子
    skipLevels: 2, // 多跳一级，进一步减载
    immediatelyLoadDesiredLevelOfDetail: false, // 立即加载所需细节层次
    loadSiblings: false, // 不加载兄弟节点
    clippingPlanes: undefined, // 裁剪平面

    // 新增：流式加载/网络优化（更激进）
    cullRequestsWhileMoving: true,
    cullRequestsWhileMovingMultiplier: 20.0,
    preferLeaves: true,
    progressiveResolutionHeightFraction: 0.75,
    dynamicScreenSpaceErrorDensity: 0.00278,
    foveatedScreenSpaceError: true,
    foveatedConeSize: 0.1,
    foveatedMinimumScreenSpaceErrorRelaxation: 0.0,
    foveatedTimeDelay: 0.2,

    // 限制一次加载的瓦片数量（运行期属性）
    maximumNumberOfLoadedTiles: 128
  }
}

/**
 * 加载3DTiles数据集
 * @param {string} tilesetName - 3DTiles数据集名称
 * @param {Object} options - 加载选项
 * @returns {Promise<Cesium.Cesium3DTileset|null>} 3DTiles数据集
 */
export async function loadTileset(tilesetName, options = {}) {
  try {
    console.log(`开始加载3DTiles数据集: ${tilesetName}`)
    
    // 检查服务可用性
    const serviceAvailable = await checkTilesetService(tilesetName)
    if (!serviceAvailable) {
      throw new Error(`3DTiles服务不可用: ${tilesetName}`)
    }
    
    // 获取3DTiles路径
    const tilesetPath = getTilesetPath(tilesetName)
    if (!tilesetPath) {
      throw new Error(`未找到3DTiles配置: ${tilesetName}`)
    }
    
    console.log(`3DTiles服务地址: ${tilesetPath}`)
    
    // 检查文件是否存在
    const exists = await checkTilesetExists(tilesetName)
    if (!exists) {
      throw new Error(`3DTiles文件不存在: ${tilesetPath}`)
    }
    
    // 合并配置
    const config = { ...TILESET_CONFIG.default, ...options }
    
    // 创建3DTiles数据集
    const tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetPath, {
      // 性能优化选项
      cullWithChildrenBounds: config.cullWithChildrenBounds,
      dynamicScreenSpaceError: config.dynamicScreenSpaceError,
      maximumScreenSpaceError: config.maximumScreenSpaceError,
      maximumMemoryUsage: config.maximumMemoryUsage,
      skipLevelOfDetail: config.skipLevelOfDetail,
      baseScreenSpaceError: config.baseScreenSpaceError,
      skipScreenSpaceErrorFactor: config.skipScreenSpaceErrorFactor,
      skipLevels: config.skipLevels,
      immediatelyLoadDesiredLevelOfDetail: config.immediatelyLoadDesiredLevelOfDetail,
      loadSiblings: config.loadSiblings,
      clippingPlanes: config.clippingPlanes,

      // 请求/剔除与渐进分辨率
      cullRequestsWhileMoving: config.cullRequestsWhileMoving,
      cullRequestsWhileMovingMultiplier: config.cullRequestsWhileMovingMultiplier,
      preferLeaves: config.preferLeaves,
      progressiveResolutionHeightFraction: config.progressiveResolutionHeightFraction,
      dynamicScreenSpaceErrorDensity: config.dynamicScreenSpaceErrorDensity,

      // 注视点优先策略（中心优先加载）
      foveatedScreenSpaceError: config.foveatedScreenSpaceError,
      foveatedConeSize: config.foveatedConeSize,
      foveatedMinimumScreenSpaceErrorRelaxation: config.foveatedMinimumScreenSpaceErrorRelaxation,
      foveatedTimeDelay: config.foveatedTimeDelay
    })
    
    // 等待tileset准备完成
    await tileset.readyPromise
    
    // 应用配置
    tileset.show = config.show
    tileset.debugShowBoundingVolume = config.debug
    tileset.debugShowContentBoundingVolume = config.debug
    tileset.debugShowGeometricError = config.debug
    tileset.debugShowRenderingStatistics = config.debug

    // 限制一次保留在内存中的瓦片数量
    if (Number.isFinite(config.maximumNumberOfLoadedTiles)) {
      tileset.maximumNumberOfLoadedTiles = config.maximumNumberOfLoadedTiles
    }

    // 进一步降低并发与预取
    tileset.preloadWhenHidden = false
    tileset.preloadFlightDestinations = false
    tileset.preloadSiblings = false
    
    // 设置高度偏移
    if (config.heightOffset !== 0) {
      tileset.modelMatrix = Cesium.Matrix4.fromTranslation(
        new Cesium.Cartesian3(0, 0, config.heightOffset)
      )
    }
    
    console.log(`✅ 3DTiles数据集加载成功: ${tilesetName}`)
    console.log(`边界球信息:`, {
      center: tileset.boundingSphere?.center,
      radius: tileset.boundingSphere?.radius
    })
    
    return tileset
    
  } catch (error) {
    console.error(`❌ 3DTiles数据集加载失败: ${tilesetName}`, error)
    return null
  }
}

/**
 * 创建3DTiles加载器
 * @param {Cesium.Viewer} viewer - Cesium查看器实例
 * @returns {Object} 3DTiles加载器
 */
export function createTilesetLoader(viewer) {
  const loadedTilesets = new Map()

  // 启用按需渲染，减少无关帧渲染
  if (viewer && viewer.scene) {
    viewer.scene.requestRenderMode = true
    viewer.scene.maximumRenderTimeChange = Infinity
  }
  
  return {
    /**
     * 加载3DTiles数据集
     * @param {string} tilesetName - 3DTiles数据集名称
     * @param {Object} options - 加载选项
     * @returns {Promise<Cesium.Cesium3DTileset|null>} 3DTiles数据集
     */
    async load(tilesetName, options = {}) {
      // 如果已经加载过，直接返回
      if (loadedTilesets.has(tilesetName)) {
        console.log(`3DTiles数据集已加载: ${tilesetName}`)
        return loadedTilesets.get(tilesetName)
      }
      
      // 加载3DTiles数据集
      const tileset = await loadTileset(tilesetName, options)
      if (tileset) {
        // 添加到场景中
        viewer.scene.primitives.add(tileset)
        loadedTilesets.set(tilesetName, tileset)
      }
      
      return tileset
    },
    
    /**
     * 卸载3DTiles数据集
     * @param {string} tilesetName - 3DTiles数据集名称
     */
    unload(tilesetName) {
      const tileset = loadedTilesets.get(tilesetName)
      if (tileset) {
        viewer.scene.primitives.remove(tileset)
        loadedTilesets.delete(tilesetName)
        console.log(`3DTiles数据集已卸载: ${tilesetName}`)
      }
    },
    
    /**
     * 获取已加载的3DTiles数据集
     * @param {string} tilesetName - 3DTiles数据集名称
     * @returns {Cesium.Cesium3DTileset|undefined} 3DTiles数据集
     */
    get(tilesetName) {
      return loadedTilesets.get(tilesetName)
    },
    
    /**
     * 获取所有已加载的3DTiles数据集
     * @returns {Map} 已加载的3DTiles数据集
     */
    getAll() {
      return loadedTilesets
    },
    
    /**
     * 清除所有3DTiles数据集
     */
    clear() {
      loadedTilesets.forEach((tileset, name) => {
        viewer.scene.primitives.remove(tileset)
        console.log(`3DTiles数据集已清除: ${name}`)
      })
      loadedTilesets.clear()
    }
  }
}

export default {
  loadTileset,
  createTilesetLoader,
  TILESET_CONFIG
} 