import * as Cesium from "cesium"

/**
 * 基于 ArcGIS ImageServer exportImage(format=lerc) 的实验性地形提供器
 * - 仅做测试验证：服务是否能以 exportImage 方式返回 LERC 高程
 * - 低耦合、易删除
 */
export default class ExportImageTerrainProvider extends Cesium.TerrainProvider {
  constructor(options) {
    super()
    if (!options?.url) throw new Error('ExportImageTerrainProvider: 需要提供 url')
    this._url = options.url.replace(/\/$/, '')
    this._tilingScheme = new Cesium.WebMercatorTilingScheme()
    this._ready = false
    this._readyPromise = this._init()
    this._meta = null
    this._tileInfo = null
    this._lods = null
    this._origin = null
    this._fullExtent = null
    this._tileSize = 256
    this._minLevel = 0
    this._maxLevel = 23
  }

  async _init() {
    const metaUrl = `${this._url}/?f=pjson`
    const resp = await fetch(metaUrl)
    if (!resp.ok) throw new Error(`获取元数据失败: ${resp.status}`)
    const meta = await resp.json()
    this._meta = meta
    this._tileInfo = meta?.tileInfo || null
    this._lods = Array.isArray(this._tileInfo?.lods) ? this._tileInfo.lods : null
    this._origin = this._tileInfo?.origin || { x: -20037508.342787, y: 20037508.342787 }
    this._tileSize = Number.isFinite(this._tileInfo?.rows) ? this._tileInfo.rows : 256
    this._fullExtent = meta?.fullExtent || meta?.extent || meta?.initialExtent || null

    // 级别范围
    const minLOD = Number.isFinite(meta?.minLOD) ? meta.minLOD : undefined
    const maxLOD = Number.isFinite(meta?.maxLOD) ? meta.maxLOD : undefined
    if (Number.isFinite(minLOD) && Number.isFinite(maxLOD) && maxLOD >= minLOD) {
      this._minLevel = minLOD
      this._maxLevel = maxLOD
    } else if (this._lods && this._lods.length > 0) {
      const levels = this._lods.map(l => l.level).filter(n => Number.isFinite(n))
      this._minLevel = Math.min(...levels)
      this._maxLevel = Math.max(...levels)
    }

    this._ready = true
    return true
  }

  get ready() { return this._ready }
  get readyPromise() { return this._readyPromise }
  get tilingScheme() { return this._tilingScheme }
  get errorEvent() { return new Cesium.Event() }
  get credit() { return undefined }
  get hasWaterMask() { return false }
  get hasVertexNormals() { return false }

  getLevelMaximumGeometricError(level) {
    // 沿用 Cesium 估算
    const heightmapWidth = this._tileSize
    return Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(this._tilingScheme.ellipsoid, heightmapWidth, level)
  }

  _resolutionAtLevel(level) {
    if (!this._lods) return undefined
    const rec = this._lods.find(l => l.level === level) || this._lods[level]
    return rec?.resolution
  }

  _bboxMetersForTile(x, y, level) {
    const res = this._resolutionAtLevel(level)
    if (!Number.isFinite(res)) return null
    const span = res * this._tileSize
    const originX = this._origin.x
    const originY = this._origin.y
    const xmin = originX + x * span
    const xmax = originX + (x + 1) * span
    const ymax = originY - y * span
    const ymin = originY - (y + 1) * span
    return { xmin, ymin, xmax, ymax }
  }

  _inFullExtent(x, y, level) {
    if (!this._fullExtent) return true
    const bbox = this._bboxMetersForTile(x, y, level)
    if (!bbox) return false
    // 简单相交判断
    return !(bbox.xmax < this._fullExtent.xmin || bbox.xmin > this._fullExtent.xmax || bbox.ymax < this._fullExtent.ymin || bbox.ymin > this._fullExtent.ymax)
  }

  async requestTileGeometry(x, y, level, request) {
    if (!this._ready) {
      await this._readyPromise
    }

    if (level < this._minLevel || level > this._maxLevel) return undefined
    if (!this._inFullExtent(x, y, level)) return undefined

    const bbox = this._bboxMetersForTile(x, y, level)
    if (!bbox) return undefined

    const qs = new URLSearchParams({
      bbox: `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}`,
      bboxSR: '3857',
      imageSR: '3857',
      size: `${this._tileSize},${this._tileSize}`,
      format: 'lerc',
      lercVersion: '2',
      f: 'image'
    })
    const url = `${this._url}/exportImage?${qs.toString()}`

    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`exportImage 失败: ${resp.status}`)
    const arrayBuf = await resp.arrayBuffer()

    // 延迟加载 lerc 解码器
    const { default: Lerc } = await import('lerc')
    const decoded = Lerc.decode(arrayBuf)
    const { width, height, pixels } = decoded || {}
    const data = pixels && pixels[0] ? pixels[0] : null
    if (!data || !width || !height) throw new Error('LERC 解码失败')

    // data 为 Float32Array（单位米）
    const options = {
      buffer: data,
      width,
      height,
      structure: {
        heightScale: 1.0,
        heightOffset: 0.0,
        elementsPerHeight: 1,
        stride: 1,
        littleEndian: true
      }
    }
    return new Cesium.HeightmapTerrainData(options)
  }

  getTileDataAvailable(x, y, level) {
    if (!this._ready) return false
    if (!(level >= this._minLevel && level <= this._maxLevel)) return false
    return this._inFullExtent(x, y, level)
  }
} 