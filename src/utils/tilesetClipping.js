// Runtime regional clipping for Cesium3DTileset to limit loading to a moving window.
// This reduces requests and draw calls by culling tiles outside the box.

import * as Cesium from 'cesium';

// Simple approx conversion meters <-> degrees for small distances
function metersToDegrees(latDeg, dxMeters, dyMeters) {
  const latRad = Cesium.Math.toRadians(latDeg);
  const metersPerDegLat = 111320; // ~ meters per 1 deg latitude
  const metersPerDegLon = Math.cos(latRad) * 111320;
  const dLat = dyMeters / metersPerDegLat;
  const dLon = metersPerDegLon > 1e-6 ? dxMeters / metersPerDegLon : 0;
  return { dLon, dLat };
}

function pickClipHalfSizeMeters(heightMeters) {
  // Choose a half-size based on altitude. Conservative to avoid thrashing.
  const h = Math.max(0, heightMeters || 0);
  if (h < 300) return 800;        // 1.6 km square
  if (h < 800) return 1500;       // 3 km
  if (h < 1500) return 2500;      // 5 km
  if (h < 3000) return 4500;      // 9 km
  if (h < 8000) return 9000;      // 18 km
  if (h < 20000) return 20000;    // 40 km
  return 40000;                   // 80 km at very high alt
}

const scratchColumn = new Cesium.Cartesian3()
const scratchNormal = new Cesium.Cartesian3()
const scratchPoint = new Cesium.Cartesian3()
const scratchNegNormal = new Cesium.Cartesian3()
const scratchNegPoint = new Cesium.Cartesian3()

function createPlanesFromObb(obb) {
  const planes = []
  const halfAxes = obb.halfAxes
  const center = obb.center

  for (let i = 0; i < 3; i += 1) {
    Cesium.Matrix3.getColumn(halfAxes, i, scratchColumn)
    const axisLength = Cesium.Cartesian3.magnitude(scratchColumn)
    if (axisLength === 0) continue

    Cesium.Cartesian3.divideByScalar(scratchColumn, axisLength, scratchNormal)

    Cesium.Cartesian3.multiplyByScalar(scratchNormal, axisLength, scratchPoint)
    Cesium.Cartesian3.add(center, scratchPoint, scratchPoint)

    const distance = -Cesium.Cartesian3.dot(scratchNormal, scratchPoint)
    planes.push(new Cesium.ClippingPlane(Cesium.Cartesian3.clone(scratchNormal), distance))

    Cesium.Cartesian3.negate(scratchNormal, scratchNegNormal)
    Cesium.Cartesian3.multiplyByScalar(scratchNegNormal, axisLength, scratchNegPoint)
    Cesium.Cartesian3.add(center, scratchNegPoint, scratchNegPoint)
    const negDistance = -Cesium.Cartesian3.dot(scratchNegNormal, scratchNegPoint)
    planes.push(new Cesium.ClippingPlane(Cesium.Cartesian3.clone(scratchNegNormal), negDistance))
  }

  return planes
}

function makeClippingFromRectangle(rect, minHeight, maxHeight, debug) {
  // Build an oriented bounding box from rectangle and heights, then clipping planes.
  const factory = Cesium.ClippingPlaneCollection?.fromBoundingVolume;
  if (typeof factory !== 'function') {
    const obb = Cesium.OrientedBoundingBox.fromRectangle(
      rect,
      Cesium.defined(minHeight) ? minHeight : -200.0,
      Cesium.defined(maxHeight) ? maxHeight : 6000.0
    );
    const planes = createPlanesFromObb(obb);
    if (planes.length === 0) return null;
    const collection = new Cesium.ClippingPlaneCollection({
      planes,
      edgeWidth: debug ? 1.0 : 0.0,
      edgeColor: debug ? Cesium.Color.CYAN : Cesium.Color.TRANSPARENT
    });
    collection.enabled = true;
    collection.unionClippingRegions = false;
    return collection;
  }
  const obb = Cesium.OrientedBoundingBox.fromRectangle(
    rect,
    Cesium.defined(minHeight) ? minHeight : -200.0,
    Cesium.defined(maxHeight) ? maxHeight : 6000.0
  );
  const collection = factory.call(Cesium.ClippingPlaneCollection, obb);
  if (!collection) return null;
  collection.enabled = true;
  collection.unionClippingRegions = false; // intersection of planes -> inside box remains
  collection.edgeWidth = debug ? 1.0 : 0.0;
  collection.edgeColor = debug ? Cesium.Color.CYAN : Cesium.Color.TRANSPARENT;
  return collection;
}

