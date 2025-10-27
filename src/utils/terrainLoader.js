import * as Cesium from "cesium"

/**
 * 低耦合 DEM 加载工具（便于独立删除）
 * 提供ArcGIS地形服务、关闭地形的接口
 * 优化：从 ImageServer 元数据读取 minLOD/maxLOD 与 tileInfo，按 fullExtent 裁剪 x/y 请求
 */

/**
 * 自定义ArcGIS地形提供器，支持从服务元数据自动设置层级，并裁剪行列范围
 */
class SmartArcGISTerrainProvider extends Cesium.ArcGISTiledElevationTerrainProvider {
  constructor(options) {
    super(options)
    this._minLevel = null
    this._maxLevel = null
    this._detectionPromise = null
    this._url = options.url

    // 缓存元数据用于 x/y 裁剪
    this._lods = null          // tileInfo.lods
    this._origin = null        // { x, y }
    this._extent = null        // { xmin, ymin, xmax, ymax }
    this._tileSize = 256       // rows/cols，默认256
  }

  /**
   * 检测地形服务的最小和最大等级（优先读取 ?f=pjson）
   */
  async _detectLevels() {
    if (this._detectionPromise) {
      return this._detectionPromise
    }
    this._detectionPromise = this._performLevelDetection()
    return this._detectionPromise
  }

