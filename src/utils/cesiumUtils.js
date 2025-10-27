import * as Cesium from 'cesium';

/**
 * Cesium工具函数集合
 */
export class CesiumUtils {
  /**
   * 创建优化的Viewer配置
   * @param {Object} options - 配置选项
   * @returns {Object} Viewer配置对象
   */
  static createOptimizedViewerOptions(options = {}) {
    const defaultOptions = {
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
      // 移除地形设置，避免网络请求
      // terrain: Cesium.Terrain.fromWorldTerrain(),
      creditContainer: document.createElement('div')
    };

    return { ...defaultOptions, ...options };
  }

  /**
   * 优化场景设置以提高性能
   * @param {Cesium.Viewer} viewer - Cesium Viewer实例
   */
  static optimizeSceneSettings(viewer) {
    const scene = viewer.scene;
    
    // 关闭不必要的效果
    scene.highDynamicRange = false;
    scene.logarithmicDepthBuffer = false;
    scene.fog.enabled = false;
    scene.skyAtmosphere.show = false;
    scene.sun.show = false;
    scene.moon.show = false;
    
    // 优化地形设置
    scene.globe.maximumScreenSpaceError = 4.0;
    scene.globe.tileCacheSize = 1000;
    
    // 禁用双击飞行
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    
    viewer.clock.shouldAnimate = false;
  }

  /**
   * 飞行到指定位置
   * @param {Cesium.Viewer} viewer - Cesium Viewer实例
   * @param {number} longitude - 经度
   * @param {number} latitude - 纬度
   * @param {number} height - 高度
   * @param {number} duration - 飞行时间（秒）
   */
  static flyToPosition(viewer, longitude, latitude, height, duration = 2.0) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-75),
        roll: 0
      },
      duration: duration
    });
  }

  /**
   * 创建建筑实体
   * @param {Object} buildingData - 建筑数据
   * @returns {Object} 实体配置对象
   */
  static createBuildingEntity(buildingData) {
    const { longitude, latitude, height, name, color = '#4A90E2', alpha = 0.7 } = buildingData;
    
    return {
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
      name: name,
      description: `哈尔滨${name}，高度${height}米`,
      box: {
        dimensions: new Cesium.Cartesian3(40, 40, height),
        material: Cesium.Color.fromCssColorString(color).withAlpha(alpha),
        outline: false,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    };
  }

  /**
   * 创建区域多边形实体
   * @param {Object} districtData - 区域数据
   * @returns {Object} 实体配置对象
   */
  static createDistrictEntity(districtData) {
    const { positions, name, color, properties } = districtData;
    
    return {
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
        material: Cesium.Color.fromCssColorString(color).withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        height: 0,
        extrudedHeight: 0
      },
      label: {
        text: name,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      description: new Cesium.ConstantProperty(
        `<table class="cesium-infoBox-defaultTable">
          <tr><th>区域名称</th><td>${name}</td></tr>
          <tr><th>英文名</th><td>${properties.name_en}</td></tr>
          <tr><th>人口</th><td>${properties.population.toLocaleString()}人</td></tr>
          <tr><th>面积</th><td>${properties.area}平方公里</td></tr>
        </table>`
      )
    };
  }

  /**
   * 批量添加实体以提高性能
   * @param {Cesium.Viewer} viewer - Cesium Viewer实例
   * @param {Array} entities - 实体数组
   * @returns {Array} 添加的实体数组
   */
  static batchAddEntities(viewer, entities) {
    const addedEntities = [];
    
    entities.forEach(entityData => {
      const entity = viewer.entities.add(entityData);
      addedEntities.push(entity);
    });
    
    return addedEntities;
  }

  /**
   * 批量移除实体
   * @param {Cesium.Viewer} viewer - Cesium Viewer实例
   * @param {Array} entities - 实体数组
   */
  static batchRemoveEntities(viewer, entities) {
    entities.forEach(entity => {
      viewer.entities.remove(entity);
    });
  }

  /**
   * 获取性能指标
   * @param {Cesium.Viewer} viewer - Cesium Viewer实例
   * @returns {Object} 性能指标对象
   */
  static getPerformanceMetrics(viewer) {
    const scene = viewer.scene;
    
    return {
      fps: scene.debugShowFramesPerSecond || 0,
      memoryUsage: scene.debugShowMemoryUsage || 0,
      drawCalls: scene.debugShowRenderLoopPurple || 0,
      triangles: scene.debugShowRenderLoopPurple || 0,
      frameTime: scene.debugShowRenderLoopPurple || 0
    };
  }

  /**
   * 检查WebGL支持
   * @returns {boolean} 是否支持WebGL
   */
  static checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  /**
   * 格式化坐标
   * @param {number} longitude - 经度
   * @param {number} latitude - 纬度
   * @returns {string} 格式化后的坐标字符串
   */
  static formatCoordinates(longitude, latitude) {
    const formatCoordinate = (coord, isLongitude) => {
      const direction = isLongitude ? (coord >= 0 ? 'E' : 'W') : (coord >= 0 ? 'N' : 'S');
      const absCoord = Math.abs(coord);
      const degrees = Math.floor(absCoord);
      const minutes = Math.floor((absCoord - degrees) * 60);
      const seconds = ((absCoord - degrees - minutes / 60) * 3600).toFixed(2);
      
      return `${degrees}°${minutes}'${seconds}"${direction}`;
    };

    return `${formatCoordinate(longitude, true)} ${formatCoordinate(latitude, false)}`;
  }

  /**
   * 计算两点间距离
   * @param {number} lon1 - 第一个点的经度
   * @param {number} lat1 - 第一个点的纬度
   * @param {number} lon2 - 第二个点的经度
   * @param {number} lat2 - 第二个点的纬度
   * @returns {number} 距离（米）
   */
  static calculateDistance(lon1, lat1, lon2, lat2) {
    const R = 6371000; // 地球半径（米）
    const dLat = Cesium.Math.toRadians(lat2 - lat1);
    const dLon = Cesium.Math.toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(Cesium.Math.toRadians(lat1)) * Math.cos(Cesium.Math.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export default CesiumUtils; 