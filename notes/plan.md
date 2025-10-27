- 目标

  - 降低相机移动时的掉帧，特别是在大量标注与超大（≈400GB）3DTiles加载场景下
  - 让渲染更“按需”：移动时牺牲一定画质提升流畅，停止后恢复画质；标注数量与可见范围随距离/视锥自适应
  - 控制3DTiles的加载强度与内存占用，避免卡顿/抖动

- 已完成

  - completed | 标注自动生成可控化：为 autoLabelFromGeojson 增加 limit 与 filterEntity 参数（稳定抽样、按视锥过滤）
    - 影响：降低每帧标注遍历与贴合开销，缓解相机移动时的卡顿
    - 路径：src/utils/autoLabelFromGeojson.js

  - completed | 保持向后兼容：未传入新参数时保持原行为（仅新增能力，不破坏现有调用）

  - completed | 相机移动态标记与接入事件：在页面状态加入 isCameraMoving、prevResolutionScale/prevFxaaEnabled/prevTilesMaxLoaded，并在 moveStart/moveEnd 生效
    - 路径：src/components/CesiumView.vue:249（变量定义）、src/components/CesiumView.vue:1024（setupCameraMoveHandler）

  - completed | 接入新标注控制：在 createAutoLabelsForLayer 中按当前视距与视锥传入 limit 与 filterEntity
    - 路径：src/components/CesiumView.vue:2492 起（createAutoLabelsForLayer），调用处参数：src/components/CesiumView.vue:2670–2678

  - completed | 相机移动期的降载策略接入：
    - moveStart：临时降低 viewer.resolutionScale≈0.7、关闭 FXAA、提高 tileset.maximumScreenSpaceError、收紧 tileset.maximumNumberOfLoadedTiles≈64；
    - moveEnd：恢复上述参数并触发后续检查
    - 路径：src/components/CesiumView.vue:1029–1067

  - completed | LOD 更新节流：installCameraDebouncedLOD 改为≈250ms 防抖，且 isCameraMoving 为真时跳过
    - 路径：src/components/CesiumView.vue:2996–3016

  - completed | 标注贴合高度移动期优化：refreshLabelCollectionHeights 在相机移动时直接返回，停止后分批贴合
    - 路径：src/components/CesiumView.vue:2702–2710

  - completed | 日志压缩：为高频事件（moveStart/moveEnd/WHEEL）增加 DEBUG_LOG 开关，默认关闭，减少 console.log 压力
    - 路径：src/components/CesiumView.vue:252（DEBUG_LOG）、1024/1047/1070（日志开关）

- 未完成计划

  - pending | 未决参数与阈值确认（见下）

- 下一步（建议）

  1. 参数校准：按实际机器与数据量评估 resolutionScale（0.7±0.1）、tileset.maximumNumberOfLoadedTiles（64/96/128）、SSE（16/12）
  2. 压力测试：移动/旋转/缩放 60s 录制帧率与内存曲线；对比优化前后
  3. 观察 LOD 切层边界：如有抖动，调整 LOD_HYSTERESIS（当前 150 米）与各层 min/max

- 涉及文件路径

  - 已修改
    - src/utils/autoLabelFromGeojson.js（新增 limit、filterEntity 与稳定抽样逻辑）
    - src/components/CesiumView.vue（createAutoLabelsForLayer、setupCameraMoveHandler、installCameraDebouncedLOD、refreshLabelCollectionHeights、DEBUG_LOG）

- 未决问题

  - pending | 当前“最大并发瓦片数/内存上限”的可接受范围？是否允许移动期缩到如 64 tiles、内存 256MB，以换更稳定帧率
  - pending | 标注数量上限的期望（近/中/远三档），以及不同层级的优先级是否一致
  - pending | 对移动期画质的容忍度：是否接受短暂关闭 FXAA 与降低分辨率（0.7~0.8）来换取流畅
  - pending | 是否需要实体级聚合（Entity clustering）作为后续备选（目前基于 LabelCollection 的裁剪/抽样已能显著减载，但聚合可进一步减少密集区域标注数量）