  async _performLevelDetection() {
    try {
      console.log('[SmartTerrainProvider] 开始检测地形服务等级...')
      console.log('[SmartTerrainProvider] 服务URL:', this._url)

      // 1) 优先读取服务元数据
      const metaUrl = this._url.endsWith('/') ? `${this._url}?f=pjson` : `${this._url}/?f=pjson`
      let minLevel = 0
      let maxLevel = 23

      const metaResp = await fetch(metaUrl)
      if (metaResp.ok) {
        const meta = await metaResp.json()

        // 缓存：lods、origin、fullExtent、tileSize
        const lods = Array.isArray(meta?.tileInfo?.lods) ? meta.tileInfo.lods : null
        const origin = meta?.tileInfo?.origin
        const fullExtent = meta?.fullExtent || meta?.extent || meta?.initialExtent
        const tileSize = Number.isFinite(meta?.tileInfo?.rows) ? meta.tileInfo.rows : 256

        if (lods && lods.length > 0) {
          this._lods = lods
        }
        if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
          this._origin = { x: origin.x, y: origin.y }
        }
        if (fullExtent && Number.isFinite(fullExtent.xmin) && Number.isFinite(fullExtent.ymin) && Number.isFinite(fullExtent.xmax) && Number.isFinite(fullExtent.ymax)) {
          this._extent = {
            xmin: fullExtent.xmin,
            ymin: fullExtent.ymin,
            xmax: fullExtent.xmax,
            ymax: fullExtent.ymax
          }
        }
        if (Number.isFinite(tileSize)) {
          this._tileSize = tileSize
        }

        const minLOD = Number.isFinite(meta?.minLOD) ? meta.minLOD : undefined
        const maxLOD = Number.isFinite(meta?.maxLOD) ? meta.maxLOD : undefined

        if (Number.isFinite(minLOD) && Number.isFinite(maxLOD) && maxLOD >= minLOD) {
          minLevel = minLOD
          maxLevel = maxLOD
        } else if (lods && lods.length > 0) {
          const levels = lods.map(l => l.level).filter(n => Number.isFinite(n))
          minLevel = Math.min(...levels)
          maxLevel = Math.max(...levels)
        } else {
          // 极少数情况缺失 lods；保守回退
          minLevel = 0
          maxLevel = 23
        }

        this._minLevel = minLevel
        this._maxLevel = maxLevel
        console.log(`[SmartTerrainProvider] 等级检测完成 - 最小: ${minLevel}, 最大: ${maxLevel}`)
        return { minLevel, maxLevel }
      }

      // 2) 元数据不可用：保守默认
      console.warn('[SmartTerrainProvider] 元数据获取失败，使用默认 0-23')
      this._minLevel = 0
      this._maxLevel = 23
      return { minLevel: 0, maxLevel: 23 }
    } catch (error) {
      console.warn('[SmartTerrainProvider] 等级检测失败，使用默认值', error)
      this._minLevel = 0
      this._maxLevel = 23
      return { minLevel: 0, maxLevel: 23 }
    }
  }

  /**
   * 重写getLevelMaximumGeometricError（按需，保留默认行为）
   */
  getLevelMaximumGeometricError(level) {
    if (this._minLevel === null) {
      return super.getLevelMaximumGeometricError(level)
    }
    if (level < this._minLevel) {
      return Number.MAX_VALUE
    }
    return super.getLevelMaximumGeometricError(level)
  }

  /**
   * 重写getTilingScheme，限定在有效层级范围
   */
  getTilingScheme() {
    if (this._minLevel === null) {
      return super.getTilingScheme()
    }

    const tilingScheme = super.getTilingScheme()
    const original = tilingScheme
    const custom = {
      ...original,
      getNumberOfXTilesAtLevel: (level) => {
        if (level < this._minLevel || level > this._maxLevel) {
          return 0
        }
        return original.getNumberOfXTilesAtLevel(level)
      },
      getNumberOfYTilesAtLevel: (level) => {
        if (level < this._minLevel || level > this._maxLevel) {
          return 0
        }
        return original.getNumberOfYTilesAtLevel(level)
      }
    }
    return custom
  }

  /**
   * 辅助：计算某级别每瓦片覆盖的米数
   */
  _tileSpanAtLevel(level) {
    if (!this._lods) return null
    const record = this._lods.find(l => l.level === level) || this._lods[level] // 兼容用数组下标访问
    const res = record?.resolution
    if (!Number.isFinite(res)) return null
    return res * this._tileSize
  }

  /**
   * 辅助：计算某级别有效x/y行列范围（裁剪至[0, 2^z-1]）
   */
  _tileRangeForLevel(level) {
    if (!this._origin || !this._extent) return null
    const span = this._tileSpanAtLevel(level)
    if (!Number.isFinite(span) || span <= 0) return null

    const originX = this._origin.x
    const originY = this._origin.y
    const { xmin, ymin, xmax, ymax } = this._extent

    const xMin = Math.floor((xmin - originX) / span)
    const xMax = Math.floor((xmax - originX) / span)
    const yMin = Math.floor((originY - ymax) / span)
    const yMax = Math.floor((originY - ymin) / span)

    const n = 1 << level
    return {
      xMin: Math.max(0, xMin),
      xMax: Math.min(n - 1, xMax),
      yMin: Math.max(0, yMin),
      yMax: Math.min(n - 1, yMax)
    }
  }

  /**
   * 重写requestTileGeometry：限定层级与x/y范围
   */
  requestTileGeometry(x, y, level, request) {
    // 确保等级检测完成
    if (this._minLevel === null) {
      this._detectLevels().then(() => {
        this.requestTileGeometry(x, y, level, request)
      })
      return
    }

    // 级别裁剪
    if (level < this._minLevel || level > this._maxLevel) {
      return undefined
    }

    // 行列范围裁剪（如有元数据）
    const range = this._tileRangeForLevel(level)
    if (range) {
      if (x < range.xMin || x > range.xMax || y < range.yMin || y > range.yMax) {
        return undefined
      }
    }

    return super.requestTileGeometry(x, y, level, request)
  }

  /**
   * 重写getTileDataAvailable：用于让调度器提前知道哪些瓦片可用
   */
  getTileDataAvailable(x, y, level) {
    if (this._minLevel === null) {
      return false
    }
    if (!(level >= this._minLevel && level <= this._maxLevel)) {
      return false
    }
    const range = this._tileRangeForLevel(level)
    if (range) {
      return x >= range.xMin && x <= range.xMax && y >= range.yMin && y <= range.yMax
    }
    return true
  }
}

