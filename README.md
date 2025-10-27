# 哈尔滨Cesium三维可视化项目

一个基于Vue 3 + Cesium的哈尔滨市三维地理信息系统，提供建筑模型展示、区域划分、智能测量和自动标注等核心功能。项目支持在线/离线双模式运行，特别适合城市规划展示和地理数据可视化。

## ✨ 核心功能

### 🏢 三维建筑模型
- **3D Tiles支持** - 基于Cesium 3D Tiles的高性能建筑模型展示
- **智能显示切换** - 根据缩放级别自动切换2D/3D显示模式
- **滞回算法** - 避免在阈值附近频繁切换，提供流畅的用户体验
- **性能优化** - 按需渲染、限帧控制、内存管理

### 🗺️ 地理数据可视化
- **区域划分** - GeoJSON数据驱动的哈尔滨行政区划展示
- **自动标注** - 基于3D Tiles高度的智能标注系统
- **属性拾取** - 点击建筑获取详细属性信息
- **数据调试** - 内置GeoJSON对象属性打印工具

### 📏 智能测量工具
- **三维距离测量** - 支持水平距离、垂直高度差、3D直线距离
- **实时预览** - 鼠标移动时显示预览线
- **多段测量** - 支持多点连续测量
- **视觉反馈** - 不同颜色区分水平、垂直、3D距离

### 🌐 双模式运行
- **在线模式** - 支持ArcGIS底图、在线地形数据
- **离线模式** - 完全离线运行，支持本地数据部署
- **智能回退** - 网络异常时自动切换到离线模式

## 🛠️ 技术栈

- **前端框架**: Vue 3 (Composition API)
- **状态管理**: Pinia 2.1.7
- **路由**: Vue Router 4.5.1
- **三维引擎**: Cesium 1.131.0
- **构建工具**: Vite 6.3.5
- **地图服务**: ArcGIS 4.28
- **HTTP客户端**: Axios 1.10.0

## 📁 项目结构

\\\
work-cesium-view/
├── public/                          # 静态资源目录
│   ├── a605d-main/                  # 本地影像瓦片
│   ├── example-3dtiles/             # 3D Tiles数据
│   ├── ceshi.geojson               # 区域GeoJSON数据
│   └── Cesium/                     # Cesium静态资源
├── src/
│   ├── components/
│   │   └── CesiumView.vue          # 主三维视图组件
│   ├── config/
│   │   ├── cesiumConfig.js         # Cesium基础配置
│   │   ├── offlineConfig.js        # 离线模式配置
│   │   └── tilesetsConfig.js       # 3D Tiles配置
│   ├── stores/
│   │   └── cesiumStore.js          # Pinia状态管理
│   ├── utils/
│   │   ├── autoLabelFromGeojson.js # 自动标注工具
│   │   ├── cesiumUtils.js          # Cesium工具类
│   │   ├── geojsonDebugInspector.js # GeoJSON调试工具
│   │   ├── tilesDebugInspector.js  # 3D Tiles调试工具
│   │   └── tilesetLoader.js        # 3D Tiles加载器
│   ├── router/
│   │   └── index.js                # 路由配置
│   ├── App.vue                     # 根组件
│   └── main.js                     # 入口文件
├── scripts/
│   └── copy-cesium-assets.js       # Cesium资源复制脚本
├── package.json
├── vite.config.js
└── README.md
\\\

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- 支持WebGL 2.0的现代浏览器

### 安装依赖

\\\ash
npm install
\\\

### 开发模式

\\\ash
# 在线模式（默认）
npm run dev

# 离线模式
# 创建 .env.development 文件，设置 VITE_OFFLINE_MODE=true
npm run dev
\\\

### 生产构建

\\\ash
# 构建生产版本（自动复制Cesium资源）
npm run build

# 手动复制Cesium资源（如需要）
npm run copy-assets
\\\

### 预览生产版本

\\\ash
npm run preview
\\\

## 🎮 使用指南

### 基本操作

1. **显示/隐藏区域** - 点击
显示区域按钮切换哈尔滨行政区划
2. **距离测量** - 点击距离测量按钮，在地图上点击测量点
3. **重置视图** - 点击重置视图按钮回到默认视角
4. **测试功能** - 使用测试工具栏进行功能调试

### 测试功能

项目内置了多个测试工具，便于开发和调试：

- **仅3DTiles模式** - 强制显示3D建筑模型，隐藏底图
- **属性拾取** - 点击建筑获取坐标和属性信息
- **打印GeoJSON** - 在控制台输出GeoJSON对象属性
- **自动标注** - 基于3D Tiles高度自动生成区域标注

### 性能优化

项目已内置多项性能优化措施：

- **场景优化** - 关闭不必要的渲染效果（HDR、雾效、天空等）
- **按需渲染** - 启用requestRenderMode，减少不必要的重绘
- **限帧控制** - 最大渲染时间限制，保持稳定帧率
- **内存管理** - 及时清理不需要的实体和资源
- **WebGL优化** - 上下文丢失恢复、尺寸观察器

## ⚙️ 配置说明

### 离线模式配置

在 \src/config/offlineConfig.js\ 中配置离线模式：

\\\javascript
export const OFFLINE_CONFIG = {
  isOfflineMode: true, // 生产环境强制离线
  localDataSources: {
    imagery: \\a605d-main/a605d-main/233/233_Level_6.png\,
    models: \\example-3dtiles/tileset.json\,
    geospatial: \\ceshi.geojson\
  }
}
\\\

