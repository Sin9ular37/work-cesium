import * as Cesium from "cesium"

/**
 * 从 GeoJSON 对象自动生成基于 3D Tiles 高度的标注（低耦合，便于删除）
 * 支持简单的距离控制
 *
 * 用法：
 *  const disposer = autoLabelFromGeojson({ 
 *    viewer, 
 *    dataSource, 
 *    labelCollection,
 *    labelStyle: {
 *      maxVisibleDistance: 10000, // 最大显示距离（米），超出此距离不显示标注
 *      font: '16px Microsoft YaHei',
 *      fillColor: Cesium.Color.WHITE
 *    }
 *  })
 *  // 关闭并清理：
 *  disposer && disposer()
 */
export function autoLabelFromGeojson({ viewer, dataSource, labelStyle = {}, getName, getCartographic, labelCollection, strictName = false, limit, filterEntity }) {
  if (!viewer || !dataSource || !labelCollection) return () => {};

  const created = [];

  // 辅助：从实体提取可用名称
  function getEntityName(entity) {
    try {
      const dateNow = Cesium.JulianDate.now();
      const candidates = [
        entity?.name,
        entity?.properties?.name,
        entity?.properties?.NAME,
        entity?.properties?.Name,
        entity?.properties?.title,
        entity?.properties?.标题,
        entity?.properties?.行政名,
        entity?.properties?.区县名称,
        entity?.properties?.街道名称,
        entity?.properties?.社区名称,
        entity?.properties?.区域名
      ];
      for (const c of candidates) {
        const v = c?.getValue ? c.getValue(dateNow) : c;
        if (v && String(v).trim()) return String(v).trim();
      }
    } catch {}
    return null;
  }

  // 辅助：代表性位置（优先点要素，其次面/线几何首点），返回 Cartographic
  function getEntityRepresentativeCartographic(entity) {
    try {
      const dateNow = Cesium.JulianDate.now();
      // 1) position
      const pos = entity?.position?.getValue ? entity.position.getValue(dateNow) : entity?.position;
      if (pos instanceof Cesium.Cartesian3) {
        return Cesium.Cartographic.fromCartesian(pos);
      }
      // 2) polygon 首点
      const poly = entity?.polygon;
      if (poly && poly.hierarchy) {
        const hier = poly.hierarchy.getValue ? poly.hierarchy.getValue(dateNow) : poly.hierarchy;
        const positions = hier?.positions || hier?.[0] || [];
        if (positions && positions.length > 0) {
          return Cesium.Cartographic.fromCartesian(positions[0]);
        }
      }
      // 3) polyline 中点（简化：取首点）
      const line = entity?.polyline;
      if (line && line.positions) {
        const positions = line.positions.getValue ? line.positions.getValue(dateNow) : line.positions;
        if (positions && positions.length > 0) {
          return Cesium.Cartographic.fromCartesian(positions[Math.floor(positions.length / 2)] || positions[0]);
        }
      }
    } catch {}
    return null;
  }

  function simpleHeight(carto) {
    try {
      const h = viewer.scene.globe.getHeight(carto);
      return Number.isFinite(h) ? h + 2 : 2;
    } catch { return 2; }
  }

  function createOne(entity) {
    let text = null;
    if (getName) {
      try { text = getName(entity); } catch {}
    }
    if (!text) {
      if (strictName) return; // 严格模式：未命名则跳过，避免误取上级名称
      text = getEntityName(entity);
    }
    if (!text) return;

    const carto = (getCartographic && getCartographic(entity)) || getEntityRepresentativeCartographic(entity);
    if (!carto) return;

    const lonDeg = Cesium.Math.toDegrees(carto.longitude);
    const latDeg = Cesium.Math.toDegrees(carto.latitude);
    const pos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, simpleHeight(carto));

    const defaults = {
      font: '16px Microsoft YaHei',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -15),
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale: 1.2,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER
    };

    // 处理 maxVisibleDistance 参数
    const maxVisibleDistance = labelStyle.maxVisibleDistance !== undefined ? labelStyle.maxVisibleDistance : 5000;
    const { maxVisibleDistance: _, ...restLabelStyle } = labelStyle;
    
    const finalStyle = { ...defaults, ...restLabelStyle };
    
    // 如果指定了 maxVisibleDistance，添加距离显示条件
    if (maxVisibleDistance > 0) {
      finalStyle.distanceDisplayCondition = new Cesium.DistanceDisplayCondition(0.0, maxVisibleDistance);
    }
    
    const label = labelCollection.add({ position: pos, text, ...finalStyle });
    created.push(label);
  }

  const entities = dataSource.entities?.values || [];
  let source = entities;
  try {
    if (typeof filterEntity === 'function') {
      source = entities.filter((ent) => {
        try { return !!filterEntity(ent); } catch { return false; }
      });
    }
    if (Number.isFinite(limit) && limit > 0 && source.length > limit) {
      // 稳定抽样：按步长挑选，避免每次不同
      const step = Math.ceil(source.length / limit);
      const sampled = [];
      for (let i = 0; i < source.length && sampled.length < limit; i += step) sampled.push(source[i]);
      source = sampled;
    }
  } catch {}
  for (const e of source) createOne(e);

  return function dispose() {
    try {
      for (const l of created) { try { labelCollection.remove(l); } catch {} }
    } finally {
      created.length = 0;
    }
  };
}

export default { autoLabelFromGeojson } 
