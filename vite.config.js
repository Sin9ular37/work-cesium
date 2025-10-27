import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BASE = '/cesiumview/'

export default defineConfig({
  base: BASE, // 设置基础路径
  plugins: [
    vue(),
    cesium({
      // 确保在生产环境中正确复制 Cesium 资源
      rebuildCesium: false
    })
  ],
  resolve: {
    alias: {
      cesium: resolve(__dirname, 'node_modules/cesium')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {}
    }
  },
  // 添加构建配置以确保 Cesium 正确工作
  build: {
    rollupOptions: {
      external: ['http', 'https', 'url', 'zlib']
    }
  },
  // 确保 Cesium 资源正确加载
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${BASE}Cesium`)
  },
  // 开发服务器配置，支持本地文件访问
  server: {
    fs: {
      // 允许访问项目根目录之外的文件（添加常用盘符与具体目录）
      allow: [
        "..",
        ".",
        "C:/",
        "D:/",
        "E:/",
        // 明确允许包含中文目录的路径（按你的数据实际位置调整/追加）
        "E:/松北区/"
      ],
      // 关闭严格模式，允许 @fs 访问任意绝对路径
      strict: false
    },
    // 避免监听巨量瓦片文件导致内存爆掉
    watch: {
      ignored: ["**/public/tiles/**", "**/public/3dtiles-001/**"]
    },
    // 将 /cesiumview/tiles/* 代理到本地独立静态服务器（避免把500G目录挂进Vite进程）
    proxy: {
      [`${BASE}tiles`]: {
        target: "http://127.0.0.1:8081",
        changeOrigin: true,
        rewrite: (p) => p.replace(new RegExp(`^${BASE.replace(/\//g, "\\/")}tiles`), "")
      }
    }
  }
})
