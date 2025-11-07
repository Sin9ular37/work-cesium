#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';

const { promises: fsp } = fs;

const defaultOptions = {
  splitLevel: 2,
  force: false,
  keepOriginal: false,
};

function printUsage() {
  console.log(`用法：node scripts/split-tileset-external.js --source <tileset或目录> --output <输出目录> [选项]

必选参数：
  --source                  原始 3D Tiles 目录或 tileset.json
  --output                  拆分后的输出目录（会写入主 tileset 和子 tileset）

常用选项：
  --splitLevel <数值>       从第几层节点开始生成子 tileset（root 为 0），默认 2
  --keepOriginal            不修改原 tileset，只将结果写到 output 目录
  --force                   输出目录存在时覆盖

说明：
  - 该脚本会保留 0~splitLevel-1 层结构，从 splitLevel 层起为每个节点生成独立 tileset，并将主 tileset 中该节点替换为 external tileset。
  - 输出目录下包含：
      master/tileset.json  （修改后的主 tileset）
      tileset-part-XXX/tileset.json （各子 tileset）
      manifest.json        （记录每个子 tileset 的路径与原节点位置）
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
      case 'keepOriginal':
        options.keepOriginal = value === 'true';
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

async function ensureOutputDir(outDir, force) {
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

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function buildChildTilesetTemplate(templateTileset, childNode) {
  const template = {
    asset: { ...templateTileset.asset },
    properties: templateTileset.properties ? { ...templateTileset.properties } : undefined,
    geometricError: templateTileset.geometricError,
    root: cloneNode(childNode),
  };
  return template;
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

function replaceNodeWithExternal(root, targetNode, externalUri) {
  const stack = [{ parent: null, node: root, index: null }];
  while (stack.length > 0) {
    const { parent, node, index } = stack.pop();
    if (node === targetNode && parent !== null && index !== null) {
      const replacement = {
        boundingVolume: cloneNode(node.boundingVolume),
        refine: node.refine,
        geometricError: node.geometricError,
        transform: node.transform,
        content: { uri: externalUri },
      };
      parent.children[index] = replacement;
      return true;
    }
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push({ parent: node, node: node.children[i], index: i });
      }
    }
  }
  return false;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.source || !options.output) {
    printUsage();
    process.exit(1);
  }

  const { tilesetPath, rootDir } = await resolveTilesetPath(options.source);
  await ensureExists(tilesetPath);

  const outputDir = path.resolve(options.output);
  await ensureOutputDir(outputDir, options.force);
  const masterDir = path.join(outputDir, 'master');
  await fsp.mkdir(masterDir, { recursive: true });

  const raw = await fsp.readFile(tilesetPath, 'utf-8');
  const tileset = JSON.parse(raw);
  if (!tileset.root) {
    throw new Error('tileset.json 缺少 root 节点，无法拆分。');
  }

  const splitLevel = Math.max(1, Number(options.splitLevel));
  const candidates = collectNodesAtLevel(tileset.root, splitLevel);
  if (candidates.length === 0) {
    throw new Error(`在深度 ${splitLevel} 找不到可拆分的节点。`);
  }

  const manifest = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const { node, path: nodePath } = candidates[i];
    const childTileset = buildChildTilesetTemplate(tileset, node);
    const partName = `tileset-level${splitLevel}-${String(i + 1).padStart(4, '0')}`;
    const partDir = path.join(outputDir, partName);
    await fsp.mkdir(partDir, { recursive: true });
    const childPath = path.join(partDir, 'tileset.json');
    await fsp.writeFile(childPath, `${JSON.stringify(childTileset, null, 2)}${os.EOL}`, 'utf-8');

    const relativePath = path.relative(masterDir, childPath).replace(/\\/g, '/');
    replaceNodeWithExternal(tileset.root, node, relativePath);
    manifest.push({ nodePath, output: childPath });
  }

  const masterPath = path.join(masterDir, 'tileset.json');
  await fsp.writeFile(masterPath, `${JSON.stringify(tileset, null, 2)}${os.EOL}`, 'utf-8');

  const manifestPath = path.join(outputDir, 'manifest.json');
  await fsp.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        source: tilesetPath,
        splitLevel,
        totalChildren: candidates.length,
        master: masterPath,
        outputs: manifest,
      },
      null,
      2,
    )}${os.EOL}`,
    'utf-8',
  );

  if (options.keepOriginal === false) {
    await fsp.copyFile(masterPath, tilesetPath);
    console.log(`已将主 tileset 回写到原路径：${tilesetPath}`);
  }

  console.log('拆分完成（外链模式）：');
  console.log(`  指定层级：${splitLevel}`);
  console.log(`  子 tileset 数量：${manifest.length}`);
  console.log(`  master 输出：${masterPath}`);
  console.log(`  manifest：${manifestPath}`);
}

main().catch((err) => {
  console.error('\n执行失败：', err.message);
  process.exit(1);
});
