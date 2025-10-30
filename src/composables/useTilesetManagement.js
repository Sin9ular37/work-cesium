import { ref } from 'vue';
import { APP_CONFIG, cloneConfigSection } from '../config/appConfig';

const clippingConfig = cloneConfigSection(APP_CONFIG.tileset?.clipping || {});

export function useTilesetManagement({
  Cesium,
  getViewer,
  createTilesetLoader,
  installRegionalClipping,
  tilesetAllowed,
  logger = () => {}
}) {
  const tilesetRef = ref(null);
  const loaderRef = ref(null);
  let clippingDisposer = null;

  const ensureViewer = () => {
    try {
      return getViewer?.() || null;
    } catch (error) {
      logger('[useTilesetManagement] 获取 viewer 失败', error);
      return null;
    }
  };

  const ensureLoader = () => {
    if (loaderRef.value) return loaderRef.value;
    const viewer = ensureViewer();
    if (!viewer) return null;
    try {
      loaderRef.value = createTilesetLoader?.(viewer) || null;
    } catch (error) {
      logger('[useTilesetManagement] 创建 tilesetLoader 失败', error);
      loaderRef.value = null;
    }
    return loaderRef.value;
  };

  const installClipping = (viewer, tileset) => {
    if (!installRegionalClipping) return;
    try {
      const options = {
        enabled: clippingConfig.enabled ?? true,
        debugEdges: clippingConfig.debugEdges ?? false,
        altitudeMargin: clippingConfig.altitudeMargin,
        minHeight: clippingConfig.minHeight,
        maxHeightCap: clippingConfig.maxHeightCap,
        idleDebounceMs: clippingConfig.idleDebounceMs,
        moveThrottleMs: clippingConfig.moveThrottleMs,
        halfSizeRules: cloneConfigSection(clippingConfig.halfSizeRules || [])
      };
      clippingDisposer = installRegionalClipping(viewer, tileset, options) || null;
    } catch (error) {
      clippingDisposer = null;
      logger('[useTilesetManagement] 安装区域裁剪失败', error);
    }
  };

  const removeClipping = () => {
    if (!clippingDisposer) return;
    try {
      clippingDisposer();
    } catch (error) {
      logger('[useTilesetManagement] 移除区域裁剪失败', error);
    } finally {
      clippingDisposer = null;
    }
  };

  const preloadBuildings = async (options = {}) => {
    if (tilesetAllowed?.value === false) {
      logger('[useTilesetManagement] tilesetAllowed=false，跳过预加载');
      return tilesetRef.value;
    }
    if (tilesetRef.value) return tilesetRef.value;

    const viewer = ensureViewer();
    const loader = ensureLoader();
    if (!viewer || !loader) return null;

    try {
      const tileset = await loader.load('buildings', {
        show: false,
        heightOffset: 0,
        debug: false,
        ...options
      });
      if (!tileset) return null;

      tilesetRef.value = tileset;
      removeClipping();
      installClipping(viewer, tileset);
      return tileset;
    } catch (error) {
      logger('[useTilesetManagement] 预加载 3D Tiles 失败', error);
      return null;
    }
  };

  const showTileset = async () => {
    if (tilesetAllowed?.value === false) return false;
    const viewer = ensureViewer();
    if (!viewer) return false;

    const tileset = await preloadBuildings();
    if (!tileset) return false;

    tileset.show = true;
    viewer.scene?.requestRender?.();
    return true;
  };

  const hideTileset = () => {
    if (tilesetRef.value) {
      tilesetRef.value.show = false;
    }
  };

  const toggleTileset = async (explicit) => {
    if (typeof explicit === 'boolean') {
      return explicit ? showTileset() : (hideTileset(), false);
    }
    if (!tilesetRef.value || tilesetAllowed?.value === false) {
      return showTileset();
    }
    const visible = !!tilesetRef.value.show;
    if (visible) {
      hideTileset();
      return false;
    }
    return showTileset();
  };

  const destroyTileset = () => {
    const viewer = ensureViewer();
    removeClipping();
    if (tilesetRef.value && viewer) {
      try {
        viewer.scene?.primitives?.remove(tilesetRef.value);
      } catch (error) {
        logger('[useTilesetManagement] 移除 tileset 失败', error);
      }
    }
    if (loaderRef.value?.unload) {
      try {
        loaderRef.value.unload('buildings');
      } catch (_) {}
    }
    tilesetRef.value = null;
  };

  const getTilesetLoader = () => ensureLoader();

  return {
    tileset: tilesetRef,
    preloadBuildings,
    showTileset,
    hideTileset,
    toggleTileset,
    destroyTileset,
    alignTilesetToTerrain: () => Promise.resolve(), // 地形功能已移除，保持接口兼容
    getTileset: () => tilesetRef.value,
    getTilesetLoader,
    removeClipping
  };
}

export default { useTilesetManagement };
