#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const { promises: fsp } = fs;

const defaultOptions = {
  splitLevel: 2,
  force: false,
};

function printUsage() {
  console.log(`用法：node scripts/split-tileset-standalone.js --source <tileset或目录> --output <输出目录> [选项]

必选参数：
  --source                  原始 3D Tiles 目录或 tileset.json
  --output                  拆分后的输出目录（只会写多个独立 tileset）

常用选项：
  --splitLevel <数值>       从第几层节点开始生成独立 tileset（root 为 0），默认 2
  --force                   输出目录存在时覆盖

说明：
  - 该脚本会遍历至 splitLevel 层，为该层每个节点及其子树生成一个独立 tileset。
  - 原 tileset 不会修改，输出目录仅包含若干子 tileset 和 manifest.json。
`);
}

function parseArgs(argv) {
  const options = { ...defaultOptions };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
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
      case 'splitLevel':
        options.splitLevel = Math.max(1, Number(value));
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

async function ensureOutputDir(dirPath, force) {
  const exists = await pathExists(dirPath);
  if (exists) {
    if (!force) {
      throw new Error(`输出目录已存在：${dirPath}。如需覆盖请添加 --force`);
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

function collectNodesAtLevel(root, targetLevel) {
  const result = [];
  const stack = [{ node: root, depth: 0, path: 'root' }];
  while (stack.length > 0) {
    const { node, depth, path: nodePath } = stack.pop();
    if (depth === targetLevel) {
      result.push({ node, path: nodePath });
      continue;
    }
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push({
          node: node.children[i],
          depth: depth + 1,
          path: `${nodePath}/${i}`,
        });
      }
    }
  }
  return result;
}

function buildStandaloneTileset(template, node) {
  return {
    asset: { ...template.asset },
    properties: template.properties ? { ...template.properties } : undefined,
    geometricError: template.geometricError,
    root: JSON.parse(JSON.stringify(node)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source || !options.output) {
    printUsage();
    process.exit(1);
  }

  const { tilesetPath } = await resolveTilesetPath(options.source);
  await ensureExists(tilesetPath);

  const outputDir = path.resolve(options.output);
  await ensureOutputDir(outputDir, options.force);

  const raw = await fsp.readFile(tilesetPath, 'utf-8');
  const tileset = JSON.parse(raw);
  if (!tileset.root) {
    throw new Error('tileset.json 缺少 root 节点，无法拆分。');
  }

  const splitLevel = Math.max(1, Number(options.splitLevel));
  const nodes = collectNodesAtLevel(tileset.root, splitLevel);
  if (nodes.length === 0) {
    throw new Error(`在深度 ${splitLevel} 找不到可拆分的节点。`);
  }

  const outputs = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const { node, path: nodePath } = nodes[i];
    const childTileset = buildStandaloneTileset(tileset, node);
    const partName = `tileset-standalone-level${splitLevel}-${String(i + 1).padStart(4, '0')}`;
    const partDir = path.join(outputDir, partName);
    await fsp.mkdir(partDir, { recursive: true });
    const partPath = path.join(partDir, 'tileset.json');
    await fsp.writeFile(partPath, `${JSON.stringify(childTileset, null, 2)}${os.EOL}`, 'utf-8');
    outputs.push({ nodePath, output: partPath });
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        source: tilesetPath,
        splitLevel,
        count: outputs.length,
        outputs,
      },
      null,
      2,
    )}${os.EOL}`,
    'utf-8',
  );

  console.log('拆分完成（独立模式）：');
  console.log(`  指定层级：${splitLevel}`);
  console.log(`  生成子 tileset 数量：${outputs.length}`);
  console.log(`  输出目录：${outputDir}`);
  console.log(`  manifest：${manifestPath}`);
}

main().catch((err) => {
  console.error('\n执行失败：', err.message);
  process.exit(1);
});