/**
 * 加载智能ArcGIS地形服务（自动读取元数据，按范围裁剪）
 * @param {Cesium.Viewer} viewer
 * @param {string} serviceUrl ArcGIS ImageServer服务地址
 * @param {Object} options 配置选项
 * @returns {Promise<boolean>} 是否加载成功
 */
export async function loadSmartArcGisTerrain(viewer, serviceUrl, options = {}) {
  if (!viewer) return false
  try {
    console.log(`[TerrainLoader] 尝试加载智能ArcGIS地形服务: ${serviceUrl}`)
    console.log(`[TerrainLoader] 坐标系统: Web Mercator (EPSG:3857) - Cesium支持`)

    // 创建智能地形提供器
    const terrainProvider = new SmartArcGISTerrainProvider({
      url: serviceUrl,
      requestVertexNormals: options.requestVertexNormals ?? true,
      requestWaterMask: options.requestWaterMask ?? false
    })

    // 等待等级检测完成
    await terrainProvider._detectLevels()

    // 等待提供器准备就绪
    await terrainProvider.readyPromise

    viewer.terrainProvider = terrainProvider
    console.log(`[TerrainLoader] ✅ 智能ArcGIS地形服务加载成功: ${serviceUrl}`)
    return true
  } catch (error) {
    console.warn(`[TerrainLoader] 智能ArcGIS地形服务加载失败: ${serviceUrl}`, error)
    return false
  }
}

/**
 * 加载ArcGIS地形服务（使用ArcGISTiledElevationTerrainProvider）
 * @param {Cesium.Viewer} viewer
 * @param {string} serviceUrl ArcGIS ImageServer服务地址
 * @param {Object} options 配置选项
 * @returns {Promise<boolean>} 是否加载成功
 */
export async function loadArcGisTerrain(viewer, serviceUrl, options = {}) {
  if (!viewer) return false
  try {
    console.log(`[TerrainLoader] 尝试加载ArcGIS地形服务: ${serviceUrl}`)
    console.log(`[TerrainLoader] 坐标系统: Web Mercator (EPSG:3857) - Cesium支持`)

    const terrainProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(serviceUrl, {
      requestVertexNormals: options.requestVertexNormals ?? true,
      requestWaterMask: options.requestWaterMask ?? false
    })

    await terrainProvider.readyPromise
    viewer.terrainProvider = terrainProvider
    console.log(`[TerrainLoader] ✅ ArcGIS地形服务加载成功: ${serviceUrl}`)
    return true
  } catch (error) {
    console.warn(`[TerrainLoader] ArcGIS地形服务加载失败: ${serviceUrl}`, error)
    return false
  }
}

/**
 * 关闭地形（恢复椭球）
 * @param {Cesium.Viewer} viewer
 */
export function disableTerrain(viewer) {
  if (!viewer) return
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
  console.log("[TerrainLoader] ⛔ 已关闭地形（使用椭球）")
}

/**
 * 加载默认地形（优先智能ArcGIS地形服务）
 * @param {Cesium.Viewer} viewer
 * @param {Object} config
 * @param {string} config.arcGisUrl ArcGIS服务地址
 * @returns {Promise<'arcgis' | 'none'>} 实际加载结果
 */
export async function loadDefaultTerrain(viewer, { arcGisUrl = "https://data3d.hrbmap.org.cn/server/rest/services/DEM/dem_web/ImageServer" } = {}) {
  if (!viewer) return "none"

  // 优先尝试智能ArcGIS地形服务
  const smartOk = await loadSmartArcGisTerrain(viewer, arcGisUrl)
  if (smartOk) return "arcgis"

  // 若失败，尝试普通ArcGIS地形服务
  const normalOk = await loadArcGisTerrain(viewer, arcGisUrl)
  if (normalOk) return "arcgis"

  // 回退椭球
  disableTerrain(viewer)
  return "none"
}

export default {
  loadArcGisTerrain,
  loadSmartArcGisTerrain,
  disableTerrain,
  loadDefaultTerrain
}