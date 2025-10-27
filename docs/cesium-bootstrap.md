# Cesium 初始化与插件引导指南

本文件说明 `阶段 6` 引入的 Cesium 启动流程，包括核心模块、插件机制及常见定制点。阅读完毕后，你应当能够：

- 理解 `useCesiumBoot` 如何整合阶段 1~5 的组合式 API；
- 扩展或替换 Viewer 初始化步骤（如场景优化、镜头姿态、资源预加载）；
- 处理重启、离线模式与常见兼容问题。

## 目录

1. [核心结构](#核心结构)
2. [运行时流程](#运行时流程)
3. [自定义插件](#自定义插件)
4. [离线与兼容性注意事项](#离线与兼容性注意事项)

## 核心结构

```
src/
├─ composables/
│  ├─ useCesiumBoot.ts           # 新增 orchestrator，组合并调度所有 Cesium 子模块
│  └─ useRenderLifecycle.js      # 负责测量容器尺寸、重启与 WebGL 容错
├─ modules/
│  └─ cesium/
│     ├─ bootstrap/
│     │  └─ scene.ts             # 场景优化、默认相机、日志守护
│     └─ initViewer.ts           # createViewerContext / installViewerPlugins 等核心接口
└─ constants/
   └─ cesium.ts                  # 默认相机姿态、显示阈值、日志前缀
```

- `useCesiumBoot` 是主入口：负责触发 `useRenderLifecycle`、call `initializeCesium` 并在 Viewer 重启时重新装配插件。
- `createViewerContext` 封装了 Viewer 构建细节（容器校验、render loop 守卫、日志管道）。
- `installViewerPlugins` 提供 before/after 钩子；可注入复数插件，统一返回 disposer。

## 运行时流程

1. **组件挂载**：`CesiumView.vue` 创建 `cesiumContainer` ref，并将其交给 `useCesiumBoot`。
2. **生命周期管理**：`useRenderLifecycle` 监听容器 resize、visibility 以及 WebGL context；必要时触发重启。
3. **Viewer 创建**：
   - 调用 `createViewerContext`，构造 `Cesium.Viewer` 并注册 preRender 守卫；
   - `installViewerPlugins` 顺序执行插件：
     1. `applySceneOptimizations`：关闭 HDR、Fog、天空盒，并设置碰撞/限帧；
     2. `applyDefaultCameraView`：使用 `DEFAULT_CAMERA_VIEW` 的经纬高与欧拉角；
     3. `setupSceneLogging`：安装 tile 进度与 renderError 监听；
     4. 业务插件：加载 ArcGIS 底图、预加载 3D Tiles、重建相机 Hook、触发 LOD 更新。
4. **重启/销毁**：
   - 任何插件可返回 `() => void` 作为 disposer；
   - `beforeViewerDestroy` 会调用插件 disposer + `disposeViewerContext`，避免事件残留；
   - `useRenderLifecycle.restartViewer` 负责真正摧毁旧 Viewer 并拉起新实例。

## 自定义插件

添加新插件只需在 `useCesiumBoot` 内的 `installViewerPlugins([...])` 数组中插入一个对象：

```ts
const customPlugin: CesiumProviderHooks = {
  async beforeViewerReady({ viewer, logger }) {
    logger('注册自定义 PostProcess');
    // ...
  },
  async afterViewerReady({ viewer }) {
    // 返回 disposer，重启/卸载时自动调用
    const handler = viewer.scene.postRender.addEventListener(() => {/* ... */});
    return () => viewer.scene.postRender.removeEventListener(handler);
  }
};
```

> 推荐：在 `beforeViewerReady` 内做同步配置（不触发异步请求），将 IO 或耗时逻辑放在 `afterViewerReady`，并务必提供 disposer。

## 离线与兼容性注意事项

- **离线模式**：`createOfflineViewerConfig()` 会注入本地影像/地形。`isOfflineEnvironment()` 被多处校验（网络事件、初始化日志）。
- **WebCrypto / Node 环境**：`scripts/build-with-polyfill.js` 与 `scripts/polyfill-webcrypto.cjs` 仍适用；无额外改动。
- **公共资源**：模板引用的 `/app-logo.png` 等文件现位于 `public/` 目录，确保构建期可解析。
- **Lod/测量联动**：`useCesiumBoot` 将测量、LOD、Tileset、相机等阶段性组合式 API 注册到共享 orchestrator；若新增模块，请通过 `useShellLayout` 注册快捷键与可见性。

如需进一步扩展，请参考 `useCesiumBoot` 中的现有 hooks，并在提交前运行 `npm run build` 以验证重构后的初始化流程。
