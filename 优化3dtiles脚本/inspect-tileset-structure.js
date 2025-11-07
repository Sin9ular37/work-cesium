#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const { promises: fsp } = fs;

const defaultOptions = {
  warnLimit: 20,
};

function printUsage() {
  console.log(`用法：node scripts/inspect-tileset-structure.js --source <目录或tileset.json> [选项]

必选参数：
  --source             需要分析的 3D Tiles 目录或 tileset.json

可选参数：
  --report <路径>      将分析结果写入指定 JSON 文件，默认写到 tileset 同目录
  --warnLimit <数值>   警告示例最多输出条数，默认 20
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
      case 'report':
        options.report = value;
        break;
      case 'warnLimit':
        options.warnLimit = toPositiveInteger(value, defaultOptions.warnLimit);
        break;
      default:
        console.warn(`未知参数：--${key}（已忽略）`);
        break;
    }
  }
  return options;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed);
  }
  return fallback;
}

async function resolveTilesetPath(source) {
  const resolved = path.resolve(source);
  const stat = await fsp.stat(resolved);
  if (stat.isDirectory()) {
    return {
      tilesetPath: path.join(resolved, 'tileset.json'),
      rootDir: resolved,
    };
  }
  return {
    tilesetPath: resolved,
    rootDir: path.dirname(resolved),
  };
}

async function ensureExists(filePath) {
  try {
    await fsp.access(filePath);
  } catch {
    throw new Error(`未找到 tileset.json：${filePath}`);
  }
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

function classifyContentType(content) {
  if (!content || typeof content !== 'object') {
    return 'none';
  }
  const uri = content.uri || content.url;
  if (typeof uri !== 'string' || uri.length === 0) {
    return 'unknown';
  }
  const lower = uri.toLowerCase();
  if (lower.endsWith('.b3dm')) return 'b3dm';
  if (lower.endsWith('.i3dm')) return 'i3dm';
  if (lower.endsWith('.cmpt')) return 'cmpt';
  if (lower.endsWith('.json')) return 'external';
  if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return 'glb';
  return 'other';
}

function updateMapCounter(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function recordWarning(warnings, key, entry, limit) {
  if (!warnings[key]) {
    warnings[key] = [];
  }
  if (warnings[key].length < limit) {
    warnings[key].push(entry);
  }
}

function analyzeTileset(tileset, warnLimit) {
  const metrics = {
    totalNodes: 0,
    leafNodes: 0,
    internalNodes: 0,
    maxDepth: 0,
    depthCounts: new Map(),
    boundingVolumeTypes: new Map(),
    boundingVolumeMissing: 0,
    refineCounts: new Map(),
    transformUsage: { withTransform: 0, withoutTransform: 0 },
    geometricError: {
      count: 0,
      missing: 0,
      zeroOrLess: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      sum: 0,
    },
    childCount: new Map(),
    contentTypes: new Map(),
    nodesWithContentsArray: 0,
    externalTilesets: 0,
    warnings: {},
  };

  const stack = [{ node: tileset.root, depth: 0, path: 'root' }];

  while (stack.length > 0) {
    const { node, depth, path: nodePath } = stack.pop();
    metrics.totalNodes += 1;
    metrics.maxDepth = Math.max(metrics.maxDepth, depth);
    updateMapCounter(metrics.depthCounts, depth);

    const childCount = Array.isArray(node.children) ? node.children.length : 0;
    updateMapCounter(metrics.childCount, childCount);
    if (childCount === 0) {
      metrics.leafNodes += 1;
    } else {
      metrics.internalNodes += 1;
    }

    if (node.transform) {
      metrics.transformUsage.withTransform += 1;
    } else {
      metrics.transformUsage.withoutTransform += 1;
    }

    const bvType = classifyBoundingVolume(node.boundingVolume);
    updateMapCounter(metrics.boundingVolumeTypes, bvType);
    if (bvType === 'none' || bvType === 'unknown') {
      metrics.boundingVolumeMissing += 1;
      recordWarning(
        metrics.warnings,
        'missingBoundingVolume',
        { path: nodePath },
        warnLimit,
      );
    }

    const refine = node.refine || tileset.root.refine || 'ADD';
    updateMapCounter(metrics.refineCounts, refine);

    if (node.geometricError === undefined || node.geometricError === null) {
      metrics.geometricError.missing += 1;
      recordWarning(metrics.warnings, 'missingGeometricError', { path: nodePath }, warnLimit);
    } else if (!Number.isFinite(node.geometricError)) {
      metrics.geometricError.zeroOrLess += 1;
      recordWarning(metrics.warnings, 'invalidGeometricError', { path: nodePath }, warnLimit);
    } else {
      metrics.geometricError.count += 1;
      metrics.geometricError.min = Math.min(metrics.geometricError.min, node.geometricError);
      metrics.geometricError.max = Math.max(metrics.geometricError.max, node.geometricError);
      metrics.geometricError.sum += node.geometricError;
      if (node.geometricError <= 0) {
        metrics.geometricError.zeroOrLess += 1;
        recordWarning(metrics.warnings, 'nonPositiveGeometricError', { path: nodePath }, warnLimit);
      }
    }

    if (node.content) {
      const type = classifyContentType(node.content);
      updateMapCounter(metrics.contentTypes, type);
      if (type === 'external') {
        metrics.externalTilesets += 1;
      }
    } else {
      updateMapCounter(metrics.contentTypes, 'none');
    }

    if (Array.isArray(node.contents) && node.contents.length > 0) {
      metrics.nodesWithContentsArray += 1;
      node.contents.forEach((content, idx) => {
        const type = classifyContentType(content);
        updateMapCounter(metrics.contentTypes, `contents:${type}`);
        if (type === 'external') {
          metrics.externalTilesets += 1;
        }
        if (!content.boundingVolume) {
          recordWarning(
            metrics.warnings,
            'contentMissingBoundingVolume',
            { path: `${nodePath}.contents[${idx}]` },
            warnLimit,
          );
        }
      });
    }

    if (childCount > 0) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push({
          node: node.children[i],
          depth: depth + 1,
          path: `${nodePath}/${i}`,
        });
      }
    }
  }

  return metrics;
}

function mapToSortedArray(map) {
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => {
      if (typeof a.key === 'number' && typeof b.key === 'number') {
        return a.key - b.key;
      }
      return String(a.key).localeCompare(String(b.key));
    });
}

function buildReport(metrics) {
  const avgGeError =
    metrics.geometricError.count > 0
      ? metrics.geometricError.sum / metrics.geometricError.count
      : undefined;

  return {
    totals: {
      totalNodes: metrics.totalNodes,
      leafNodes: metrics.leafNodes,
      internalNodes: metrics.internalNodes,
      maxDepth: metrics.maxDepth,
    },
    depthDistribution: mapToSortedArray(metrics.depthCounts),
    boundingVolumeTypes: mapToSortedArray(metrics.boundingVolumeTypes),
    refineCounts: mapToSortedArray(metrics.refineCounts),
    transformUsage: metrics.transformUsage,
    geometricError: {
      counted: metrics.geometricError.count,
      missing: metrics.geometricError.missing,
      nonPositiveOrInvalid: metrics.geometricError.zeroOrLess,
      min: Number.isFinite(metrics.geometricError.min) ? metrics.geometricError.min : null,
      max: Number.isFinite(metrics.geometricError.max) ? metrics.geometricError.max : null,
      average: avgGeError,
    },
    childCountDistribution: mapToSortedArray(metrics.childCount),
    contentTypes: mapToSortedArray(metrics.contentTypes),
    nodesWithContentsArray: metrics.nodesWithContentsArray,
    externalTilesets: metrics.externalTilesets,
    boundingVolumeMissing: metrics.boundingVolumeMissing,
    warnings: metrics.warnings,
  };
}

function printSummary(report) {
  console.log('=== Tileset 结构概览 ===');
  console.log(`节点总数：${report.totals.totalNodes}（叶子 ${report.totals.leafNodes}，内部 ${report.totals.internalNodes}）`);
  console.log(`最大深度：${report.totals.maxDepth}`);
  console.log('深度分布：');
  report.depthDistribution.forEach((entry) => {
    console.log(`  深度 ${entry.key}：${entry.value}`);
  });
  console.log('boundingVolume 类型：');
  report.boundingVolumeTypes.forEach((entry) => {
    console.log(`  ${entry.key}：${entry.value}`);
  });
  console.log('refine 统计：');
  report.refineCounts.forEach((entry) => {
    console.log(`  ${entry.key}：${entry.value}`);
  });
  console.log('boundingVolume 缺失节点：', report.boundingVolumeMissing);
  console.log('外链 tileset 数量：', report.externalTilesets);
  console.log('几何误差：');
  console.log(
    `  已统计 ${report.geometricError.counted} 个，缺失 ${report.geometricError.missing}，非正 ${report.geometricError.nonPositiveOrInvalid}`,
  );
  if (report.geometricError.min !== null) {
    console.log(
      `  范围 ${report.geometricError.min} ~ ${report.geometricError.max}，平均 ${report.geometricError.average}`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source) {
    printUsage();
    process.exit(1);
  }

  const { tilesetPath, rootDir } = await resolveTilesetPath(options.source);
  await ensureExists(tilesetPath);

  const raw = await fsp.readFile(tilesetPath, 'utf-8');
  const tileset = JSON.parse(raw);
  if (!tileset.root) {
    throw new Error('tileset.json 缺少 root 节点，无法分析。');
  }

  const metrics = analyzeTileset(tileset, options.warnLimit);
  const report = buildReport(metrics);
  printSummary(report);

  const reportPath =
    options.report ||
    path.join(
      rootDir,
      `tileset-structure-${Date.now()}.json`,
    );
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}${os.EOL}`, 'utf-8');
  console.log(`\n已输出详细报告：${reportPath}`);
}

main().catch((err) => {
  console.error('\n执行失败：', err.message);
  process.exit(1);
});