export function installRegionalClipping(viewer, tileset, opts = {}) {
  if (!viewer || !tileset) return () => {};

  const options = {
    enabled: true,
    debugEdges: false,
    altitudeMargin: 1000, // extra height above camera
    minHeight: -200,
    maxHeightCap: 8000,
    idleDebounceMs: 150,
    moveThrottleMs: 180,
    ...opts
  };

  let enabled = !!options.enabled;
  let lastRect = null;
  let lastHalfSize = 0;
  let lastUpdate = 0;
  let rafId = 0;

  function computeRect() {
    const carto = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
    const centerLon = Cesium.Math.toDegrees(carto.longitude);
    const centerLat = Cesium.Math.toDegrees(carto.latitude);
    const height = carto.height;

    const halfSize = pickClipHalfSizeMeters(height);

    const { dLon, dLat } = metersToDegrees(centerLat, halfSize, halfSize);
    const rect = Cesium.Rectangle.fromDegrees(
      centerLon - dLon,
      centerLat - dLat,
      centerLon + dLon,
      centerLat + dLat
    );

    // Heights
    const minH = options.minHeight;
    const maxH = Math.min(options.maxHeightCap, height + options.altitudeMargin);

    return { rect, halfSize, minH, maxH };
  }

  function rectsSimilar(a, b, halfA, halfB) {
    if (!a || !b) return false;
    // If center shifts less than 30% of half-size and size change < 25%, treat as similar.
    const aCenterLon = (a.west + a.east) * 0.5;
    const aCenterLat = (a.south + a.north) * 0.5;
    const bCenterLon = (b.west + b.east) * 0.5;
    const bCenterLat = (b.south + b.north) * 0.5;
    const dLon = Math.abs(aCenterLon - bCenterLon);
    const dLat = Math.abs(aCenterLat - bCenterLat);
    const sizeChanged = Math.abs(halfA - halfB) / Math.max(1, halfA);
    const lonTol = (a.east - a.west) * 0.3;
    const latTol = (a.north - a.south) * 0.3;
    return dLon < lonTol && dLat < latTol && sizeChanged < 0.25;
  }

  function applyClippingNow() {
    if (!enabled) return;
    const now = performance.now();
    if (now - lastUpdate < options.moveThrottleMs) return;

    const { rect, halfSize, minH, maxH } = computeRect();

    if (rectsSimilar(rect, lastRect, halfSize, lastHalfSize)) return;

    try {
    const collection = makeClippingFromRectangle(rect, minH, maxH, options.debugEdges);
    if (!collection) {
      enabled = false;
      tileset.clippingPlanes = undefined;
      return;
    }
      tileset.clippingPlanes = collection;
      lastRect = rect;
      lastHalfSize = halfSize;
      lastUpdate = now;
      viewer.scene.requestRender();
    } catch (e) {
      // Fallback: disable if fails
      console.warn('installRegionalClipping: failed to apply clipping, disabling.', e);
      enabled = false;
      tileset.clippingPlanes = undefined;
    }
  }

  // Initial apply when ready
  let readyCanceled = false;
  (tileset.readyPromise || Promise.resolve()).then(() => {
    if (!readyCanceled) applyClippingNow();
  });

  const onChanged = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      applyClippingNow();
    });
  };

  viewer.camera.changed.addEventListener(onChanged);

  const onMoveEnd = () => {
    setTimeout(() => { applyClippingNow(); }, options.idleDebounceMs);
  };
  viewer.camera.moveEnd.addEventListener(onMoveEnd);

  function uninstall() {
    readyCanceled = true;
    try { viewer.camera.changed.removeEventListener(onChanged); } catch {}
    try { viewer.camera.moveEnd.removeEventListener(onMoveEnd); } catch {}
    try { tileset.clippingPlanes = undefined; } catch {}
  }

  return uninstall;
}

export default { installRegionalClipping };
