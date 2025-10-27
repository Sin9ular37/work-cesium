import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 递归复制目录
function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const files = readdirSync(src);
  
  for (const file of files) {
    const srcPath = join(src, file);
    const destPath = join(dest, file);
    
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      try {
        copyFileSync(srcPath, destPath);
      } catch (error) {
        if (error.code === 'EBUSY' || error.code === 'EPERM') {
          console.warn(`[copy-assets] 文件被占用，跳过: ${srcPath}`);
          continue;
        }
        throw error;
      }
    }
  }
}

// 复制Cesium的资源文件
const srcAssetsPath = join(__dirname, '../node_modules/cesium/Build/Cesium');
const destAssetsPath = join(__dirname, '../dist/cesium');

console.log('正在复制 Cesium 资源文件...');
console.log(`源路径: ${srcAssetsPath}`);
console.log(`目标路径: ${destAssetsPath}`);

if (existsSync(srcAssetsPath)) {
  copyDir(srcAssetsPath, destAssetsPath);
  console.log('Cesium 资源文件复制完成！');
} else {
  console.error('未找到 Cesium 资源文件路径！');
  process.exit(1);
}
