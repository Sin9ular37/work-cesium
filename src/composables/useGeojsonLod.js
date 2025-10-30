import { reactive, ref } from 'vue';
import { autoLabelFromGeojson } from '../utils/autoLabelFromGeojson';
import {
  GRID_LAYER_HEIGHT_OFFSET,
  GRID_LABEL_HEIGHT_OFFSET,
  LOD_HYSTERESIS,
  getLabelLimitForLayer
} from '../config/lodSettings';
import { APP_CONFIG, cloneConfigSection } from '../config/appConfig';

export function useGeojsonLod({
  Cesium,
  getViewer,
  getTilesetLoader,
  getBuildingsTileset,
  tilesetAllowed,
  logger = () => {},
  isCameraMoving = () => false,
  getCurrentViewDistance,
  topicState,
  lodGeojsonEnabled,
  requestSceneRender,
  setupEntityInteraction = () => {}
}) {
  const emitLog = (level, ...args) => {
    try {
      if (logger && typeof logger[level] === 'function') {
        logger[level](...args);
        return;
      }
      if (typeof logger === 'function') {
        if (level === 'warn' || level === 'error') {
          logger(`[${level.toUpperCase()}]`, ...args);
        } else {
          logger(...args);
        }
        return;
      }
      if (logger && typeof logger.log === 'function') {
        logger.log(...args);
      }
    } catch (_) {}
  };

  const logDebug = (...args) => emitLog('debug', ...args);
  const logWarn = (...args) => emitLog('warn', ...args);
  const logError = (...args) => emitLog('error', ...args);

  const geojsonLayerVisible = ref(true);

  const geojsonTemplates = cloneConfigSection(APP_CONFIG.geojson?.layers || {});

  const buildLabelStyle = (style = {}) => {
    const {
      fillColor,
      outlineColor,
      horizontalOrigin,
      verticalOrigin,
      ...rest
    } = style;
    const resolved = { ...rest };
    try {
      if (fillColor) {
        resolved.fillColor = Cesium.Color.fromCssColorString(fillColor);
      }
    } catch (_) {}
    try {
      if (outlineColor) {
        resolved.outlineColor = Cesium.Color.fromCssColorString(outlineColor);
      }
    } catch (_) {}
    if (horizontalOrigin && Cesium.HorizontalOrigin?.[horizontalOrigin]) {
      resolved.horizontalOrigin = Cesium.HorizontalOrigin[horizontalOrigin];
    } else if (!resolved.horizontalOrigin) {
      resolved.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
    }
    if (verticalOrigin && Cesium.VerticalOrigin?.[verticalOrigin]) {
      resolved.verticalOrigin = Cesium.VerticalOrigin[verticalOrigin];
    } else if (!resolved.verticalOrigin) {
      resolved.verticalOrigin = Cesium.VerticalOrigin.CENTER;
    }
    return resolved;
  };

  const geojsonLodLayers = reactive(
    Object.entries(geojsonTemplates).reduce((acc, [key, template]) => {
      acc[key] = {
        name: template.name,
        url: template.url,
        dataSource: null,
        labelDisposer: null,
        min: template.minDistance,
        max: template.maxDistance,
        style: template.style,
        labelStyle: buildLabelStyle(template.labelStyle),
        interactive: template.interactive || {}
      };
      return acc;
    }, {})
  );

  const currentActiveLayer = ref(null);
  const labelCollections = reactive({
    district: null,
    township: null,
    community: null,
    grid: null
  });

  const __labelRefreshBusy = {};

  const searchQuery = ref('');
  const searchResults = reactive({
    district: [],
    township: [],
    community: [],
    grid: []
  });
  const searchFilter = reactive({ district: true, township: true, community: true, grid: true });

  const flyCameraRangeConfig = APP_CONFIG.geojson?.flyCameraRange || {};
  const FLY_CAMERA_RANGE = {
    district: flyCameraRangeConfig.district ?? 50000,
    township: flyCameraRangeConfig.township ?? 25000,
    community: flyCameraRangeConfig.community ?? 15000,
    grid: flyCameraRangeConfig.grid ?? 5000
  };

  const highlightConfig = APP_CONFIG.highlight || {};

  const ensureViewer = () => {
    const viewer = getViewer?.();
    if (!viewer) {
      throw new Error('[useGeojsonLod] viewer 尚未就绪');
    }
    return viewer;
  };

  const getActiveTileset = () => {
    const viewer = getViewer?.();
    if (!viewer) return null;
    const primary = getBuildingsTileset?.();
    if (primary) return primary;
    const loader = getTilesetLoader?.();
    if (loader && typeof loader.get === 'function') {
      const cached = loader.get('buildings');
      if (cached) return cached;
    }
    const primitives = viewer.scene?.primitives?._primitives || [];
    return primitives.find((p) => p instanceof Cesium.Cesium3DTileset) || null;
  };

  const ensureLabelCollection = (layerKey) => {
    const viewer = ensureViewer();
    if (!labelCollections[layerKey]) {
      labelCollections[layerKey] = viewer.scene.primitives.add(new Cesium.LabelCollection());
    }
    return labelCollections[layerKey];
  };

  const refreshLabelCollectionHeights = async (layerKey) => {
    if (isCameraMoving?.()) return;
    const viewer = getViewer?.();
    if (!viewer) return;
    const lc = labelCollections[layerKey];
    if (!lc || typeof lc.length !== 'number' || lc.length === 0) return;
    if (__labelRefreshBusy[layerKey]) return;
    __labelRefreshBusy[layerKey] = true;

    try {
      const scene = viewer.scene;
      const camera = viewer.camera;
      const frustum = camera.frustum;
      const cullingVolume = frustum?.computeCullingVolume
        ? frustum.computeCullingVolume(camera.position, camera.direction, camera.up)
        : null;

      const visibleLabels = [];
      for (let i = 0; i < lc.length; i++) {
        const label = lc.get(i);
        if (!label || !label.position) continue;
        if (!cullingVolume) {
          visibleLabels.push(label);
          continue;
        }
        const sphere = new Cesium.BoundingSphere(label.position, 1.0);
        const visibility = cullingVolume.computeVisibility(sphere);
        if (visibility !== Cesium.Intersect.OUTSIDE) {
          visibleLabels.push(label);
        }
      }
      if (!visibleLabels.length) {
        __labelRefreshBusy[layerKey] = false;
        return;
      }

      const batchSize = 100;
      let index = 0;

      const processBatch = () => {
        const slice = visibleLabels.slice(index, index + batchSize);
        if (!slice.length) {
          __labelRefreshBusy[layerKey] = false;
          return;
        }
        if (layerKey === 'grid') {
          for (let j = 0; j < slice.length; j++) {
            const label = slice[j];
            if (!label || !label.position) continue;
            if (typeof label.isDestroyed === 'function' && label.isDestroyed()) continue;
            const parentCollection = label.collection;
            if (
              !parentCollection ||
              (typeof parentCollection.isDestroyed === 'function' && parentCollection.isDestroyed())
            ) {
              continue;
            }
            const carto = Cesium.Cartographic.fromCartesian(label.position);
            if (!carto) continue;
            try {
              label.position = Cesium.Cartesian3.fromRadians(
                carto.longitude,
                carto.latitude,
                GRID_LABEL_HEIGHT_OFFSET
              );
            } catch (_) {}
          }

          index += batchSize;
          if (index < visibleLabels.length) {
            requestAnimationFrame(processBatch);
          } else {
            __labelRefreshBusy[layerKey] = false;
          }
          return;
        }

        const bases = [];
        for (let j = 0; j < slice.length; j++) {
          const p = slice[j]?.position;
          if (p) bases.push(p);
        }
        if (!bases.length) {
          index += batchSize;
          if (index < visibleLabels.length) {
            requestAnimationFrame(processBatch);
          } else {
            __labelRefreshBusy[layerKey] = false;
          }
          return;
        }

        scene
          .clampToHeightMostDetailed(bases)
          .then((clamped) => {
            const collection = labelCollections[layerKey];
            if (!collection || (typeof collection.isDestroyed === 'function' && collection.isDestroyed())) {
              return;
            }
            if (clamped && clamped.length) {
              for (let k = 0; k < slice.length; k++) {
                const label = slice[k];
                if (!label || !clamped[k]) continue;
                if (typeof label.isDestroyed === 'function' && label.isDestroyed()) continue;
                const parentCollection = label.collection;
                if (
                  !parentCollection ||
                  (typeof parentCollection.isDestroyed === 'function' && parentCollection.isDestroyed())
                ) {
                  continue;
                }
                label.position = clamped[k];
              }
            }
          })
          .finally(() => {
            index += batchSize;
            if (index < visibleLabels.length) {
              requestAnimationFrame(processBatch);
            } else {
              __labelRefreshBusy[layerKey] = false;
            }
          });
      };

      requestAnimationFrame(processBatch);
    } catch (_) {
      __labelRefreshBusy[layerKey] = false;
    }
  };

  const createAutoLabelsForLayer = (layerKey, layer, dataSource) => {
    const viewer = getViewer?.();
    if (!viewer || !dataSource) return null;

    const tileset =
      getBuildingsTileset?.() ||
      getTilesetLoader?.()?.get?.('buildings') ||
      Array.from(viewer.scene.primitives?._primitives || []).find(
        (p) => p instanceof Cesium.Cesium3DTileset
      );

    const currentDistance = getCurrentViewDistance?.() ?? Number.POSITIVE_INFINITY;
    const labelLimit = getLabelLimitForLayer(currentDistance, layerKey, layer.labelLimitRules);

    const disposer = autoLabelFromGeojson({
      viewer,
      tileset,
      dataSource,
      getName: (entity) => resolveEntityNameForLayer(layerKey, entity),
      labelStyle: layer.labelStyle,
      getCartographic: (entity) => resolveEntityCartographic(Cesium, entity),
      getHeight: (cartographic) => resolveLabelHeight(Cesium, viewer, layer.name, cartographic),
      labelCollection: ensureLabelCollection(layerKey),
      strictName: true,
      limit: labelLimit,
      filterEntity: (entity) => {
        try {
          const scene = viewer.scene;
          const ellipsoid = scene?.globe?.ellipsoid || Cesium.Ellipsoid.WGS84;
          const rect = viewer.camera.computeViewRectangle(ellipsoid);
          if (!rect) return true;
          const carto = resolveEntityCartographic(Cesium, entity);
          if (!carto) return false;
          return (
            carto.longitude >= rect.west &&
            carto.longitude <= rect.east &&
            carto.latitude >= rect.south &&
            carto.latitude <= rect.north
          );
        } catch (_) {
          return true;
        }
      }
    });

    requestAnimationFrame(() => {
      try { refreshLabelCollectionHeights(layerKey); } catch (_) {}
    });
    setTimeout(() => {
      try { refreshLabelCollectionHeights(layerKey); } catch (_) {}
    }, 450);

    return disposer;
  };

  const updateLabelHeightsForLayer = (layerKey) => {
    const layer = geojsonLodLayers[layerKey];
    if (!layer || !layer.dataSource) return;
    const tileset = getActiveTileset();
    if (!tileset || !tileset.show) return;

    if (layer.labelDisposer) {
      try { layer.labelDisposer(); } catch {}
      layer.labelDisposer = null;
    }

    layer.labelDisposer = createAutoLabelsForLayer(layerKey, layer, layer.dataSource);
  };

  const applyTilesetByLayer = (layerKey) => {
    const tileset = getActiveTileset();
    if (!tileset) return;

    switch (layerKey) {
      case 'district':
        tileset.show = false;
        tileset.maximumScreenSpaceError = 8;
        break;
      case 'township':
        tileset.show = false;
        tileset.maximumScreenSpaceError = 6;
        break;
      case 'community':
        tileset.show = false;
        tileset.maximumScreenSpaceError = 2.5;
        break;
      case 'grid':
        tileset.show = !!tilesetAllowed.value;
        tileset.maximumScreenSpaceError = 2.5;
        break;
      default:
        tileset.show = false;
        tileset.maximumScreenSpaceError = 6;
    }

    if (tileset.show && currentActiveLayer.value) {
      setTimeout(() => {
        updateLabelHeightsForLayer(currentActiveLayer.value);
      }, 300);
    }
  };

  const pickLayerWithHysteresis = (distance) => {
    const keys = Object.keys(geojsonLodLayers);
    let target = null;
    for (const k of keys) {
      const l = geojsonLodLayers[k];
      if (distance >= l.min && distance < l.max) {
        target = k;
        break;
      }
    }
    if (target == null) return currentActiveLayer.value;
    if (target === currentActiveLayer.value) return target;

    const layer = geojsonLodLayers[target];
    const tightMin = layer.min + (Number.isFinite(LOD_HYSTERESIS) ? LOD_HYSTERESIS : 0);
    const tightMax = layer.max - (Number.isFinite(LOD_HYSTERESIS) ? LOD_HYSTERESIS : 0);
    if (distance >= tightMin && distance < tightMax) return target;
    return currentActiveLayer.value;
  };

  const ensureGeojsonLayer = async (layerKey) => {
    const viewer = getViewer?.();
    if (!viewer) return null;
    const layer = geojsonLodLayers[layerKey];
    if (!layer) return null;

    if (!layer.dataSource) {
      try {
        const ds = await Cesium.GeoJsonDataSource.load(layer.url, {
          clampToGround: true,
          stroke: Cesium.Color.fromCssColorString(layer.style.outline),
          strokeWidth: layer.style.outlineWidth,
          fill: Cesium.Color.fromCssColorString(layer.style.fill).withAlpha(layer.style.fillAlpha)
        });

        ds.entities.values.forEach((entity) => {
          if (entity.polygon) {
            entity.polygon.material = Cesium.Color.fromCssColorString(layer.style.fill).withAlpha(
              layer.style.fillAlpha
            );
            entity.polygon.outline = true;
            entity.polygon.outlineColor = Cesium.Color.fromCssColorString(layer.style.outline);
            entity.polygon.outlineWidth = layer.style.outlineWidth;
            entity.polygon.height = 0;
            entity.polygon.extrudedHeight = 0;
            entity.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
            entity.polygon.classificationType = Cesium.ClassificationType.TERRAIN;
          }
          try {
            setupEntityInteraction?.(entity, layerKey, Cesium);
          } catch (interactionError) {
            logWarn('[useGeojsonLod] 实体交互初始化失败', interactionError);
          }
        });

        if (layer.name === '网格') {
          try {
            ds.entities.values.forEach((entity) => {
              if (entity.polygon) {
                entity.polygon.heightReference = Cesium.HeightReference.NONE;
                entity.polygon.classificationType = Cesium.ClassificationType.BOTH;
                entity.polygon.perPositionHeight = false;
                entity.polygon.height = GRID_LAYER_HEIGHT_OFFSET;
                entity.polygon.extrudedHeight = undefined;
              }
            });
          } catch (_) {}
        }

        await viewer.dataSources.add(ds);
        ds.show = false;
        layer.dataSource = ds;
        logger(`✅ LOD图层已加载: ${layer.name} (${layer.url})`);
      } catch (e) {
        logWarn(`❌ LOD图层加载失败: ${layer?.name} (${layer?.url})`, e);
        return null;
      }
    }

    return layer.dataSource;
  };

  const updateGeojsonLOD = async () => {
    const viewer = getViewer?.();
    if (!viewer) return;
    if (!lodGeojsonEnabled?.value) return;

    const keys = Object.keys(geojsonLodLayers);
    if (!geojsonLayerVisible.value) {
      for (const k of keys) {
        const ds = geojsonLodLayers[k]?.dataSource;
        if (ds) ds.show = false;
      }
      return;
    }

    if (isUpdatingLOD) return;
    isUpdatingLOD = true;

    try {
      const distance = getCurrentViewDistance?.();
      if (!Number.isFinite(distance)) return;

      let shouldShowLayer = pickLayerWithHysteresis(distance);
      if (shouldShowLayer && topicState?.lod?.[shouldShowLayer] === false) {
        shouldShowLayer = null;
      }
      if (shouldShowLayer === currentActiveLayer.value) return;

      for (const k of keys) {
        const layer = geojsonLodLayers[k];
        const ds = layer?.dataSource;
        if (ds) ds.show = false;

        if (k !== shouldShowLayer) {
          if (layer?.labelDisposer) {
            try { layer.labelDisposer(); } catch {}
            layer.labelDisposer = null;
          }
          if (labelCollections[k]) labelCollections[k].show = false;
        }
      }

      if (shouldShowLayer) {
        const layer = geojsonLodLayers[shouldShowLayer];
        const ds = await ensureGeojsonLayer(shouldShowLayer);
        if (ds) ds.show = topicState?.layerVisible?.[shouldShowLayer] !== false;

        const wantLabels = !!topicState?.labels?.[shouldShowLayer];
        const lc = ensureLabelCollection(shouldShowLayer);
        lc.show = wantLabels;

        if (wantLabels && !layer.labelDisposer) {
          setTimeout(() => {
            if (!!topicState?.labels?.[shouldShowLayer] && !layer.labelDisposer) {
              layer.labelDisposer = createAutoLabelsForLayer(shouldShowLayer, layer, ds);
            }
          }, 100);
        } else if (!wantLabels && layer.labelDisposer) {
          try { layer.labelDisposer(); } catch {}
          layer.labelDisposer = null;
        }

        applyTilesetByLayer(shouldShowLayer);
      } else {
        applyTilesetByLayer(null);
      }

      currentActiveLayer.value = shouldShowLayer;
    } catch (e) {
      logError('更新GeoJSON LOD失败:', e);
    } finally {
      isUpdatingLOD = false;
    }
  };

  const toggleGeojsonLayer = async () => {
    try {
      geojsonLayerVisible.value = !geojsonLayerVisible.value;
      const keys = Object.keys(geojsonLodLayers);

      if (!geojsonLayerVisible.value) {
        for (const k of keys) {
          try {
            const ds = geojsonLodLayers[k]?.dataSource;
            if (ds) ds.show = false;
            if (labelCollections[k]) labelCollections[k].show = false;
          } catch (_) {}
        }
        requestSceneRender?.();
        return;
      }

      for (const k of keys) {
        if (topicState?.lod?.[k] !== false) {
          try { await ensureGeojsonLayer(k); } catch (_) {}
        }
      }
      try { updateGeojsonLOD(); } catch (_) {}
      requestSceneRender?.();
    } catch (e) {
      logWarn('toggleGeojsonLayer error:', e);
    }
  };

  const unloadGeojsonLayer = (layerKey) => {
    const layer = geojsonLodLayers[layerKey];
    const viewer = getViewer?.();
    if (!layer || !viewer) return;
    try {
      if (layer.labelDisposer) {
        try { layer.labelDisposer(); } catch {}
        layer.labelDisposer = null;
      }
      if (labelCollections[layerKey]) {
        try { viewer.scene.primitives.remove(labelCollections[layerKey]); } catch {}
        labelCollections[layerKey] = null;
      }
      if (layer.dataSource) {
        viewer.dataSources.remove(layer.dataSource, true);
        layer.dataSource = null;
      }
    } catch (_) {}
  };

  const toggleLayerVisible = (key) => {
    if (!topicState.layerVisible.hasOwnProperty(key)) return;
    topicState.layerVisible[key] = !topicState.layerVisible[key];
    try {
      const ds = geojsonLodLayers[key]?.dataSource;
      if (ds) ds.show = topicState.layerVisible[key] && (topicState?.lod?.[key] !== false);
    } catch (_) {}
    requestSceneRender?.();
  };

  const toggleLabel = (key) => {
    if (!topicState.labels.hasOwnProperty(key)) return;
    topicState.labels[key] = !topicState.labels[key];
    if (labelCollections[key]) {
      labelCollections[key].show = topicState.labels[key];
    }
    requestSceneRender?.();
  };

  const toggleLod = (key) => {
    if (!topicState.lod.hasOwnProperty(key)) return;
    topicState.lod[key] = !topicState.lod[key];
    const layer = geojsonLodLayers[key];
    if (layer?.dataSource) {
      try { layer.dataSource.show = topicState.lod[key]; } catch (_) {}
    }
    if (topicState.lod[key] === false) {
      unloadGeojsonLayer(key);
    }
    try { updateGeojsonLOD(); } catch (_) {}
    requestSceneRender?.();
  };

  const debugLabelStatus = () => {
    const keys = Object.keys(geojsonLodLayers);
    logDebug('🔍 状态：active=', currentActiveLayer.value);
    for (const k of keys) {
      const ds = geojsonLodLayers[k].dataSource;
      const shown = ds?.show ? 'show' : 'hide';
      const len = labelCollections[k]?.length || 0;
      logDebug(`  ${k}: ds=${shown}, labels=${len}`);
    }
  };

  const searchInGeojsonLayers = async (query) => {
    const q = String(query || '').trim().toLowerCase();
    searchResults.district = [];
    searchResults.township = [];
    searchResults.community = [];
    searchResults.grid = [];
    if (!q) return searchResults;

    const index = await buildSearchIndex();
    searchResults.township = index.township.filter((it) => it.name.toLowerCase().includes(q));
    searchResults.community = index.community.filter((it) => it.name.toLowerCase().includes(q));
    searchResults.grid = index.grid.filter((it) => it.name.toLowerCase().includes(q));
    logger(`[搜索] 关键词="${q}": 乡镇=${searchResults.township.length}, 社区=${searchResults.community.length}, 网格=${searchResults.grid.length}`);
    return searchResults;
  };

  const buildSearchIndex = async () => {
    const viewer = getViewer?.();
    if (!viewer) return { district: [], township: [], community: [], grid: [] };
    const index = { district: [], township: [], community: [], grid: [] };
    const layerKeys = ['township', 'community', 'grid'];
    for (const key of layerKeys) {
      const ds = await ensureGeojsonLayer(key);
      if (!ds) continue;
      const items = ds.entities?.values || [];
      for (const e of items) {
        const name = resolveEntityNameForLayer(key, e);
        if (name) index[key].push({ entity: e, name, layerKey: key });
      }
    }
    return index;
  };

  const highlightEntity = (entity, options = {}) => {
    const viewer = getViewer?.();
    if (!entity || !viewer) return;
    const durationMs = options.durationMs ?? highlightConfig.durationMs ?? 3000;
    const intervalMs = options.intervalMs ?? highlightConfig.intervalMs ?? 500;
    const now = Cesium.JulianDate.now();

    const layerKey = options.layerKey;
    const targetRange = FLY_CAMERA_RANGE[layerKey] ?? 1200;

    let flew = false;
    try {
      if (entity.polygon) {
        const hierarchy = entity.polygon.hierarchy?.getValue
          ? entity.polygon.hierarchy.getValue(now)
          : entity.polygon.hierarchy;
        const positions = hierarchy?.positions || hierarchy?.values || [];
        if (positions && positions.length >= 3) {
          const bs = Cesium.BoundingSphere.fromPoints(positions);
          if (bs && Number.isFinite(bs.radius) && bs.radius > 0) {
            viewer.camera.flyToBoundingSphere(bs, {
              duration: 1.2,
              offset: new Cesium.HeadingPitchRange(0.0, -Cesium.Math.PI_OVER_TWO, targetRange)
            });
            flew = true;
          }
        }
      }
      if (!flew && entity.position) {
        const pos = entity.position.getValue ? entity.position.getValue(now) : entity.position;
        if (pos) {
          const carto = Cesium.Cartographic.fromCartesian(pos);
          const dest = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, targetRange);
          viewer.camera.flyTo({
            destination: dest,
            duration: 1.2,
            orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 }
          });
          flew = true;
        }
      }
      if (!flew && entity.properties) {
        try {
          const lng = Number(entity.properties['经度']?.getValue?.(now) ?? entity.properties['经度']);
          const lat = Number(entity.properties['纬度']?.getValue?.(now) ?? entity.properties['纬度']);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            const dest = Cesium.Cartesian3.fromDegrees(lng, lat, targetRange);
            viewer.camera.flyTo({
              destination: dest,
              duration: 1.2,
              orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 }
            });
            flew = true;
          }
        } catch (_) {}
      }
      if (!flew) {
        viewer.flyTo(entity);
      }
    } catch (_) {}

    const poly = entity.polygon;
    if (!poly) return;

    const originalMaterialRef = poly.material;
    const originalOutlineRef = poly.outline;
    const originalOutlineColorRef = poly.outlineColor;

    let toggle = false;
    poly.outline = true;

    let rafId = null;
    let prevTs = performance.now();
    const startTs = prevTs;
    let accMs = 0;

    const blinkStep = (ts) => {
      try {
        const dt = ts - prevTs;
        prevTs = ts;
        accMs += dt;
        if (accMs >= intervalMs) {
          accMs %= intervalMs;
          toggle = !toggle;
          const color = Cesium.Color.fromAlpha(Cesium.Color.YELLOW, toggle ? 0.45 : 0.15);
          poly.material = new Cesium.ColorMaterialProperty(color);
          poly.outlineColor = toggle ? Cesium.Color.RED : Cesium.Color.YELLOW;
          viewer.scene?.requestRender?.();
        }
        if (ts - startTs < durationMs) {
          rafId = requestAnimationFrame(blinkStep);
        } else {
          try {
            poly.material =
              originalMaterialRef ?? new Cesium.ColorMaterialProperty(Cesium.Color.fromAlpha(Cesium.Color.WHITE, 0.1));
            if (originalOutlineRef !== undefined) poly.outline = originalOutlineRef;
            poly.outlineColor = originalOutlineColorRef ?? poly.outlineColor;
            const render = () => viewer.scene?.requestRender?.();
            render();
            setTimeout(render, 0);
            setTimeout(render, 32);
            setTimeout(render, 64);
          } catch (_) {}
        }
      } catch (_) {}
    };

    rafId = requestAnimationFrame(blinkStep);
    return () => rafId && cancelAnimationFrame(rafId);
  };

  const resolveEntityNameForLayer = (layerKey, entity) => {
    const props = entity?.properties;
    if (!props) return null;
    const now = Cesium.JulianDate.now();
    let fields = [];
    switch (layerKey) {
      case 'district':
        fields = ['区县名称'];
        break;
      case 'township':
        fields = ['街道名称'];
        break;
      case 'community':
        fields = ['社区名称'];
        break;
      case 'grid':
        fields = ['Name'];
        break;
      default:
        fields = ['name', 'NAME', 'Name', 'title', '名称', '区域名'];
    }
    for (const f of fields) {
      const v = props[f]?.getValue ? props[f].getValue(now) : props[f];
      const t = v == null ? '' : String(v).trim();
      if (t) return t;
    }
    return null;
  };

  const resolveEntityCartographic = (CesiumRef, entity) => {
    const now = CesiumRef.JulianDate.now();
    const props = entity?.properties;
    if (props) {
      const lngRaw = props['经度']?.getValue ? props['经度'].getValue(now) : props['经度'];
      const latRaw = props['纬度']?.getValue ? props['纬度'].getValue(now) : props['纬度'];
      const lng = Number(lngRaw);
      const lat = Number(latRaw);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        const lonRad = CesiumRef.Math.toRadians(lng);
        const latRad = CesiumRef.Math.toRadians(lat);
        return new CesiumRef.Cartographic(lonRad, latRad, 0);
      }
    }
    const poly = entity?.polygon;
    if (poly) {
      const hierarchy = poly.hierarchy?.getValue ? poly.hierarchy.getValue(now) : poly.hierarchy;
      const positions = hierarchy?.positions || hierarchy?.values;
      if (positions && positions.length) {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (let i = 0; i < positions.length; i++) {
          sx += positions[i].x;
          sy += positions[i].y;
          sz += positions[i].z;
        }
        const center = new CesiumRef.Cartesian3(sx / positions.length, sy / positions.length, sz / positions.length);
        return CesiumRef.Cartographic.fromCartesian(center) || null;
      }
    }
    return null;
  };

  const resolveLabelHeight = async (CesiumRef, viewer, layerName, cartographic) => {
    const isGridLayer = layerName === '网格' || layerName === 'grid';
    if (!cartographic) return isGridLayer ? GRID_LABEL_HEIGHT_OFFSET : 0;
    if (isGridLayer) return GRID_LABEL_HEIGHT_OFFSET;
    try {
      const scene = viewer && viewer.scene;
      if (!scene) return 0;
      const base = CesiumRef.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, 0);
      const clamped = await scene.clampToHeightMostDetailed([base]);
      let h = 0;
      if (clamped && clamped.length > 0 && clamped[0]) {
        const carto = CesiumRef.Cartographic.fromCartesian(clamped[0]);
        h = carto && Number.isFinite(carto.height) ? carto.height : 0;
      }
      return h;
    } catch (_) {
      return 0;
    }
  };

  let isUpdatingLOD = false;

  const dispose = () => {};

  return {
    geojsonLayerVisible,
    geojsonLodLayers,
    currentActiveLayer,
    labelCollections,
    searchQuery,
    searchResults,
    searchFilter,
    updateGeojsonLOD,
    ensureGeojsonLayer,
    applyTilesetByLayer,
    updateLabelHeightsForLayer,
    refreshLabelCollectionHeights,
    toggleGeojsonLayer,
    toggleLayerVisible,
    toggleLabel,
    toggleLod,
    debugLabelStatus,
    searchInGeojsonLayers,
    highlightEntity,
    resolveEntityNameForLayer,
    dispose
  };
}



