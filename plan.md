# 重构计划（阶段性执行，保持功能不回归）

> 目标：将庞杂的 `CesiumView.vue` 及相关工具拆分成职责清晰的模块（composable/子组件/独立 utils），清除遗留冗余，最终让项目结构易读、易维护、易扩展。
> 原则：每个阶段控制在可回滚的小步范围，所有功能保持一致，构建/关键交互全部通过。

---

## 阶段 0 · 准备与通用约定（本阶段立即执行）
- **输出**
  - `plan.md`（本文件）  
  - 为后续阶段约定命名/目录规范
  - 收敛全局常量、阈值、配置位置（如 `src/config`）
- **任务要点**
  - 梳理现有依赖（Cesium 配置、store、utils）
  - 记录临时调试方法、日志开关（决定保留或统一封装）
  - 明确重构产物目录：`src/composables`, `src/modules`, `src/constants`, `src/types` 等
- **验证**
  - `npm run build`

---

## 阶段 1 · 测量/量算模块剥离（优先度高）
- **输出**
  - `src/composables/useMeasurementTools.ts`（或 `.js`，视全局 TS 政策而定）
  - 将量算相关模板片段在 `CesiumView.vue` 中保持不动，但脚本逻辑改为调用 composable
- **任务要点**
  1. 抽离所有测量状态（距离、面积、开关、实体缓存等）
  2. 统一拾取逻辑、点/线实体创建、面积计算函数迁入 composable
  3. 提供必要的注入依赖（viewer getter、topicState 某些方法）以避免循环引用
  4. 清理由于抽离而遗留的 dead code（多余的局部函数/变量）
- **验证**
  - 量算面板所有按钮仍可用
  - 行距/面积计算数值一致
  - 第 1/2 个测量结束后的清理、重测等流程无回归

---

## 阶段 2 · LOD/标注控制模块化
- **输出**
  - `src/composables/useGeojsonLod.ts`（负责 LOD 层加载、限额、标注生成、state 管理）
  - `src/constants/lodThresholds.ts`（如需进一步细分配置）
- **任务要点**
  1. 抽离 `geojsonLodLayers` 定义、`updateGeojsonLOD`、`createAutoLabelsForLayer` 等
  2. 将标注数量、视距规则统一由配置提供，清除重复 `Object.entries` 查找
  3. 处理 `currentActiveLayer`、`labelCollections`、`topicState` 之间的耦合，改为 composable 内部管理并提供 API
  4. 重置/销毁逻辑集中化（卸载 layer、清理 disposer）
- **验证**
  - 缩放场景时 LOD 切换、标注/数据源显示正确
  - 手动开关专题面板/标注/层级按钮仍生效
  - 搜索结果依旧可定位并高亮

---

## 阶段 3 · 相机/渲染循环控制模块化
- **输出**
  - `src/composables/useCameraControls.ts`
  - `src/composables/useRenderLifecycle.ts`
- **任务要点**
  1. 将 `setupCameraMoveHandler`、`installCameraDebouncedLOD`、`safeResize`、`restartViewer` 等拆分为两个 composables（相机 vs 渲染/重启）
  2. 统一保留 `debugLog` 或改为 `logger` 工具
  3. 处理相机事件中的临时变量（SSE 恢复、resolutionScale、FXAA 开关），通过 composable 维护内部状态
- **验证**
  - 移动/缩放时性能策略依旧：移动期降载、停止后恢复
  - 特殊情况下（窗口缩放、容器为 0、WebGL context lost）仍可恢复
  - LOD 与相机事件节流保持稳定

---

## 阶段 4 · 3D Tiles / 底图 / 地形加载模块化
- **输出**
  - `src/composables/useTilesetManagement.ts`
  - `src/composables/useBasemapControl.ts`
  - 视需要拆分 `terrainLoader`/`tilesetLoader` 为更细 utils
