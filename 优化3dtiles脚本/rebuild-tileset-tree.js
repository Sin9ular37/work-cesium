#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Cartesian3, Cartographic, Matrix3, Matrix4 } from 'cesium';

const { promises: fsp } = fs;

const defaultOptions = {
  maxTilesPerNode: 64,
  maxDepth: 8,
  geometricErrorScale: 0.5,
  rootGeometricError: undefined,
  copyContent: false,
  force: false,
  backup: true,
};

const BOX_DIRECTIONS = [
  new Cartesian3(1, 1, 1),
  new Cartesian3(1, 1, -1),
  new Cartesian3(1, -1, 1),
  new Cartesian3(1, -1, -1),
  new Cartesian3(-1, 1, 1),
  new Cartesian3(-1, 1, -1),
  new Cartesian3(-1, -1, 1),
  new Cartesian3(-1, -1, -1),
];

function printUsage() {
  console.log(`用法：node scripts/rebuild-tileset-tree.js --source <目录或tileset.json> --output <输出目录> [选项]

必选参数：
  --source                   原始 3D Tiles 目录或 tileset.json
  --output                   输出目录（不存在时自动创建）

常用选项：
  --maxTilesPerNode <数值>   每个节点允许的最大瓦片数量，默认 64
  --maxDepth <数值>          四叉树最大深度，默认 8
  --geometricErrorScale <数> 几何误差按层缩放比例，默认 0.5
  --rootGeometricError <数>  根节点几何误差，如未设置则自动估算
  --copyContent              若输出目录不同，是否拷贝全部瓦片文件，默认 false
  --force                    允许覆盖已存在的输出目录
  --no-backup                在原地覆盖 tileset.json 时不生成备份

示例：
  node scripts/rebuild-tileset-tree.js --source E:\\Tiles\\City --output E:\\Tiles\\City --maxTilesPerNode 48 --maxDepth 7
  node scripts/rebuild-tileset-tree.js --source E:\\Tiles\\City --output E:\\Tiles\\CityOptimized --copyContent --force
`);
}

function parseArgs(argv) {
  const options = { ...defaultOptions };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) {
      continue;
    }
    const [flag, valueFromEquals] = raw.split('=', 2);
    const key = flag.slice(2);
    let value = valueFromEquals;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        value = next;
        i += 1;
      } else {
        value = 'true';
      }
    }
    switch (key) {
      case 'source':
        options.source = value;
        break;
      case 'output':
        options.output = value;
        break;
      case 'maxTilesPerNode':
        options.maxTilesPerNode = Number(value);
        break;
      case 'maxDepth':
        options.maxDepth = Number(value);
        break;
      case 'geometricErrorScale':
        options.geometricErrorScale = Number(value);
        break;
      case 'rootGeometricError':
        options.rootGeometricError = Number(value);
        break;
      case 'copyContent':
        options.copyContent = value === 'true';
        break;
      case 'force':
        options.force = value === 'true';
        break;
      case 'backup':
        options.backup = value === 'true';
        break;
      case 'no-backup':
        options.backup = false;
        break;
      default:
        console.warn(`未知参数：--${key}（已忽略）`);
        break;
    }
  }
  options.maxTilesPerNode = toPositiveInteger(options.maxTilesPerNode, defaultOptions.maxTilesPerNode);
  options.maxDepth = toPositiveInteger(options.maxDepth, defaultOptions.maxDepth);
  options.geometricErrorScale = toPositiveNumberInRange(
    options.geometricErrorScale,
    0,
    1,
    defaultOptions.geometricErrorScale,
  );
  options.rootGeometricError = toPositiveNumber(options.rootGeometricError, undefined);
  return options;
}

async function ensureDirectoryReady(dirPath, force) {
  const exists = await pathExists(dirPath);
  if (exists) {
    if (!force) {
      throw new Error(`输出目录已存在：${dirPath}。如需覆盖请添加 --force。`);
    }
    await fsp.rm(dirPath, { recursive: true, force: true });
  }
  await fsp.mkdir(dirPath, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(sourceDir, targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(sourcePath, targetPath);
    }
  }
}

