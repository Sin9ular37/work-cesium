import { ref } from 'vue';
import { APP_CONFIG } from '../config/appConfig';

const DEFAULT_ARCGIS_URL =
  APP_CONFIG.basemap?.defaultArcGisUrl ??
  'https://data.hrbmap.org.cn/server/rest/services/Image/RS2024_4530/MapServer';

export function useBasemapControl({
  Cesium,
  getViewer,
  logger = () => {}
}) {
  const isArcGisBasemap = ref(false);

  const ensureViewer = () => {
    try {
      return getViewer?.() || null;
    } catch (error) {
      logger('[useBasemapControl] 获取 viewer 失败', error);
      return null;
    }
  };

  const clearImageryLayers = (viewer) => {
    if (!viewer) return;
    try {
      viewer.imageryLayers.removeAll();
    } catch (error) {
      logger('[useBasemapControl] 清空影像层失败', error);
    }
  };

  const addArcGisBasemap = async (url = DEFAULT_ARCGIS_URL) => {
    const viewer = ensureViewer();
    if (!viewer) return false;

    clearImageryLayers(viewer);

    try {
      const provider4326 = await Cesium.ArcGisMapServerImageryProvider.fromUrl(url, {
        enablePickFeatures: false,
        usePreCachedTilesIfAvailable: false,
        tilingScheme: new Cesium.GeographicTilingScheme()
      });
      viewer.imageryLayers.addImageryProvider(provider4326);
      isArcGisBasemap.value = true;
      logger('✅ ArcGIS 底图已加载（4326 动态导出）');
      return true;
    } catch (error) {
      logger('[useBasemapControl] 4326 动态导出失败，尝试 3857', error);
    }

    try {
      const provider3857 = await Cesium.ArcGisMapServerImageryProvider.fromUrl(url, {
        enablePickFeatures: false,
        usePreCachedTilesIfAvailable: false,
        tilingScheme: new Cesium.WebMercatorTilingScheme()
      });
      viewer.imageryLayers.addImageryProvider(provider3857);
      isArcGisBasemap.value = true;
      logger('✅ ArcGIS 底图已加载（3857 动态导出）');
      return true;
    } catch (error) {
      logger('[useBasemapControl] 3857 动态导出失败', error);
    }

    isArcGisBasemap.value = false;
    logger('⚠️ ArcGIS 底图加载失败');
    return false;
  };

  const toggleArcGisBasemap = async (url = DEFAULT_ARCGIS_URL) => {
    const viewer = ensureViewer();
    if (!viewer) return false;

    if (isArcGisBasemap.value) {
      clearImageryLayers(viewer);
      isArcGisBasemap.value = false;
      logger('已关闭 ArcGIS 底图');
      return false;
    }

    return addArcGisBasemap(url);
  };

  const showPrimaryImagery = () => {
    const viewer = ensureViewer();
    if (!viewer || viewer.imageryLayers.length === 0) return;
    try {
      viewer.imageryLayers.get(0).show = true;
    } catch (error) {
      logger('[useBasemapControl] 显示底图失败', error);
    }
  };

  const hidePrimaryImagery = () => {
    const viewer = ensureViewer();
    if (!viewer || viewer.imageryLayers.length === 0) return;
    try {
      viewer.imageryLayers.get(0).show = false;
    } catch (error) {
      logger('[useBasemapControl] 隐藏底图失败', error);
    }
  };

  return {
    isArcGisBasemap,
    addArcGisBasemap,
    toggleArcGisBasemap,
    showPrimaryImagery,
    hidePrimaryImagery
  };
}

export default { useBasemapControl };
