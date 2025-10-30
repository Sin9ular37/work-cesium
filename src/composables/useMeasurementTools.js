import { ref } from 'vue';
import { createLogger } from '../utils/logger';
import { APP_CONFIG } from '../config/appConfig';

const measurementConfig = APP_CONFIG.measurement || {};
const measurementPointStyle = measurementConfig.pointStyle || {};
const measurementLabelStyle = measurementConfig.labelStyle || {};

export function useMeasurementTools({
  Cesium,
  cesiumContainer,
  getViewer,
  topicPanelVisible,
  isCanvasRenderable,
  requestRender,
  hideGridBlocksForMeasurementIfNeeded,
  restoreGridBlocksAfterMeasurement
}) {
  const logger = createLogger('MeasurementTools', { level: 'warn' });
  const measurePanelVisible = ref(false);
  const activeMeasureTab = ref('distance');
  const measureUnit = ref('metric');
  const isMeasurementActive = ref(false);
  const showClearButton = ref(false);

  const isMeasuring = ref(false);
  const measurementPoints = ref([]);
  const totalDistance = ref(0);
  const totalDistance3D = ref(0);
  const totalVerticalDistance = ref(0);
  const measurementEntities = ref([]);
  const measurementMode = ref('3D');
  const lastMouseMoveTime = ref(0);

  const isAreaMeasuring = ref(false);
  const areaPoints = ref([]);
  const areaEntities = ref([]);
  const areaSquareMeters = ref(0);
  const areaPerimeterMeters = ref(0);
  const hoverPoint = ref(null);

  let measurementHandler = null;
  let areaPolylineEntity = null;
  let areaPolygonEntity = null;

  const ensureViewer = () => {
    const viewer = getViewer?.();
    if (!viewer) {
      logger.warn('[measurement] Cesium Viewer 尚未就绪');
    }
    return viewer;
  };

  const safeRequestRender = () => {
    try {
      requestRender?.();
    } catch (_) {}
  };

  function toggleMeasurePanel(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    measurePanelVisible.value = !measurePanelVisible.value;
    if (measurePanelVisible.value && topicPanelVisible) {
      topicPanelVisible.value = false;
    }
  }

  function switchMeasureTab(tab) {
    activeMeasureTab.value = tab;
    if (isMeasuring.value) stopMeasurement();
    if (isAreaMeasuring.value) stopAreaMeasurement();
    isMeasurementActive.value = false;
    showClearButton.value = false;
  }

  function restartMeasurement() {
    clearMeasurement();
    clearAreaMeasurement();
    showClearButton.value = false;
    safeRequestRender();

    hideGridBlocksForMeasurementIfNeeded?.();

    isMeasurementActive.value = true;
    if (activeMeasureTab.value === 'distance') {
      isMeasuring.value = true;
      startMeasurement();
    } else {
      isAreaMeasuring.value = true;
      startAreaMeasurement();
    }
  }

  function startMeasurement() {
    const viewer = ensureViewer();
    if (!viewer) return;

    if (measurementEntities.value.length > 0) {
      clearMeasurement();
    }

    if (cesiumContainer?.value) {
      cesiumContainer.value.style.cursor = 'crosshair';
    }

    measurementHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    measurementHandler.setInputAction(onMeasurementClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    measurementHandler.setInputAction(onMeasurementMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  function stopMeasurement() {
    if (cesiumContainer?.value) {
      cesiumContainer.value.style.cursor = 'default';
    }
    if (measurementHandler) {
      measurementHandler.destroy();
      measurementHandler = null;
    }
    isMeasuring.value = false;
  }

  function onMeasurementClick(event) {
    if (!isMeasurementActive.value || !isMeasuring.value) return;
    const pickedPosition = pick3DPosition(event.position);
    if (!pickedPosition) return;
    addMeasurementPoint(pickedPosition);
    if (measurementPoints.value.length >= 2) {
      stopMeasurement();
      isMeasurementActive.value = false;
      showClearButton.value = true;
    }
  }

  function onMeasurementMove() {
    if (!isCanvasRenderable?.()) return;
  }

  function pick3DPosition(screenPosition) {
    const viewer = ensureViewer();
    if (!viewer) return null;
    const scene = viewer.scene;

    const pickedObject = scene.pick(screenPosition);
    if (pickedObject && pickedObject.id && pickedObject.id.position) {
      return pickedObject.id.position._value;
    }

    const terrainPosition = scene.pickPosition(screenPosition);
    if (terrainPosition) {
      return terrainPosition;
    }

    const ellipsoidPosition = viewer.camera.pickEllipsoid(
      screenPosition,
      scene.globe.ellipsoid
    );
    return ellipsoidPosition || null;
  }

  function addMeasurementPoint(position) {
    const viewer = ensureViewer();
    if (!viewer) return;

    const pointNumber = measurementPoints.value.length + 1;
    const height = getHeightFromPosition(position);

    measurementPoints.value = measurementPoints.value.concat([{ position, number: pointNumber, height }]);

    const pointColor = measurementPointStyle.color
      ? Cesium.Color.fromCssColorString(measurementPointStyle.color)
      : Cesium.Color.YELLOW;
    const pointOutlineColor = measurementPointStyle.outlineColor
      ? Cesium.Color.fromCssColorString(measurementPointStyle.outlineColor)
      : Cesium.Color.BLACK;
    const labelFillColor = measurementLabelStyle.fillColor
      ? Cesium.Color.fromCssColorString(measurementLabelStyle.fillColor)
      : Cesium.Color.WHITE;
    const labelOutlineColor = measurementLabelStyle.outlineColor
      ? Cesium.Color.fromCssColorString(measurementLabelStyle.outlineColor)
      : Cesium.Color.BLACK;
    const labelPixelOffset = measurementLabelStyle.pixelOffset || {};

    const pointEntity = viewer.entities.add({
      position,
      point: {
        pixelSize: measurementPointStyle.pixelSize ?? 16,
        color: pointColor,
        outlineColor: pointOutlineColor,
        outlineWidth: measurementPointStyle.outlineWidth ?? 3,
        heightReference: Cesium.HeightReference.NONE,
        scaleByDistance: undefined
      },
      label: {
        text: pointNumber.toString(),
        font: measurementLabelStyle.font ?? '16pt Arial Bold',
        fillColor: labelFillColor,
        outlineColor: labelOutlineColor,
        outlineWidth: measurementLabelStyle.outlineWidth ?? 3,
        pixelOffset: new Cesium.Cartesian2(
          labelPixelOffset.x ?? 0,
          labelPixelOffset.y ?? -35
        ),
        heightReference: Cesium.HeightReference.NONE,
        scaleByDistance: undefined
      }
    });

    measurementEntities.value = measurementEntities.value.concat([pointEntity]);

    if (measurementPoints.value.length > 1) {
      create3DMeasurementLine();
    }

    calculate3DDistance();
    safeRequestRender();
  }

  function getHeightFromPosition(position) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    return cartographic.height;
  }

  function create3DMeasurementLine() {
    const viewer = ensureViewer();
    if (!viewer) return;
    const points = measurementPoints.value;
    if (points.length < 2) return;

    const lastPoint = points[points.length - 1];
    const previousPoint = points[points.length - 2];

    const lineEntity = viewer.entities.add({
      polyline: {
        positions: [previousPoint.position, lastPoint.position],
        width: 5,
        material: Cesium.Color.CYAN,
        clampToGround: false,
        depthFailMaterial: Cesium.Color.RED.withAlpha(0.5)
      }
    });

    measurementEntities.value = measurementEntities.value.concat([lineEntity]);
  }

  function calculateHorizontalAndVertical(startPos, endPos) {
    const startCartographic = Cesium.Cartographic.fromCartesian(startPos);
    const endCartographic = Cesium.Cartographic.fromCartesian(endPos);
    const geodesic = new Cesium.EllipsoidGeodesic(startCartographic, endCartographic);
    const horizontalDistance = geodesic.surfaceDistance;
    const heightDifference = Math.abs(endCartographic.height - startCartographic.height);
    const distance3D = Math.sqrt(
      horizontalDistance * horizontalDistance + heightDifference * heightDifference
    );
    return { horizontalDistance, heightDifference, distance3D };
  }

  function calculate3DDistance() {
    totalDistance.value = 0;
    totalDistance3D.value = 0;
    totalVerticalDistance.value = 0;

    for (let i = 1; i < measurementPoints.value.length; i++) {
      const startPos = measurementPoints.value[i - 1].position;
      const endPos = measurementPoints.value[i].position;
      const { horizontalDistance, heightDifference, distance3D } =
        calculateHorizontalAndVertical(startPos, endPos);
      totalDistance.value += horizontalDistance;
      totalVerticalDistance.value += heightDifference;
      totalDistance3D.value += distance3D;
    }
  }

  function formatDistance(distance) {
    if (!Number.isFinite(distance)) return '—';
    if (distance < 1000) return `${distance.toFixed(2)} 米`;
    return `${(distance / 1000).toFixed(2)} 公里`;
  }

  function toggleMeasurementMode() {
    measurementMode.value = measurementMode.value === '2D' ? '3D' : '2D';
    if (measurementPoints.value.length > 1) {
      calculate3DDistance();
      safeRequestRender();
    }
  }

  function getElevationDifference() {
    if (measurementPoints.value.length < 2) return 0;
    const firstHeight = measurementPoints.value[0].height;
    const lastHeight = measurementPoints.value[measurementPoints.value.length - 1].height;
    return Math.abs(lastHeight - firstHeight).toFixed(2);
  }

  function clearMeasurement() {
    const viewer = ensureViewer();
    if (viewer) {
      measurementEntities.value.forEach(entity => {
        try { viewer.entities.remove(entity); } catch (_) {}
      });
    }
    measurementEntities.value = [];
    measurementPoints.value = [];
    totalDistance.value = 0;
    totalDistance3D.value = 0;
    totalVerticalDistance.value = 0;
    showClearButton.value = false;
    isMeasurementActive.value = false;
    safeRequestRender();
    restoreGridBlocksAfterMeasurement?.();
  }

  function finishMeasurement() {
    stopMeasurement();
  }

  function startAreaMeasurement() {
    const viewer = ensureViewer();
    if (!viewer) return;

    isAreaMeasuring.value = true;
    if (cesiumContainer?.value) {
      cesiumContainer.value.style.cursor = 'crosshair';
    }

    if (measurementHandler) {
      try { measurementHandler.destroy(); } catch (_) {}
      measurementHandler = null;
    }

    measurementHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    measurementHandler.setInputAction(onAreaClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    measurementHandler.setInputAction(onAreaMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    measurementHandler.setInputAction(onAreaDoubleClick, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    if (!areaPolylineEntity) {
      const polylinePositions = new Cesium.CallbackProperty(() => {
        const pts = areaPoints.value.slice();
        if (hoverPoint.value) pts.push(hoverPoint.value);
        return pts;
      }, false);

      areaPolylineEntity = viewer.entities.add({
        polyline: {
          positions: polylinePositions,
          width: 3,
          material: Cesium.Color.CYAN.withAlpha(0.9),
          clampToGround: false
        }
      });
      areaEntities.value = areaEntities.value.concat([areaPolylineEntity]);
    }

    if (!areaPolygonEntity) {
      const polygonHierarchy = new Cesium.CallbackProperty(() => {
        const pts = areaPoints.value.slice();
        if (hoverPoint.value) pts.push(hoverPoint.value);
        if (pts.length < 3) return undefined;
        return new Cesium.PolygonHierarchy(pts);
      }, false);

      areaPolygonEntity = viewer.entities.add({
        polygon: {
          hierarchy: polygonHierarchy,
          material: Cesium.Color.fromBytes(37, 99, 235, 70),
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          perPositionHeight: true,
          heightReference: Cesium.HeightReference.NONE
        }
      });
      areaEntities.value = areaEntities.value.concat([areaPolygonEntity]);
    }
  }

  function stopAreaMeasurement() {
    if (cesiumContainer?.value) {
      cesiumContainer.value.style.cursor = 'default';
    }
    if (measurementHandler) {
      try { measurementHandler.destroy(); } catch (_) {}
      measurementHandler = null;
    }
    isAreaMeasuring.value = false;
  }

  function clearAreaMeasurement() {
    const viewer = ensureViewer();
    if (viewer) {
      areaEntities.value.forEach(e => { try { viewer.entities.remove(e); } catch (_) {} });
    }
    areaPoints.value = [];
    hoverPoint.value = null;
    areaSquareMeters.value = 0;
    areaPerimeterMeters.value = 0;
    areaEntities.value = [];
    areaPolylineEntity = null;
    areaPolygonEntity = null;
    showClearButton.value = false;
    isMeasurementActive.value = false;
    safeRequestRender();
    restoreGridBlocksAfterMeasurement?.();
  }

  function onAreaDoubleClick() {
    if (!isAreaMeasuring.value || areaPoints.value.length < 3) return;
    hoverPoint.value = null;
    updateAreaAndPerimeter();
    stopAreaMeasurement();
    showClearButton.value = true;
  }

  function onAreaClick(event) {
    if (!isAreaMeasuring.value) return;
    const viewer = ensureViewer();
    if (!viewer) return;
    const pos = pick3DPosition(event.position);
    if (!pos || !isValidCartesian3(pos)) return;
    areaPoints.value = areaPoints.value.concat([pos]);
    const pointEntity = viewer.entities.add({
      position: pos,
      point: { pixelSize: 8, color: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 }
    });
    areaEntities.value = areaEntities.value.concat([pointEntity]);
    updateAreaAndPerimeter();
    safeRequestRender();
  }

  function onAreaMove(event) {
    if (!isAreaMeasuring.value) return;
    if (!isCanvasRenderable?.()) return;
    const pos = pick3DPosition(event.endPosition);
    hoverPoint.value = (pos && isValidCartesian3(pos)) ? pos : null;
    safeRequestRender();
  }

  function updateAreaAndPerimeter() {
    const pts = areaPoints.value.filter(isValidCartesian3);
    if (pts.length >= 3) {
      try {
        areaSquareMeters.value = calculateArea2DWebMercator(pts) || 0;
      } catch (_) {
        areaSquareMeters.value = 0;
      }
    } else {
      areaSquareMeters.value = 0;
    }
    if (pts.length >= 2) {
      try {
        areaPerimeterMeters.value = calculatePerimeter2DWebMercator(pts) || 0;
      } catch (_) {
        areaPerimeterMeters.value = 0;
      }
    } else {
      areaPerimeterMeters.value = 0;
    }
  }

  function cartesianArrayToLonLat(cartesians) {
    const out = [];
    for (let i = 0; i < cartesians.length; i++) {
      const c = Cesium.Cartographic.fromCartesian(cartesians[i]);
      if (!c) continue;
      out.push({ lon: c.longitude, lat: c.latitude });
    }
    return out;
  }

  function projectToWebMercatorXY(lonLatArray) {
    const R = 6378137.0;
    const MAX_LAT = Cesium.Math.toRadians(85.05112878);
    return lonLatArray.map(({ lon, lat }) => {
      const clampedLat = Math.min(Math.max(lat, -MAX_LAT), MAX_LAT);
      const x = R * lon;
      const y = R * Math.log(Math.tan(Math.PI / 4 + clampedLat / 2));
      return { x, y };
    });
  }

  function calculateArea2DWebMercator(cartesians) {
    const lonlat = cartesianArrayToLonLat(cartesians);
    if (lonlat.length < 3) return 0;
    const pts = projectToWebMercatorXY(lonlat);
    let area2 = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area2 += (pts[j].x * pts[i].y) - (pts[i].x * pts[j].y);
    }
    return Math.abs(area2) * 0.5;
  }

  function calculatePerimeter2DWebMercator(cartesians) {
    const lonlat = cartesianArrayToLonLat(cartesians);
    if (lonlat.length < 2) return 0;
    const pts = projectToWebMercatorXY(lonlat);
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      sum += Math.sqrt(dx * dx + dy * dy);
    }
    return sum;
  }

  function isValidCartesian3(c) {
    return !!c && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z);
  }

  function formatArea(value) {
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value < 1e6) return `${value.toFixed(0)} 平方米`;
    return `${(value / 1e6).toFixed(3)} 平方公里`;
  }

  return {
    measurePanelVisible,
    activeMeasureTab,
    measureUnit,
    isMeasurementActive,
    showClearButton,
    isMeasuring,
    measurementPoints,
    totalDistance,
    totalDistance3D,
    totalVerticalDistance,
    measurementEntities,
    measurementMode,
    lastMouseMoveTime,
    isAreaMeasuring,
    areaPoints,
    areaEntities,
    areaSquareMeters,
    areaPerimeterMeters,
    hoverPoint,
    toggleMeasurePanel,
    switchMeasureTab,
    restartMeasurement,
    stopMeasurement,
    startMeasurement,
    clearMeasurement,
    finishMeasurement,
    toggleMeasurementMode,
    getElevationDifference,
    startAreaMeasurement,
    stopAreaMeasurement,
    clearAreaMeasurement,
    formatDistance,
    formatArea
  };
}