function cloneTileWithoutChildren(tile) {
  const cloned = JSON.parse(JSON.stringify(tile));
  delete cloned.children;
  return cloned;
}

function extractRegionFromBoundingVolume(bv, transform) {
  if (!bv) {
    return undefined;
  }
  if (Array.isArray(bv.region)) {
    return [...bv.region];
  }
  if (bv.region) {
    return [
      bv.region[0] ?? bv.region.west,
      bv.region[1] ?? bv.region.south,
      bv.region[2] ?? bv.region.east,
      bv.region[3] ?? bv.region.north,
      bv.region[4] ?? bv.region.minHeight,
      bv.region[5] ?? bv.region.maxHeight,
    ];
  }
  if (Array.isArray(bv.box)) {
    return boxToRegion(bv.box, transform);
  }
  if (bv.box && Array.isArray(bv.box.value)) {
    return boxToRegion(bv.box.value, transform);
  }
  return undefined;
}

function extractRegion(tile, transform) {
  const fromTile = extractRegionFromBoundingVolume(tile.boundingVolume, transform);
  if (fromTile) {
    return fromTile;
  }
  if (tile.content) {
    const fromContent = extractRegionFromBoundingVolume(tile.content.boundingVolume, transform);
    if (fromContent) {
      return fromContent;
    }
  }
  if (Array.isArray(tile.contents)) {
    for (const content of tile.contents) {
      const fromContent = extractRegionFromBoundingVolume(content.boundingVolume, transform);
      if (fromContent) {
        return fromContent;
      }
    }
  }
  return undefined;
}

function regionCenter(region) {
  if (!region) {
    return undefined;
  }
  const [west, south, east, north, minHeight, maxHeight] = region;
  const lon = (west + east) / 2;
  const lat = (south + north) / 2;
  const height = (minHeight + maxHeight) / 2;
  return { lon, lat, height };
}

function regionUnion(regions) {
  if (regions.length === 0) {
    return undefined;
  }
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (const region of regions) {
    west = Math.min(west, region[0]);
    south = Math.min(south, region[1]);
    east = Math.max(east, region[2]);
    north = Math.max(north, region[3]);
    minHeight = Math.min(minHeight, region[4]);
    maxHeight = Math.max(maxHeight, region[5]);
  }

  return [west, south, east, north, minHeight, maxHeight];
}

function splitRegionIntoQuadrants(region) {
  const [west, south, east, north, minHeight, maxHeight] = region;
  const midLon = (west + east) / 2;
  const midLat = (south + north) / 2;
  return [
    [west, south, midLon, midLat, minHeight, maxHeight], // SW
    [midLon, south, east, midLat, minHeight, maxHeight], // SE
    [west, midLat, midLon, north, minHeight, maxHeight], // NW
    [midLon, midLat, east, north, minHeight, maxHeight], // NE
  ];
}

function quadrantIndex(center, quadrants) {
  for (let i = 0; i < quadrants.length; i += 1) {
    const quad = quadrants[i];
    if (
      center.lon >= quad[0] &&
      center.lon <= quad[2] &&
      center.lat >= quad[1] &&
      center.lat <= quad[3]
    ) {
      return i;
    }
  }
  return -1;
}

function computeGeometricError(rootError, scale, depth) {
  if (rootError === undefined || rootError === null) {
    return undefined;
  }
  return rootError * Math.pow(scale, depth);
}

function estimateRootGeometricError(region) {
  if (!region) {
    return 500;
  }
  const EARTH_RADIUS = 6378137;
  const lonRange = Math.abs(region[2] - region[0]);
  const latRange = Math.abs(region[3] - region[1]);
  const horizontalSpan = Math.max(lonRange, latRange) * EARTH_RADIUS;
  return Math.max(horizontalSpan, 1);
}

function collectTilesWithContent(tile, result, parentTransform = Matrix4.IDENTITY) {
  const worldTransform = combineTransforms(parentTransform, tile.transform);
  const hasContent =
    (tile.content && tile.content.uri) ||
    (Array.isArray(tile.contents) && tile.contents.length > 0);

  if (hasContent) {
    const clone = cloneTileWithoutChildren(tile);
    const region = extractRegion(tile, worldTransform);
    const center = regionCenter(region);
    result.push({
      tile: clone,
      region,
      center,
    });
  }

  if (Array.isArray(tile.children)) {
    for (const child of tile.children) {
      collectTilesWithContent(child, result, worldTransform);
    }
  }
}

