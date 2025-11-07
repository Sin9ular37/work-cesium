#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const { promises: fsp } = fs;

const defaultOptions = {
  maxWarnings: 50,
  topDuplicateContents: 10,
};

function printUsage() {
  console.log(`用法：node scripts/analyze-tileset.js --source <目录或tileset.json> [选项]

必选参数：
  --source                         需要分析的 3D Tiles 目录或 tileset.json

常用选项：
  --maxWarnings <数值>             控制输出的最多告警数量，默认 50
  --topDuplicateContents <数值>    输出重复内容 URI 的最多条目，默认 10

示例：
  node scripts/analyze-tileset.js --source E:\\Tiles\\City
  node scripts/analyze-tileset.js --source tileset.json --maxWarnings 20
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
      case 'maxWarnings':
        options.maxWarnings = toPositiveInteger(value, defaultOptions.maxWarnings);
        break;
      case 'topDuplicateContents':
        options.topDuplicateContents = toPositiveInteger(
          value,
          defaultOptions.topDuplicateContents,
        );
        break;
      default:
        console.warn(`未知参数：--${key}（已忽略）`);
        break;
    }
  }
  return options;
}

async function resolveTilesetPath(source) {
  const resolved = path.resolve(source);
  const stat = await fsp.stat(resolved);
  if (stat.isDirectory()) {
    return {
      tilesetPath: path.join(resolved, 'tileset.json'),
      tilesetDir: resolved,
    };
  }
  return {
    tilesetPath: resolved,
    tilesetDir: path.dirname(resolved),
  };
}

async function ensureTilesetExists(filePath) {
  try {
    await fsp.access(filePath);
  } catch {
    throw new Error(`未找到 tileset.json：${filePath}`);
  }
}

function createStats() {
  return {
    totalTiles: 0,
    tilesWithContent: 0,
    tilesWithContentsArray: 0,
    tilesMissingBoundingVolume: 0,
    maxDepth: 0,
    depthCounts: new Map(),
    boundingVolumeTypes: new Map(),
    tilesWithRegion: 0,
    invalidRegions: 0,
    regionExtent: {
      west: Number.POSITIVE_INFINITY,
      south: Number.POSITIVE_INFINITY,
      east: Number.NEGATIVE_INFINITY,
      north: Number.NEGATIVE_INFINITY,
      minHeight: Number.POSITIVE_INFINITY,
      maxHeight: Number.NEGATIVE_INFINITY,
    },
    regionSpan: {
      lonMin: Number.POSITIVE_INFINITY,
      lonMax: Number.NEGATIVE_INFINITY,
      latMin: Number.POSITIVE_INFINITY,
      latMax: Number.NEGATIVE_INFINITY,
      heightMin: Number.POSITIVE_INFINITY,
      heightMax: Number.NEGATIVE_INFINITY,
    },
    geometricError: {
      count: 0,
      missing: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      zeroOrNegative: 0,
      nan: 0,
    },
    refineCounts: new Map(),
    contentUriCounts: new Map(),
    warnings: [],
  };
}

function classifyBoundingVolume(boundingVolume) {
  if (!boundingVolume || typeof boundingVolume !== 'object') {
    return 'none';
  }
  if (Array.isArray(boundingVolume.region) || boundingVolume.region) {
    return 'region';
  }
  if (Array.isArray(boundingVolume.box) || boundingVolume.box) {
    return 'box';
  }
  if (Array.isArray(boundingVolume.sphere) || boundingVolume.sphere) {
    return 'sphere';
  }
  return 'unknown';
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed);
  }
  return fallback;
}

function updateMapCounter(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function ensureArray(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (input) {
    return [input];
  }
  return [];
}

function recordWarning(stats, message) {
  stats.warnings.push(message);
}

function validateRegion(region) {
  if (!region) {
    return { valid: false, reason: '缺少数据' };
  }
  if (!Array.isArray(region)) {
    return { valid: false, reason: '类型不是数组' };
  }
  if (region.length !== 6) {
    return { valid: false, reason: `数组长度为 ${region.length}` };
  }
  for (let i = 0; i < region.length; i += 1) {
    if (!Number.isFinite(region[i])) {
      return { valid: false, reason: `第 ${i} 位不是有限数` };
    }
  }
  return { valid: true };
}

function updateRegionStats(stats, region) {
  const [west, south, east, north, minHeight, maxHeight] = region;

  stats.regionExtent.west = Math.min(stats.regionExtent.west, west);
  stats.regionExtent.south = Math.min(stats.regionExtent.south, south);
  stats.regionExtent.east = Math.max(stats.regionExtent.east, east);
  stats.regionExtent.north = Math.max(stats.regionExtent.north, north);
  stats.regionExtent.minHeight = Math.min(stats.regionExtent.minHeight, minHeight);
  stats.regionExtent.maxHeight = Math.max(stats.regionExtent.maxHeight, maxHeight);

  const lonSpan = Math.abs(east - west);
  const latSpan = Math.abs(north - south);
  const heightSpan = Math.abs(maxHeight - minHeight);

  stats.regionSpan.lonMin = Math.min(stats.regionSpan.lonMin, lonSpan);
  stats.regionSpan.lonMax = Math.max(stats.regionSpan.lonMax, lonSpan);
  stats.regionSpan.latMin = Math.min(stats.regionSpan.latMin, latSpan);
  stats.regionSpan.latMax = Math.max(stats.regionSpan.latMax, latSpan);
  stats.regionSpan.heightMin = Math.min(stats.regionSpan.heightMin, heightSpan);
  stats.regionSpan.heightMax = Math.max(stats.regionSpan.heightMax, heightSpan);
}

function checkChildRegion(parentRegion, childRegion, pathKey, stats) {
  if (!parentRegion || !childRegion) {
    return;
  }
  const EPS_LON_LAT = 1e-10;
  const EPS_HEIGHT = 1e-5;

  if (childRegion[0] + EPS_LON_LAT < parentRegion[0]) {
    recordWarning(stats, `${pathKey} 的西界小于父节点`);
  }
  if (childRegion[1] + EPS_LON_LAT < parentRegion[1]) {
    recordWarning(stats, `${pathKey} 的南界小于父节点`);
  }
  if (childRegion[2] - EPS_LON_LAT > parentRegion[2]) {
    recordWarning(stats, `${pathKey} 的东界超出父节点`);
  }
  if (childRegion[3] - EPS_LON_LAT > parentRegion[3]) {
    recordWarning(stats, `${pathKey} 的北界超出父节点`);
  }
  if (childRegion[4] + EPS_HEIGHT < parentRegion[4]) {
    recordWarning(stats, `${pathKey} 的最小高程低于父节点`);
  }
  if (childRegion[5] - EPS_HEIGHT > parentRegion[5]) {
    recordWarning(stats, `${pathKey} 的最大高程超出父节点`);
  }
}

function collectContentUris(content, stats, pathKey) {
  if (!content) {
    return;
  }
  const uri = content.uri || content.url;
  if (typeof uri === 'string' && uri.length > 0) {
    updateMapCounter(stats.contentUriCounts, uri);
  } else if (uri !== undefined) {
    recordWarning(stats, `${pathKey} 的 content.uri 类型异常`);
  }
}

function analyzeTile(tile, stats, depth, pathKey, parentRegion) {
  stats.totalTiles += 1;
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  updateMapCounter(stats.depthCounts, depth);

  const refine = tile.refine || '默认';
  updateMapCounter(stats.refineCounts, refine);

  const boundingVolumeType = classifyBoundingVolume(tile.boundingVolume);
  updateMapCounter(stats.boundingVolumeTypes, boundingVolumeType);

  let currentRegion;
  if (boundingVolumeType === 'region') {
    const region = Array.isArray(tile.boundingVolume.region)
      ? tile.boundingVolume.region
      : tile.boundingVolume.region && Array.isArray(tile.boundingVolume.region.value)
        ? tile.boundingVolume.region.value
        : tile.boundingVolume.region;
    const validation = validateRegion(region);
    if (validation.valid) {
      stats.tilesWithRegion += 1;
      currentRegion = [...region];
      updateRegionStats(stats, currentRegion);
      if (parentRegion) {
        checkChildRegion(parentRegion, currentRegion, pathKey, stats);
      }
    } else {
      stats.invalidRegions += 1;
      recordWarning(stats, `${pathKey} 的 region 无效：${validation.reason}`);
    }
  } else if (!tile.boundingVolume) {
    stats.tilesMissingBoundingVolume += 1;
    recordWarning(stats, `${pathKey} 缺少 boundingVolume`);
  }

  if (tile.geometricError === undefined || tile.geometricError === null) {
    stats.geometricError.missing += 1;
  } else if (!Number.isFinite(tile.geometricError)) {
    stats.geometricError.nan += 1;
    recordWarning(stats, `${pathKey} 的 geometricError 不是有限数`);
  } else {
    stats.geometricError.count += 1;
    stats.geometricError.min = Math.min(stats.geometricError.min, tile.geometricError);
    stats.geometricError.max = Math.max(stats.geometricError.max, tile.geometricError);
    if (tile.geometricError <= 0 && Array.isArray(tile.children) && tile.children.length > 0) {
      stats.geometricError.zeroOrNegative += 1;
      recordWarning(stats, `${pathKey} 的 geometricError ≤ 0 但仍有子节点`);
    }
  }

  const contentsArray = ensureArray(tile.contents);
  if (contentsArray.length > 0) {
    stats.tilesWithContentsArray += 1;
  }

  let hasPrimaryContent = false;
  if (tile.content) {
    hasPrimaryContent = true;
    collectContentUris(tile.content, stats, pathKey);
  }
  for (let i = 0; i < contentsArray.length; i += 1) {
    const childContent = contentsArray[i];
    collectContentUris(childContent, stats, `${pathKey}.contents[${i}]`);
    if (childContent.boundingVolume && Array.isArray(childContent.boundingVolume.region)) {
      checkChildRegion(currentRegion, childContent.boundingVolume.region, pathKey, stats);
    }
    if (childContent.uri || childContent.url) {
      hasPrimaryContent = true;
    }
  }

  if (hasPrimaryContent) {
    stats.tilesWithContent += 1;
  }

  if (!Array.isArray(tile.children)) {
    return;
  }

  for (let i = 0; i < tile.children.length; i += 1) {
    const child = tile.children[i];
    analyzeTile(child, stats, depth + 1, `${pathKey}/${i}`, currentRegion || parentRegion);
  }
}

function formatMap(map) {
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([key, value]) => ({ key, value }));
}

function formatMapByValue(map) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function printStats(stats, options) {
  console.log('分析结果：');
  console.log(`  总瓦片数：${stats.totalTiles}`);
  console.log(`  最大深度：${stats.maxDepth}`);
  console.log(`  含 content 的瓦片：${stats.tilesWithContent}`);
  console.log(`  使用 contents 数组的瓦片：${stats.tilesWithContentsArray}`);
  console.log(`  缺少 boundingVolume 的节点：${stats.tilesMissingBoundingVolume}`);

  console.log('\n深度分布：');
  for (const entry of formatMap(stats.depthCounts)) {
    console.log(`  深度 ${entry.key}：${entry.value}`);
  }

  console.log('\nboundingVolume 类型统计：');
  for (const [key, value] of formatMapByValue(stats.boundingVolumeTypes)) {
    console.log(`  ${key}：${value}`);
  }

  console.log('\nregion 统计：');
  console.log(`  含 region 的瓦片：${stats.tilesWithRegion}`);
  console.log(`  无效 region 数量：${stats.invalidRegions}`);
  if (stats.tilesWithRegion > 0) {
    console.log('  region 覆盖范围：');
    console.log(`    经度：${stats.regionExtent.west} ~ ${stats.regionExtent.east}`);
    console.log(`    纬度：${stats.regionExtent.south} ~ ${stats.regionExtent.north}`);
    console.log(`    高程：${stats.regionExtent.minHeight} ~ ${stats.regionExtent.maxHeight}`);
    console.log('  region 跨度（极值）：');
    console.log(`    经度跨度：${stats.regionSpan.lonMin} ~ ${stats.regionSpan.lonMax}`);
    console.log(`    纬度跨度：${stats.regionSpan.latMin} ~ ${stats.regionSpan.latMax}`);
    console.log(`    高程跨度：${stats.regionSpan.heightMin} ~ ${stats.regionSpan.heightMax}`);
  }

  console.log('\n几何误差统计：');
  console.log(`  有效 geometricError 数量：${stats.geometricError.count}`);
  console.log(`  geometricError 缺失：${stats.geometricError.missing}`);
  console.log(`  geometricError ≤ 0 且有子节点：${stats.geometricError.zeroOrNegative}`);
  console.log(`  geometricError 非有限数：${stats.geometricError.nan}`);
  if (stats.geometricError.count > 0) {
    console.log(`  geometricError 范围：${stats.geometricError.min} ~ ${stats.geometricError.max}`);
  }

  console.log('\nrefine 统计：');
  for (const [key, value] of formatMapByValue(stats.refineCounts)) {
    console.log(`  ${key}：${value}`);
  }

  const duplicateContents = formatMapByValue(stats.contentUriCounts).filter(
    ([, count]) => count > 1,
  );
  console.log('\n内容 URI 统计：');
  console.log(`  唯一 URI 数量：${stats.contentUriCounts.size}`);
  console.log(`  重复 URI 数量：${duplicateContents.length}`);
  if (duplicateContents.length > 0) {
    console.log(`  重复 URI（最多 ${options.topDuplicateContents} 条）：`);
    duplicateContents.slice(0, options.topDuplicateContents).forEach(([uri, count]) => {
      console.log(`    ${uri}：${count}`);
    });
  }

  if (stats.warnings.length > 0) {
    console.log(`\n发现潜在问题（共 ${stats.warnings.length} 条，展示前 ${options.maxWarnings} 条）：`);
    stats.warnings.slice(0, options.maxWarnings).forEach((warning, index) => {
      console.log(`  [${index + 1}] ${warning}`);
    });
    if (stats.warnings.length > options.maxWarnings) {
      console.log(`  ... 还有 ${stats.warnings.length - options.maxWarnings} 条未显示`);
    }
  } else {
    console.log('\n未检测到明显异常。');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source) {
    printUsage();
    process.exit(1);
  }

  const { tilesetPath } = await resolveTilesetPath(options.source);
  await ensureTilesetExists(tilesetPath);

  const raw = await fsp.readFile(tilesetPath, 'utf-8');
  const tileset = JSON.parse(raw);
  if (!tileset.root) {
    throw new Error('tileset.json 缺少 root 节点，无法分析。');
  }

  const stats = createStats();
  analyzeTile(tileset.root, stats, 0, 'root', null);
  printStats(stats, options);

  const reportPath = path.join(
    path.dirname(tilesetPath),
    `tileset-analysis-${Date.now()}.json`,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    source: tilesetPath,
    summary: {
      totalTiles: stats.totalTiles,
      maxDepth: stats.maxDepth,
      tilesWithContent: stats.tilesWithContent,
      tilesWithRegion: stats.tilesWithRegion,
      geometricErrorRange:
        stats.geometricError.count > 0
          ? [stats.geometricError.min, stats.geometricError.max]
          : null,
      warnings: stats.warnings.length,
    },
  };
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}${os.EOL}`, 'utf-8');
  console.log(`\n已生成简要报告：${reportPath}`);
}

main().catch((err) => {
  console.error('\n执行失败：', err.message);
  process.exit(1);
});
