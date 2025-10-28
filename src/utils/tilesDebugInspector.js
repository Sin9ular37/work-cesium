import * as Cesium from "cesium"
import { createLogger } from "./logger"

/**
 * 3DTiles 属性拾取调试器（低耦合，便于删除）
 * 启用后，左键点击3DTiles范围内任意点：
 * - 打印经纬度与高度
 * - 打印命中的3DTiles要素的全部属性
 * - 打印所属Tileset的基本信息
 *
 * 用法：
 *   const disposer = enableTilesPickInspector(viewer)
 *   // 关闭：
 *   disposer && disposer()
 */
export function enableTilesPickInspector(viewer, options = {}) {
  if (!viewer || !viewer.scene) return () => {}

  const scene = viewer.scene
  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
  const highlightCollection = scene.postProcessStages
  let originalColorStage = null
  const scopedLogger =
    options.logger ||
    createLogger("TilesInspector", {
      level: options.level ?? "debug",
      debugEnabled: options.debug ?? true
    })

  const log = (...args) => {
    try {
      if (scopedLogger && typeof scopedLogger.debug === "function") {
        scopedLogger.debug(...args)
      } else if (typeof scopedLogger === "function") {
        scopedLogger(...args)
      }
    } catch {}
  }

  function tryGetCartographic(position) {
    try {
      if (!position) return null
      const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(position)
      if (!carto) return null
      return {
        longitude: Cesium.Math.toDegrees(carto.longitude),
        latitude: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height
      }
    } catch {
      return null
    }
  }

  function tryPickPosition(screenPosition) {
    const support = scene.pickPositionSupported
    if (support) {
      const p = scene.pickPosition(screenPosition)
      if (Cesium.defined(p)) return p
    }
    // 回退：与地球求交
    const ray = viewer.camera.getPickRay(screenPosition)
    if (ray) {
      const p2 = scene.globe.pick(ray, scene)
      if (Cesium.defined(p2)) return p2
    }
    return undefined
  }

  function collectFeatureProperties(feature) {
    const properties = {}
    try {
      if (!feature) return properties
      // 兼容不同Cesium版本的特征对象
      if (typeof feature.getPropertyIds === "function") {
        const ids = feature.getPropertyIds()
        if (Array.isArray(ids)) {
          ids.forEach((id) => {
            try { properties[id] = feature.getProperty(id) } catch {}
          })
        }
      } else if (feature?.properties && typeof feature.properties === "object") {
        // 可能是 ModelFeature 的 properties Proxy
        try {
          Object.keys(feature.properties).forEach((k) => {
            properties[k] = feature.properties[k]
          })
        } catch {}
      }
    } catch {}
    return properties
  }

  handler.setInputAction((movement) => {
    try {
      const picked = scene.pick(movement.position)
      const worldPos = tryPickPosition(movement.position)
      const carto = tryGetCartographic(worldPos)

      log("—— 点击事件 ——")
      if (carto) {
        log("坐标:", {
          longitude: Number(carto.longitude.toFixed(8)),
          latitude: Number(carto.latitude.toFixed(8)),
          height: Number(carto.height?.toFixed?.(3) ?? carto.height)
        })
      } else {
        log("坐标: 未获取")
      }

      if (!picked) {
        log("未命中任何对象")
        return
      }

      // 识别所属 tileset
      const tileset = picked?.tileset || picked?.primitive || picked?.content?.tileset
      const feature = picked?.feature || picked?.id || picked // 兼容不同版本

      if (tileset && tileset instanceof Cesium.Cesium3DTileset) {
        log("Tileset:", {
          url: tileset.url,
          ready: tileset.ready,
          boundingSphereRadius: tileset.boundingSphere?.radius
        })
      }

      // 收集属性
      const props = collectFeatureProperties(feature)
      const propCount = Object.keys(props).length
      if (propCount > 0) {
        log(`要素属性(${propCount})：`, props)
      } else {
        log("要素属性: 无或未暴露")
      }

      // 额外：打印原始 picked 对象（可注释以减少骚扰）
      if (options.verbose) {
        log("picked原始对象:", picked)
      }

    } catch (err) {
      log("拾取处理异常:", err)
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 返回清理函数
  return function dispose() {
    try { handler.destroy() } catch {}
    if (originalColorStage) {
      try { scene.postProcessStages.remove(originalColorStage) } catch {}
      originalColorStage = null
    }
    log("Tiles 属性拾取调试器已关闭")
  }
}

export default {
  enableTilesPickInspector
} 