function buildHierarchy(tiles, currentRegion, depth, options) {
  if (tiles.length === 0) {
    return [];
  }
  if (depth >= options.maxDepth || tiles.length <= options.maxTilesPerNode) {
    return tiles.map((entry) => entry.tile);
  }

  const quadrants = splitRegionIntoQuadrants(currentRegion);
  const buckets = quadrants.map(() => []);
  const fallbackTiles = [];

  for (const entry of tiles) {
    if (!entry.region || !entry.center) {
      fallbackTiles.push(entry);
      continue;
    }
    const idx = quadrantIndex(entry.center, quadrants);
    if (idx === -1) {
      fallbackTiles.push(entry);
    } else {
      buckets[idx].push(entry);
    }
  }

  let canSubdivide = false;
  for (const bucket of buckets) {
    if (bucket.length > 0 && bucket.length < tiles.length) {
      canSubdivide = true;
      break;
    }
  }
  if (!canSubdivide) {
    return tiles.map((entry) => entry.tile);
  }

  const children = [];
  for (let i = 0; i < buckets.length; i += 1) {
    const bucket = buckets[i];
    if (bucket.length === 0) {
      continue;
    }
    const childRegion = regionUnion(bucket.map((entry) => entry.region));
    const childTiles = buildHierarchy(bucket, childRegion, depth + 1, options);
    const childNode = {
      boundingVolume: { region: childRegion },
      geometricError: computeGeometricError(
        options.rootGeometricError,
        options.geometricErrorScale,
        depth + 1,
      ),
      refine: options.refine,
      children: childTiles,
    };
    children.push(childNode);
  }

  const fallbackNodes = fallbackTiles.map((entry) => entry.tile);
  return children.concat(fallbackNodes);
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed);
  }
  return fallback;
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function toPositiveNumberInRange(value, min, max, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > min && parsed < max) {
    return parsed;
  }
  return fallback;
}

function toMatrix4(transform) {
  if (!transform) {
    return undefined;
  }
  if (Array.isArray(transform) && transform.length === 16) {
    return Matrix4.fromArray(transform, 0, new Matrix4());
  }
  if (transform.elements && Array.isArray(transform.elements) && transform.elements.length === 16) {
    return Matrix4.fromArray(transform.elements, 0, new Matrix4());
  }
  return undefined;
}

function combineTransforms(parentTransform, rawTransform) {
  const parent = parentTransform || Matrix4.IDENTITY;
  const local = toMatrix4(rawTransform);
  if (!local) {
    return parent;
  }
  if (parent === Matrix4.IDENTITY) {
    return local;
  }
  return Matrix4.multiply(parent, local, new Matrix4());
}

