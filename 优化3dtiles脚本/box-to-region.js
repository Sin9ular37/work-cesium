#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Cartesian3, Cartographic, Matrix3, Matrix4 } from '@cesium/engine';

const { promises: fsp } = fs;

const defaultOptions = {
  removeBox: false,
};

function printUsage() {
  console.log(`用法：node scripts/box-to-region.js --source <tileset.json 或目录> [--output <输出路径>] [--removeBox]

作用：将 tileset.json 中含有 boundingVolume.box 的节点补足 boundingVolume.region，并在必要时扩大父节点 region，保证父节点完全覆盖其子节点。

选项：
  --source       输入目录或 tileset.json 路径（必填）
  --output       输出 tileset.json 文件路径（默认覆盖原文件）
  --removeBox    转换成功后移除 boundingVolume.box 字段（默认 false）
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
      case 'removeBox':
        options.removeBox = value === 'true';
        break;
      default:
        console.warn(`未知参数：--${key}（已忽略）`);
        break;
    }
  }
  return options;
}

function ensureTilesetPath(source) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    return path.join(source, 'tileset.json');
  }
  return source;
}

async function ensureDirectory(dirPath) {
  if (!dirPath) {
    return;
  }
  const normalized = path.resolve(dirPath);
  const { root } = path.parse(normalized);
  if (normalized === root) {
    return; // 根目录已存在，无需创建
  }
  try {
    await fsp.access(normalized);
  } catch {
    await fsp.mkdir(normalized, { recursive: true });
  }
}

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

function toMatrix4(transform) {
  if (!transform) {
    return undefined;
  }
  if (Array.isArray(transform) && transform.length === 16) {
    return Matrix4.fromArray(transform, 0, new Matrix4());
  }
  if (transform && Array.isArray(transform.elements) && transform.elements.length === 16) {
    return Matrix4.fromArray(transform.elements, 0, new Matrix4());
  }
  throw new Error('无效的 transform，必须是长度为 16 的数组。');
}

function multiplyTransforms(parent, local) {
  if (!local) {
    return parent;
  }
  if (!parent) {
    return Matrix4.clone(local, new Matrix4());
  }
  return Matrix4.multiply(parent, local, new Matrix4());
}

function boxToRegion(boxArray, worldTransform) {
  if (!Array.isArray(boxArray) || boxArray.length !== 12) {
    throw new Error('无效的 boundingVolume.box，必须是长度为 12 的数组。');
  }
  const center = Cartesian3.fromArray(boxArray, 0, new Cartesian3());
  const halfAxes = Matrix3.fromArray(boxArray, 3, new Matrix3());
  const transform = worldTransform || Matrix4.IDENTITY;

  const cartographics = BOX_DIRECTIONS.map((dir) => {
    const offset = Matrix3.multiplyByVector(halfAxes, dir, new Cartesian3());
    const cartesianLocal = Cartesian3.add(center, offset, new Cartesian3());
    const cartesianWorld = Matrix4.multiplyByPoint(transform, cartesianLocal, new Cartesian3());
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

function getRegion(boundingVolume) {
  if (!boundingVolume) {
    return undefined;
  }
  if (Array.isArray(boundingVolume.region)) {
    return boundingVolume.region;
  }
  if (boundingVolume.region && Array.isArray(boundingVolume.region.value)) {
    return boundingVolume.region.value;
  }
  if (
    boundingVolume.region &&
    typeof boundingVolume.region === 'object' &&
    ['west', 'south', 'east', 'north', 'minHeight', 'maxHeight'].every(
      (key) => typeof boundingVolume.region[key] === 'number',
    )
  ) {
    return [
      boundingVolume.region.west,
      boundingVolume.region.south,
      boundingVolume.region.east,
      boundingVolume.region.north,
      boundingVolume.region.minHeight,
      boundingVolume.region.maxHeight,
    ];
  }
  return undefined;
}

function regionUnion(regions) {
  const valid = regions.filter((region) => Array.isArray(region) && region.length === 6);
  if (valid.length === 0) {
    return undefined;
  }
  const west = Math.min(...valid.map((region) => region[0]));
  const south = Math.min(...valid.map((region) => region[1]));
  const east = Math.max(...valid.map((region) => region[2]));
  const north = Math.max(...valid.map((region) => region[3]));
  const minHeight = Math.min(...valid.map((region) => region[4]));
  const maxHeight = Math.max(...valid.map((region) => region[5]));
  return [west, south, east, north, minHeight, maxHeight];
}

function regionContains(parentRegion, childRegion) {
  if (!parentRegion || !childRegion) {
    return false;
  }
  const EPS_LON_LAT = 1e-10;
  const EPS_HEIGHT = 1e-5;
  return (
    childRegion[0] + EPS_LON_LAT >= parentRegion[0] &&
    childRegion[1] + EPS_LON_LAT >= parentRegion[1] &&
    childRegion[2] - EPS_LON_LAT <= parentRegion[2] &&
    childRegion[3] - EPS_LON_LAT <= parentRegion[3] &&
    childRegion[4] + EPS_HEIGHT >= parentRegion[4] &&
    childRegion[5] - EPS_HEIGHT <= parentRegion[5]
  );
}

function ensureBoundingVolumeRegion(target, stats, options, worldTransform) {
  if (!target || !target.boundingVolume) {
    return;
  }
  if (target.boundingVolume.region || !target.boundingVolume.box) {
    return;
  }
  target.boundingVolume.region = boxToRegion(target.boundingVolume.box, worldTransform);
  stats.converted += 1;
  if (options.removeBox) {
    delete target.boundingVolume.box;
  }
}

function processTile(tile, stats, options, parentTransform = Matrix4.IDENTITY) {
  if (!tile || typeof tile !== 'object') {
    return;
  }

  let worldTransform = parentTransform || Matrix4.IDENTITY;
  try {
    if (tile.transform) {
      const localTransform = toMatrix4(tile.transform);
      worldTransform = multiplyTransforms(parentTransform || Matrix4.IDENTITY, localTransform);
    }
  } catch (error) {
    stats.failed += 1;
    stats.errors.push(error.message);
    return;
  }

  try {
    if (tile.boundingVolume && tile.boundingVolume.box) {
      ensureBoundingVolumeRegion(tile, stats, options, worldTransform);
    }
    if (tile.content && tile.content.boundingVolume && tile.content.boundingVolume.box) {
      ensureBoundingVolumeRegion(tile.content, stats, options, worldTransform);
    }
    if (Array.isArray(tile.contents)) {
      tile.contents.forEach((content) => {
        if (content.boundingVolume && content.boundingVolume.box) {
          ensureBoundingVolumeRegion(content, stats, options, worldTransform);
        }
      });
    }
  } catch (error) {
    stats.failed += 1;
    stats.errors.push(error.message);
  }

  if (Array.isArray(tile.children)) {
    tile.children.forEach((child) => processTile(child, stats, options, worldTransform));
  }
}

function propagateRegions(tile, stats) {
  if (!tile || typeof tile !== 'object') {
    return undefined;
  }
  const childRegions = [];
  if (Array.isArray(tile.children)) {
    for (const child of tile.children) {
      const region = propagateRegions(child, stats);
      if (region) {
        childRegions.push(region);
      }
    }
  }

  const ownRegion = getRegion(tile.boundingVolume);
  if (childRegions.length === 0) {
    return ownRegion;
  }

  const childrenUnion = regionUnion(childRegions);
  if (!childrenUnion) {
    return ownRegion;
  }

  if (!tile.boundingVolume) {
    tile.boundingVolume = {};
  }

  if (!ownRegion) {
    tile.boundingVolume.region = childrenUnion;
    stats.parentRegionFilled += 1;
    return tile.boundingVolume.region;
  }

  if (!regionContains(ownRegion, childrenUnion)) {
    tile.boundingVolume.region = regionUnion([ownRegion, childrenUnion]);
    stats.parentRegionExpanded += 1;
    return tile.boundingVolume.region;
  }

  return ownRegion;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source) {
    printUsage();
    process.exit(1);
  }

  const tilesetPath = ensureTilesetPath(path.resolve(options.source));
  if (!fs.existsSync(tilesetPath)) {
    console.error(`未找到 tileset.json：${tilesetPath}`);
    process.exit(1);
  }

  const raw = await fsp.readFile(tilesetPath, 'utf-8');
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const tileset = JSON.parse(normalized);
  if (!tileset.root) {
    console.error('tileset.json 缺少 root 节点。');
    process.exit(1);
  }

  const stats = {
    converted: 0,
    failed: 0,
    errors: [],
    parentRegionFilled: 0,
    parentRegionExpanded: 0,
  };

  processTile(tileset.root, stats, options, Matrix4.IDENTITY);
  propagateRegions(tileset.root, stats);

  if (stats.converted === 0) {
    console.warn('未找到需要转换的 boundingVolume.box。');
  } else {
    console.log(`已转换 ${stats.converted} 个 boundingVolume.box → region。`);
  }
  if (stats.failed > 0) {
    console.warn(`有 ${stats.failed} 个节点转换失败：`);
    stats.errors.slice(0, 10).forEach((err, idx) => {
      console.warn(`  ${idx + 1}. ${err}`);
    });
    if (stats.errors.length > 10) {
      console.warn('  ……');
    }
  }
  if (stats.parentRegionFilled > 0 || stats.parentRegionExpanded > 0) {
    console.log(
      `父节点 region 调整：从子节点填充 ${stats.parentRegionFilled} 个，扩展 ${stats.parentRegionExpanded} 个。`,
    );
  }

  const outputPath = options.output ? path.resolve(options.output) : tilesetPath;
  if (outputPath === tilesetPath) {
    const backupPath = `${tilesetPath}.${Date.now()}.bak.json`;
    await fsp.writeFile(backupPath, raw, 'utf-8');
    console.log(`已备份原文件：${backupPath}`);
  } else {
    await ensureDirectory(path.dirname(outputPath));
  }

  await fsp.writeFile(outputPath, `${JSON.stringify(tileset, null, 2)}${os.EOL}`, 'utf-8');
  console.log(`已写入：${outputPath}`);
}

main().catch((error) => {
  console.error('执行失败：', error.message);
  process.exit(1);
});
