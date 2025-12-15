# 3D Tiles 性能与内存检查计划

## 执行进度
- [x] 渲染循环：保持 `requestRenderMode=true`，避免自动切回连续渲染（已改 `useRenderLifecycle.js`）。
- [x] Tileset 质量档/资源上限：提高近景 SSE、收紧内存与最大瓦片数（已改 `appConfig.js`）。
- [x] 裁剪/调度节流：加大裁剪窗口节流（已改 `appConfig.js`）。
- [ ] 数据压缩与瓦片体积核查
- [ ] 贴地/拾取、标签刷新节流验证
- [ ] 场景复现与指标采集（FPS/GPU/瓦片数）

## 目标
- 找出导致掉帧/内存暴涨的配置或代码路径。
- 给出可操作的优化/修复方案并验证。

## 基线信息收集
- 工程配置：`src/utils/tilesetLoader.js` 默认参数、`src/composables/useCesiumBoot.ts` 中的动态 SSE/LOD 切换逻辑、`APP_CONFIG.tileset/tilesetLoader`。
- 环境：浏览器/显卡/驱动版本、运行模式（dev/prod）、是否离线模式、是否开启调试开关（debug bounding volume 等）。
- 数据：tileset 是否做 Draco/gzip/basis 压缩，瓦片大小/层级数量。

## 检查清单
1) 渲染循环与刷新
- 确认 `viewer.scene.requestRenderMode` 是否常开；交互后是否有节流的 `requestRender()`；是否存在高频 requestRender 源（测量/hover/label 高度刷新）。
- 检查是否有残留的 debug 显示（bounding volume/统计面板）。

2) Tileset 质量与资源上限
- 质量档：近距离 SSE 是否过低（如 2.4/3.2）；动态 SSE 是否频繁切换；`disableBelowDistance` 设置。
- 内存：`maximumMemoryUsage` 是否设置过高；`maximumNumberOfLoadedTiles` 是否有限制（推荐 64~128）。
- LOD 距离切换：`DISPLAY_THRESHOLDS` 滞回是否足够，是否在阈值附近抖动反复加载。
- 网格 tileset 与主 tileset 是否同时显示；切换时是否 hide 另一套。

3) 裁剪与视域
- 区域裁剪窗口大小/halfSizeRules 是否过大；`moveThrottleMs` / `idleDebounceMs` 是否过小导致频繁更新；禁用裁剪后的表现对比。

4) 贴地/拾取开销
- `clampToHeightMostDetailed`、自动标签高度刷新是否在相机移动时暂停；hover/点击拾取是否做节流。
- GeoJSON Label/hover/measurement entity 是否在频繁更新材质或位置。

5) 源数据与压缩
- 瓦片是否有 Draco + gzip；纹理是否有压缩格式（basis/ktx2）；是否存在超大单瓦片（>5–10MB）。
- 检查管线是否切分过细或过粗（层级深度、屏幕误差目标）。

6) 指标采集与复现
- 运行 Chrome DevTools Performance/Memory，记录：FPS、GPU 内存（任务管理器）、JS 堆、tiles 加载数。
- Cesium Inspector：监控 SSE、瓦片数、可见/加载 tiles。
- 复现场景：近距离/远距离、连续绕飞、阈值附近停留。

## 输出
- 问题列表：配置/代码问题、数据问题、交互节流问题。
- 优先级与建议：调高近距离 SSE、限制最大加载瓦片数、调大滞回/节流、关掉多余 debug、优化裁剪窗口、暂停移动时的贴地刷新。
- 验证步骤：逐项修改后对比 FPS、GPU/内存占用、加载瓦片数，记录前后差异截图/数据。

## 预计时间
- 信息收集与复现：0.5 天
- 配置调优与对比：0.5 天
- 数据侧（压缩/切分）评估：0.5–1 天