### 3D Tiles配置

在 \src/config/tilesetsConfig.js\ 中配置3D Tiles服务：

\\\javascript
export const TILESET_SERVICES = {
  development: {
    baseUrl: \http://localhost:8888\,
    buildings: \/tileset.json\
  },
  production: {
    baseUrl: \http://localhost:8899\, 
    buildings: \/tileset.json\
  }
}
\\\

### 构建配置

在 \ite.config.js\ 中配置基础路径和代理：

\\\javascript
export default defineConfig({
  base: '/cesiumview/', // 部署基础路径
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesiumview/Cesium')
  }
})
\\\

## 🔧 开发指南

### 添加新的3D Tiles

1. 将3D Tiles数据放置在 \public/\ 目录下
2. 在 \src/config/tilesetsConfig.js\ 中添加配置
3. 在 \src/utils/tilesetLoader.js\ 中实现加载逻辑

### 添加新的地理数据

1. 准备GeoJSON格式的数据文件
2. 将文件放置在 \public/\ 目录下
3. 在 \src/components/CesiumView.vue\ 中实现加载逻辑

### 自定义标注样式

在 \src/utils/autoLabelFromGeojson.js\ 中修改标注样式：

\\\javascript
const labelEntity = viewer.entities.add({
  position: pos,
  label: new Cesium.LabelGraphics({
    text,
    font: '16px Microsoft YaHei',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    // 更多样式配置...
  })
})
\\\

## 📊 性能指标

### 推荐配置

- **CPU**: Intel i5 或 AMD Ryzen 5 及以上
- **内存**: 8GB 及以上
- **显卡**: 支持WebGL 2.0的独立显卡
- **浏览器**: Chrome 90+ / Firefox 88+ / Safari 14+

### 性能目标

- **FPS**: 稳定在30fps以上
- **内存使用**: 控制在200MB以内
- **加载时间**: 首次加载时间小于8秒
- **切换延迟**: 显示模式切换延迟小于200ms

## 🐛 故障排除

### 常见问题

1. **Cesium无法加载**
   - 检查Cesium资源是否正确复制到 \public/Cesium/\
   - 确认浏览器支持WebGL 2.0
   - 检查控制台是否有CORS错误

2. **3D Tiles不显示**
   - 确认3D Tiles服务是否运行（开发环境：localhost:8888）
   - 检查tileset.json文件路径是否正确
   - 查看控制台是否有加载错误

3. **性能问题**
   - 关闭不必要的浏览器标签页
   - 降低浏览器缩放比例
   - 检查是否有其他程序占用GPU资源
   - 尝试启用仅3DTiles模式减少渲染负担

4. **离线模式问题**
   - 确认所有本地资源文件存在
   - 检查文件路径配置是否正确
   - 查看控制台错误信息

### 调试模式

在浏览器控制台中可以看到详细的调试信息：

\\\javascript
// 查看Cesium Viewer实例
console.log(window.cesiumViewer);

// 查看当前视点距离
// 相机移动时会自动打印距离信息

// 查看性能指标
// 在控制台查看 [AutoLabel]、[TilesInspector] 等日志
\\\

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (\git checkout -b feature/AmazingFeature\)
3. 提交更改 (\git commit -m 'Add some AmazingFeature'\)
4. 推送到分支 (\git push origin feature/AmazingFeature\)
5. 打开 Pull Request

### 代码规范

- 使用ES6+语法
- 遵循Vue 3 Composition API最佳实践
- 添加适当的注释和文档
- 确保代码通过ESLint检查

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 项目Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 邮箱: your-email@example.com

## 🙏 致谢

- [Cesium](https://cesium.com/) - 优秀的三维地球平台
- [Vue.js](https://vuejs.org/) - 渐进式JavaScript框架
- [Pinia](https://pinia.vuejs.org/) - Vue状态管理库
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [ArcGIS](https://www.arcgis.com/) - 地理信息系统平台

---

## 📝 更新日志

### v1.0.0 (2024-01-XX)
- ✨ 初始版本发布
- 🏢 支持3D Tiles建筑模型展示
- 🗺️ 支持GeoJSON区域数据可视化
- 📏 实现三维距离测量功能
- 🏷️ 添加自动标注系统
- 🌐 支持在线/离线双模式运行
- 🔧 内置测试和调试工具
- ⚡ 性能优化和内存管理

## UI 模块化说明

- `src/modules/search/`：封装搜索输入、结果和快捷键逻辑，配合 `useSearchWidget` 统一管理查询状态与实体定位。
- `src/modules/topicPanel/`：托管专题面板的展示与操作，通过 `useTopicPanel` 将图层开关、标注和 3D Tiles 控制收敛为可复用 API。
- `src/modules/infoPanel/`：信息面板纯视图化，状态由 `useInfoPanel` 管理，避免组件间的临时事件耦合。
- `src/modules/ui/UiFeedbackHost.vue`：提供 Toast 与全局加载遮罩展示，依赖新的 `useUiFeedback`。
- `src/composables/useShellLayout.ts`：集中管理全局快捷键与面板可见性，同步 Topic/Measure/Info 面板状态。

> 若需扩展新的交互模块，优先在 `src/modules/` 下创建视图组件，并在 `src/composables/` 中提供对应的组合式 API。这样可以确保 CesiumView 仅承担编排职责。