- **任务要点**
  1. 统一 IO/API：`preloadBuildings`、`toggleTileset`、`alignTilesetToTerrain` 等逻辑挪入 composable
  2. 将 `arcGIS` 底图加载、备用影像、本地影像逻辑拆分并简化（考虑是否仍需要单 tile 备援）
  3. `installRegionalClipping`、`tilesetLoader` 等返回的 disposer 保持可控
- **验证**
  - 3D Tiles 预加载、显示/隐藏、LOD 使用保持原行为
  - 底图切换（在线/离线）成功
  - 地形开关、对齐逻辑正常

---

## 阶段 5 —— UI/交互层模块化
- **目标**
  - `src/composables/useSearchWidget.ts` 与 `src/modules/search/index.ts`
  - `src/modules/topicPanel/index.vue` 及关联的侧栏组件
  - `src/modules/infoPanel/index.vue`
- **需要实现**
  1. 将搜索 DOM 控制逻辑拆分为 `useSearchWidget` 组合式 API，整理输入状态、结果列表和高亮流程，向外只暴露 `initSearchWidget`、`destroySearchWidget`、`selectResult` 等方法，并补充类型定义。
  2. 抽象搜索、专题、信息面板共用的 toast / loading / confirm 交互为 `useUiFeedback`（或同等服务），统一封装 `notify`、`setSpinner`、`confirmAction` 等接口，去除组件内分散的 `setTimeout` 与 `document.querySelector`。
  3. 将 `topicPanel/index.vue` 的数据拉取、筛选、标签切换拆分到 `useTopicPanel` composable，提供 `openTopic(topicId)`、`closeTopic()`、`refreshTopic()`，并将历史记录、收藏等子区块拆成独立子组件或动态 slot。
  4. 将 `infoPanel/index.vue` 的实体详情、定位联动挪至 `useInfoPanel`，改造跨组件事件为 mitt/Pinia store，处理面板尺寸记忆、滚动同步、实体高亮释放，补齐可选的批量关闭/清空能力。
  5. 梳理面板与全局快捷键、折叠状态来源，统一到 `useShellLayout`（或 store)，合并重复的 `window.addEventListener('keydown')` 注册，确保在组件卸载时释放监听。
  6. 清理样式资源：将搜索、专题、信息面板的 SCSS/CSS 按模块拆分，建立主题变量与字号规范，补充 Storybook/截图或 README 片段供验收参考。
- **验证**
  - 搜索流程（输入、定位、清空、切换数据源）全链路无错，地图飞行与 hover 高亮同步。
  - 专题、信息面板可独立开关并记忆上次状态；重复打开不会残留旧的订阅或定时器。
  - Toast / loading 遮罩在多路事件触发时互斥显示，路由切换后自动回收；暗/亮主题样式一致。
## 阶段 6 —— Cesium 初始化与主组件瘦身
- **目标**
  - `src/modules/cesium/initViewer.ts`，封装 `initializeCesium`、`restartViewer` 以及 viewer 依赖注入。
  - `CesiumView.vue`（或同层 orchestrator）瘦身为 orchestrator，仅负责组合 composables 与 UI 容器。
  - `src/modules/cesium/bootstrap` 目录（如需新增），用于收敛初始化相关的 config/service（相机、地形、资源加载器）。
- **需要实现**
  1. 将现有 `initViewer.ts` 拆成纯函数化的初始化流程，注入 Pinia/store、事件总线与 viewer 选项，导出 `createViewerContext`、`installViewerPlugins` 及 disposer。
  2. 重构 `restartViewer`，统一清理 listener、postProcessStage、DataSource 等副作用，在重建后串联阶段 1~5 的 composable 安装顺序。
  3. 在 `CesiumView.vue` 中引入 `useCesiumBoot`（或等价）composable，集中管理 onMounted/onUnmounted、响应式参数监听与错误兜底，将组件模板压缩至 200~300 行。
  4. 为初始化流程补充 TypeScript 类型：定义 `ViewerBootPayload`、`CesiumProviderHooks` 等接口，替换 any/unknown，并将常量迁移至 `src/constants/cesium.ts`。
  5. 清理 `CesiumView.vue` 内部遗留 console/log 注释，统一改用 `logger`，确保布局/快捷键/主题状态引用阶段 5 的新抽象。
  6. 更新 README 或新增 `/docs/cesium-bootstrap.md`，记录初始化顺序、覆盖点、自定义 hook 说明，并补充 WebCrypto polyfill、ClippingPlane 兼容等常见问题。