function boxToRegion(boxArray, transform) {
  const center = Cartesian3.fromArray(boxArray, 0, new Cartesian3());
  const halfAxes = Matrix3.fromArray(boxArray, 3, new Matrix3());
  const matrix = transform || Matrix4.IDENTITY;

  const cartographics = BOX_DIRECTIONS.map((dir) => {
    const offset = Matrix3.multiplyByVector(halfAxes, dir, new Cartesian3());
    const cartesianLocal = Cartesian3.add(center, offset, new Cartesian3());
    const cartesianWorld = Matrix4.multiplyByPoint(matrix, cartesianLocal, new Cartesian3());
    return Cartographic.fromCartesian(cartesianWorld, undefined, new Cartographic());
  });

  const west = Math.min(...cartographics.map((c) => c.longitude));
  const south = Math.min(...cartographics.map((c) => c.latitude));
  const east = Math.max(...cartographics.map((c) => c.longitude));
  const north = Math.max(...cartographics.map((c) => c.latitude));
  const minHeight = Math.min(...cartographics.map((c) => c.height));
  const maxHeight = Math.max(...cartographics.map((c) => c.height));

  return [west, south, east, north, minHeight, maxHeight];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source || !options.output) {
    printUsage();
    process.exit(1);
  }

  const sourceResolved = path.resolve(options.source);
  const outputResolved = path.resolve(options.output);

  const sourceStat = await fsp.stat(sourceResolved);
  const sourceTilesetPath = sourceStat.isDirectory()
    ? path.join(sourceResolved, 'tileset.json')
    : sourceResolved;

  const tilesetDir = sourceStat.isDirectory() ? sourceResolved : path.dirname(sourceResolved);

  if (!(await pathExists(sourceTilesetPath))) {
    throw new Error(`未找到 tileset.json：${sourceTilesetPath}`);
  }

  const rawJson = await fsp.readFile(sourceTilesetPath, 'utf-8');
  const tileset = JSON.parse(rawJson);
  if (!tileset.root) {
    throw new Error('tileset.json 缺少 root 节点，无法继续。');
  }

  const tilesWithContent = [];
  collectTilesWithContent(tileset.root, tilesWithContent, Matrix4.IDENTITY);
  if (tilesWithContent.length === 0) {
    throw new Error('未找到任何包含内容的瓦片。');
  }

  const regionTiles = [];
  const fallbackTiles = [];
  for (const entry of tilesWithContent) {
    if (entry.region) {
      regionTiles.push(entry);
    } else {
      fallbackTiles.push(entry.tile);
    }
  }

  let rootRegion = extractRegion(tileset.root, Matrix4.IDENTITY);
  if (!rootRegion) {
    rootRegion = regionUnion(regionTiles.map((entry) => entry.region).filter(Boolean));
  }
  if (!rootRegion) {
    throw new Error('无法推导根节点的 boundingVolume.region。');
  }

  const refine = tileset.root.refine || 'ADD';
  let rootGeometricError =
    Number.isFinite(options.rootGeometricError) && options.rootGeometricError > 0
      ? options.rootGeometricError
      : tileset.root.geometricError;

  if (!Number.isFinite(rootGeometricError) || rootGeometricError <= 0) {
    rootGeometricError = estimateRootGeometricError(rootRegion);
  }

  const hierarchyChildren = buildHierarchy(regionTiles, rootRegion, 0, {
    maxTilesPerNode: options.maxTilesPerNode,
    maxDepth: options.maxDepth,
    geometricErrorScale: options.geometricErrorScale,
    rootGeometricError,
    refine,
  });

  const newBoundingVolume = { ...(tileset.root.boundingVolume || {}) };
  if (!newBoundingVolume.region) {
    newBoundingVolume.region = rootRegion;
  }

  const newRoot = {
    ...tileset.root,
    boundingVolume: newBoundingVolume,
    refine,
    geometricError: rootGeometricError,
    children: hierarchyChildren.concat(fallbackTiles),
  };

  delete newRoot.content;
  delete newRoot.contents;

  const optimizedTileset = {
    ...tileset,
    root: newRoot,
  };

  const sameDirectory = path.resolve(tilesetDir) === outputResolved;
  if (!sameDirectory) {
    await ensureDirectoryReady(outputResolved, options.force);
    if (options.copyContent) {
      console.log('开始拷贝原始瓦片资源，数据量较大请耐心等待……');
      await copyDirectory(tilesetDir, outputResolved);
    } else {
      await fsp.mkdir(outputResolved, { recursive: true });
    }
  } else if (options.backup) {
    const backupPath = path.join(tilesetDir, `tileset.${Date.now()}.bak.json`);
    await fsp.writeFile(backupPath, rawJson, 'utf-8');
    console.log(`已生成备份：${backupPath}`);
  }

  const outputTilesetPath = sameDirectory
    ? sourceTilesetPath
    : path.join(outputResolved, 'tileset.json');

  await fsp.writeFile(
    outputTilesetPath,
    `${JSON.stringify(optimizedTileset, null, 2)}${os.EOL}`,
    'utf-8',
  );

  console.log('重建层级完成：');
  console.log(`  原始瓦片总数：${tilesWithContent.length}`);
  console.log(`  参与分层的瓦片：${regionTiles.length}`);
  console.log(`  输出路径：${outputTilesetPath}`);
}

main().catch((err) => {
  console.error('\n执行失败：', err.message);
  process.exit(1);
});
