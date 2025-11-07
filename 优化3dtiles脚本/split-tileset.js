#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const { promises: fsp } = fs;

const defaultOptions = {
  groupSize: 256,
  force: false,
  mode: 'children',
};

function printUsage() {
  console.log(`用法：node scripts/split-tileset.js --source <目录或tileset.json> --output <输出目录> [选项]

必选参数：
  --source              原始 3D Tiles 目录或 tileset.json
  --output              拆分后的输出目录（不存在时自动创建）

常用选项：
  --groupSize <数值>    每个子 tileset 包含的 root 子节点数量，默认 256
  --force               如果输出目录存在则覆盖

说明：
  当前脚本按 root.children 分组拆分。若原 tileset 缺少 root 或没有子节点，则无法拆分。
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
      case 'groupSize':
        options.groupSize = toPositiveInteger(value, defaultOptions.groupSize);
        break;
      case 'force':
        options.force = value === 'true';
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

async function ensureOutputDirectory(outDir, force) {
  const exists = await pathExists(outDir);
  if (exists) {
    if (!force) {
      throw new Error(`输出目录已存在：${outDir}。如需覆盖请添加 --force`);
    }
    await fsp.rm(outDir, { recursive: true, force: true });
  }
  await fsp.mkdir(outDir, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function regionUnion(regions) {
  const valid = regions.filter((region) => Array.isArray(region) && region.length === 6);
  if (valid.length === 0) {
    return undefined;
  }
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (const region of valid) {
    west = Math.min(west, region[0]);
    south = Math.min(south, region[1]);
    east = Math.max(east, region[2]);
    north = Math.max(north, region[3]);
    minHeight = Math.min(minHeight, region[4]);
    maxHeight = Math.max(maxHeight, region[5]);
  }
  return [west, south, east, north, minHeight, maxHeight];
}

function extractRegionFromBoundingVolume(bv) {
  if (!bv) return undefined;
  if (Array.isArray(bv.region)) return [...bv.region];
  if (bv.region && typeof bv.region === 'object') {
    const { west, south, east, north, minHeight, maxHeight } = bv.region;
    if (
      [west, south, east, north, minHeight, maxHeight].every((value) => Number.isFinite(value))
    ) {
      return [west, south, east, north, minHeight, maxHeight];
    }
  }
  return undefined;
}

function extractChildRegions(children) {
  const regions = [];
  for (const child of children) {
    const region =
      extractRegionFromBoundingVolume(child.boundingVolume) ||
      (child.content ? extractRegionFromBoundingVolume(child.content.boundingVolume) : undefined);
    if (region) {
      regions.push(region);
    }
  }
  return regions;
}

function createChildTilesetTemplate(tileset, childGroup) {
  const template = {
    asset: { ...tileset.asset },
    properties: tileset.properties ? { ...tileset.properties } : undefined,
    geometricError: tileset.geometricError,
    root: {
      ...tileset.root,
    },
  };
  const childRegions = extractChildRegions(childGroup);
  const mergedRegion = regionUnion(childRegions);
  const rootBoundingVolume = { ...(tileset.root.boundingVolume || {}) };
  if (mergedRegion) {
    rootBoundingVolume.region = mergedRegion;
  }
  const childRoot = {
    boundingVolume: rootBoundingVolume,
    geometricError: tileset.root.geometricError,
    refine: tileset.root.refine,
    transform: tileset.root.transform,
    children: childGroup.map((child) => JSON.parse(JSON.stringify(child))),
  };
  if (tileset.root.content) {
    childRoot.content = JSON.parse(JSON.stringify(tileset.root.content));
  } else {
    delete childRoot.content;
  }
  delete childRoot.contents;
  template.root = childRoot;
  return template;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source || !options.output) {
    printUsage();
    process.exit(1);
  }
  if (options.groupSize <= 0) {
    throw new Error('--groupSize 必须为正整数');
  }

  const sourceResolved = path.resolve(options.source);
  const outputResolved = path.resolve(options.output);

  const sourceStat = await fsp.stat(sourceResolved);
  const sourceTilesetPath = sourceStat.isDirectory()
    ? path.join(sourceResolved, 'tileset.json')
    : sourceResolved;

  if (!(await pathExists(sourceTilesetPath))) {
    throw new Error(`未找到 tileset.json：${sourceTilesetPath}`);
  }

  await ensureOutputDirectory(outputResolved, options.force);

  const rawJson = await fsp.readFile(sourceTilesetPath, 'utf-8');
  const tileset = JSON.parse(rawJson);
  if (!tileset.root) {
    throw new Error('tileset.json 缺少 root 节点，无法拆分。');
  }
  if (!Array.isArray(tileset.root.children) || tileset.root.children.length === 0) {
    throw new Error('root.children 为空，无法按子节点拆分。');
  }

  const groups = [];
  let current = [];
  for (const child of tileset.root.children) {
    current.push(child);
    if (current.length >= options.groupSize) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }

  const manifest = [];
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const childTileset = createChildTilesetTemplate(tileset, group);
    const partName = `tileset-part-${String(i + 1).padStart(3, '0')}`;
    const targetDir = path.join(outputResolved, partName);
    await fsp.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, 'tileset.json');
    await fsp.writeFile(targetPath, `${JSON.stringify(childTileset, null, 2)}${os.EOL}`, 'utf-8');
    manifest.push({
      name: partName,
      tiles: group.length,
      path: targetPath,
    });
  }

  await fsp.writeFile(
    path.join(outputResolved, 'manifest.json'),
    `${JSON.stringify(
      {
        source: sourceTilesetPath,
        totalTiles: tileset.root.children.length,
        groupSize: options.groupSize,
        outputs: manifest,
      },
      null,
      2,
    )}${os.EOL}`,
    'utf-8',
  );

  console.log('拆分完成：');
  console.log(`  原 root 子节点数：${tileset.root.children.length}`);
  console.log(`  输出子 tileset 数量：${manifest.length}`);
  console.log(`  输出目录：${outputResolved}`);
}

main().catch((err) => {
  console.error('\n执行失败：', err.message);
  process.exit(1);
});
