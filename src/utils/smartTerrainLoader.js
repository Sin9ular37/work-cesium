// 新增：智能地形加载函数，支持局部地形服务
async function loadSmartTerrain() {
  if (!viewer) return false;
  
  const terrainUrl = "https://data3d.hrbmap.org.cn/server/rest/services/DEM/dem_web/ImageServer";
  
  try {
    console.log("[SmartTerrain] 开始加载地形服务...");
    
    // 首先尝试获取服务信息，确定最小级别
    const infoUrl = terrainUrl + "/info";
    const response = await fetch(infoUrl);
    const serviceInfo = await response.json();
    
    let minLevel = 0;
    let maxLevel = 18;
    
    if (serviceInfo.tileInfo && serviceInfo.tileInfo.lods) {
      const lods = serviceInfo.tileInfo.lods;
      minLevel = lods[0]?.level || 0;
      maxLevel = lods[lods.length - 1]?.level || 18;
      console.log(`[SmartTerrain] 检测到地形服务级别范围: ${minLevel} - ${maxLevel}`);
    }
    
    // 创建自定义地形提供器
    const terrainProvider = new Cesium.ArcGISTiledElevationTerrainProvider({
      url: terrainUrl,
      requestVertexNormals: true,
      requestWaterMask: false
    });
    
    // 重写关键方法以处理局部地形
    const originalRequestTileGeometry = terrainProvider.requestTileGeometry.bind(terrainProvider);
    terrainProvider.requestTileGeometry = async function(x, y, level, request) {
      try {
        // 如果请求的级别小于最小级别，使用最小级别
        if (level < minLevel) {
          console.warn(`[SmartTerrain] 级别 ${level} 小于最小级别 ${minLevel}，使用最小级别`);
          return await originalRequestTileGeometry(x, y, minLevel, request);
        }
        return await originalRequestTileGeometry(x, y, level, request);
      } catch (error) {
        // 如果是404错误且级别大于最小级别，尝试使用最小级别
        if (error.statusCode === 404 && level > minLevel) {
          console.warn(`[SmartTerrain] 级别 ${level} 的瓦片不存在，尝试使用最小级别 ${minLevel}`);
          return await originalRequestTileGeometry(x, y, minLevel, request);
        }
        throw error;
      }
    };
    
    // 重写getTileDataAvailable方法
    const originalGetTileDataAvailable = terrainProvider.getTileDataAvailable.bind(terrainProvider);
    terrainProvider.getTileDataAvailable = function(x, y, level) {
      if (level < minLevel) {
        return false;
      }
      return originalGetTileDataAvailable(x, y, level);
    };
    
    // 重写getLevelMaximumGeometricError方法
    const originalGetLevelMaximumGeometricError = terrainProvider.getLevelMaximumGeometricError.bind(terrainProvider);
    terrainProvider.getLevelMaximumGeometricError = function(level) {
      if (level < minLevel) {
        return Number.MAX_VALUE;
      }
      return originalGetLevelMaximumGeometricError(level);
    };
    
    await terrainProvider.readyPromise;
    viewer.terrainProvider = terrainProvider;
    
    console.log("[SmartTerrain] ✅ 智能地形服务加载成功");
    return true;
    
  } catch (error) {
    console.warn("[SmartTerrain] 智能地形服务加载失败，回退到椭球:", error);
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    return false;
  }
}