- **验证**
  - `npm run build`、`npm run lint` 全量通过，Storybook/预编译脚本可运行。
  - 切换主题、重启 viewer、切换地形/底图后无内存泄漏或未释放监听（可通过日志或 devtools 验证）。
  - Viewer 初始化失败时展示友好提示，二次尝试可成功恢复。
## 阶段 7 · 收尾与性能回归
- **输出**
  - 最终整理后的代码库
  - 变更说明/迁移指南（可附在 README 或 CHANGELOG）
- **任务要点**
  1. 删除过时注释、调试代码、未使用 util
  2. 核对所有导入路径、命名规范（PascalCase/ camelCase / snake_case 等）
  3. 可选：引入 ESLint/Prettier 规则或更新已有配置，保障后续一致性
- **验证**
  - `npm run build`
  - 关键用户流程（测量、LOD、加载、搜索、面板切换）人工冒烟测试

---

## 记录
- [x] 阶段 0
- [x] 阶段 1
- [x] 阶段 2
- [x] 阶段 3
- [x] 阶段 4
- [x] 阶段 5
- [ ] 阶段 6
- [ ] 阶段 7

> 每完成一个阶段，请勾选对应项并在文件尾部追加“阶段完成纪要”，描述核心变更/风险/下一步计划。

---

### 阶段完成纪要
- **阶段 0**（2025-10-17）：建立 `plan.md`、确认后续目录规范，补充 `lodSettings` 常量导出。
- **阶段 1**（2025-10-17）：抽离测量逻辑至 `src/composables/useMeasurementTools.js`，`CesiumView.vue` 中删除 2D/3D 测量冗余代码并改由 composable 提供状态与方法；同步移除临时测量常量、重复函数，保留原模板与交互不变。
- **阶段 2**（2025-10-17）：新增 `src/composables/useGeojsonLod.js`，托管 LOD 层配置、标注创建、视距限额、搜索/高亮等逻辑；`CesiumView.vue` 中移除 400+ 行 LOD/标注函数与状态，仅保留 composable 输出和 UI 交互调用，清理重复常量/导入并保持现有专题面板与搜索行为。
- **阶段 3**（2025-10-27）：接入 `useCameraControls` 与 `useRenderLifecycle`，在 `CesiumView.vue` 中统一安装/拆卸相机事件与渲染循环控制；清理内联的相机监听、重启、resize 函数并改由 composable 托管 SSE/FXAA/尺寸校验，新增 `handleCameraIdle` 集中驱动 LOD 与显示模式切换。补充 `scripts/build-with-polyfill.js` 与 `scripts/polyfill-webcrypto.cjs` 以在无原生 WebCrypto 的 Node 环境中执行 `npm run build`，同时为缺少 `ClippingPlaneCollection.fromBoundingVolume` 的 Cesium 版本提供降级裁剪方案。
- **阶段 4**（2025-10-27）：新增 `useTilesetManagement` / `useBasemapControl`，将 3D Tiles 预加载、显隐、区域裁剪与 ArcGIS 底图切换集中封装；`CesiumView.vue` 去除地形与本地离线影像相关逻辑，改由 composable 提供建筑模型与远程底图控制，清理 `toggleTerrain`、`loadLocalImagery` 等函数，并保持缩放触发的 LOD/显示切换。`npm run build` 通过。

- **阶段 5**：2025-10-27 完成搜索/专题/信息面板 UI 模块化，引入 `useSearchWidget`、`useTopicPanel`、`useInfoPanel`、`useUiFeedback` 与 `useShellLayout`，重构 `CesiumView.vue` 仅保留 orchestrator 职责，并新增模块化样式与文档说明。
