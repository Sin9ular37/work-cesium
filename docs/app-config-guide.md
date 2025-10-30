# APP_CONFIG 使用指南

本文档对应 `src/config/appConfig.js`，逐字段说明每一项配置的作用、默认值以及在代码中的典型用法，便于快速查阅与定制。

## 顶层结构总览

```ts
export const APP_CONFIG = {
  display: { ... },
  geojson: { ... },
  camera: { ... },
  tileset: { ... },
  basemap: { ... },
  measurement: { ... },
  autoLabel: { ... },
  cameraControls: { ... },
  highlight: { ... },
  renderLifecycle: { ... },
  scene: { ... },
  tilesetLoader: { ... },
  cesium: { ... },
  tilesets: { ... },
  offline: { ... }
};
```

> 导入方式：
>
> ```ts
> import { APP_CONFIG, cloneConfigSection } from '@/config/appConfig';
> ```

下文按模块说明所有字段。除特别说明外，所有距离单位均为米、角度单位为度，颜色统一使用十六进制或 CSS 色值字符串。

---

## display（显示与 LOD）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `thresholds.showTilesBelow` | `number` | 当相机与目标距离小于该值时启用 3D Tiles。默认 500。|
| `thresholds.hideTilesAbove` | `number` | 距离超过该值时隐藏 3D Tiles，仅显示影像。默认 700。|
| `hysteresis` | `number` | GeoJSON LOD 切换的滞回区间（米），避免反复抖动。默认 150。|
| `gridOffsets.layer` | `number` | 网格 GeoJSON 多边形整体抬升高度。默认 150。|
| `gridOffsets.label` | `number` | 网格标注抬升高度。默认与 `layer` 相同。|
| `labelLimitRules` | `Record<string, Array<{maxDistance, limit}>>` | 标注数量限制规则。`default` 为兜底，其余键对应层级：`district`、`township`、`community`、`grid`。每项 `maxDistance` 为触发上限，`limit` 为允许最大标注数。单位米，`Number.POSITIVE_INFINITY` 表示无限远距离。|

### 关联代码
- LOD 切换：`src/composables/useCesiumBoot.ts` 的 `checkZoomLevelAndToggleDisplay`。
- 标注数量：`src/config/lodSettings.js` 中 `getLabelLimitForLayer`。
- 网格高度：`src/composables/useGeojsonLod.js`、`src/config/lodSettings.js`。

---

## geojson（分级行政区图层）

### layers

键名为层级标识（`district`、`township`、`community`、`grid`），每项包含：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 例：`区县` | 显示名称。 |
| `url` | `string` | `./松北区县.geojson` 等 | 数据源路径，支持相对路径（基于站点根目录）。 |
| `minDistance` | `number` | 因层级不同 | 层级生效的最小距离。 |
| `maxDistance` | `number` | 因层级不同 | 层级生效的最大距离。 |
| `style.fill` | `string` | `#2563eb` 等 | 多边形填充颜色。 |
| `style.fillAlpha` | `number` | 0-1 | 填充透明度。 |
| `style.outline` | `string` | 颜色值 | 边框颜色。 |
| `style.outlineWidth` | `number` | 像素 | 边框宽度。 |
| `labelStyle.font` | `string` | 例：`30px Microsoft YaHei` | 标签字体。 |
| `labelStyle.fillColor` | `string` | `#FFFFFF` | 标签颜色。 |
| `labelStyle.outlineColor` | `string` | `#000000` | 标签描边颜色。 |
| `labelStyle.outlineWidth` | `number` | 例：2 | 标签描边宽度。 |
| `labelStyle.scale` | `number` | 例：1.4 | 标签缩放。 |
| `labelStyle.horizontalOrigin` / `verticalOrigin` | `string` | `CENTER` | 水平/垂直对齐方式，对应 Cesium 枚举。 |
| `labelStyle.maxVisibleDistance` | `number` | 因层级不同 | 标签可见的最大距离。 |
| `labelStyle.showOnHover` 等布尔值 | `boolean` | 见默认 | 控制交互行为。 |
| `interactive.clickable` / `hoverable` | `boolean` | 控制是否可交互。 |
| `interactive.hoverStyle` | `object` | 悬浮时的样式覆盖。 |

### flyCameraRange

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `district` | 50000 | 高亮或飞行到区县时相机保持高度。 |
| `township` | 25000 | 同上。 |
| `community` | 15000 | 同上。 |
| `grid` | 5000 | 同上。 |

### 关联代码
- GeoJSON 管理：`src/composables/useGeojsonLod.js` 读取 `layers` 与 `flyCameraRange`。
- 搜索、标注、LOD 切换均基于该配置生成。

---

## camera（默认视角与缩放）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `defaultView.destination.longitude` | 126.535263 | 默认经度。 |
| `defaultView.destination.latitude` | 45.803411 | 默认纬度。 |
| `defaultView.destination.height` | 50000 | 默认高度。 |
| `defaultView.orientation.heading` | 0 | 默认航向角。 |
| `defaultView.orientation.pitch` | -75 | 默认俯仰角。 |
| `defaultView.orientation.roll` | 0 | 默认翻滚角。 |
| `defaultView.duration` | 0 | 初始化飞行时间。 |
| `zoomLevels.maxLevel` | 18 | 自定义缩放等级上限，供扩展使用。 |
| `zoomLevels.minLevel` | 10 | 缩放等级下限。 |

### 关联代码
- `DEFAULT_CAMERA_VIEW`：`src/constants/cesium.ts`。
- `useCesiumBoot.ts` 的 `getDefaultCameraPose`、`flyToDefaultCamera`。
- `src/stores/cesiumStore.js` 的 `flyToPosition` 及预设位置。

---

## tileset（3D Tiles 渲染与切换）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `qualityTiers` | `Array` | 按距离划分的质量档，每项包含 `maxDistance`、`maximumScreenSpaceError`、`maximumMemoryUsage`、`dynamicScreenSpaceError`。 |
| `gridQuality` | `object` | 处于 `grid` LOD 时指定的 Tileset 质量。 |
| `screenSpaceErrorRange` | `{min, max}` | SSE clamp 上下限。 |
| `memoryUsageRange` | `{min, max}` | 内存占用 clamp 上下限。 |
| `dynamicScreenSpaceError.disableBelowDistance` | `number` | 小于该距离时强制关闭动态 SSE。 |
| `switchDelayMs` | `number` | Tiles/影像切换的延时，默认 180ms。 |
| `clipping` | `object` | 区域裁剪参数，见下表。 |

### clipping

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 是否启用 Tileset 区域裁剪。 |
| `debugEdges` | `false` | 是否显示裁剪边缘。 |
| `altitudeMargin` | `1000` | 相机高度向上的裕量。 |
| `minHeight` | `-200` | 裁剪盒最低高度。 |
| `maxHeightCap` | `8000` | 裁剪盒最高高度上限。 |
| `idleDebounceMs` | `150` | 相机停止后再次裁剪的延迟。 |
| `moveThrottleMs` | `180` | 相机移动时最小更新间隔。 |
| `halfSizeRules` | 数组 | 根据相机高度选择半尺寸。包含若干 `{maxHeight, halfSize}`，最后一项使用 `Number.POSITIVE_INFINITY` 表示兜底。 |

### 关联代码
- 动态质量调整：`src/composables/useCesiumBoot.ts` 中的 `updateTilesetQuality`、`checkZoomLevelAndToggleDisplay`。
- 裁剪：`src/utils/tilesetClipping.js`、`src/composables/useTilesetManagement.js`。

---

## basemap

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `defaultArcGisUrl` | `https://data.hrbmap.org.cn/server/rest/services/Image/RS2024_4530/MapServer` | ArcGIS 地图服务地址，供 `useBasemapControl` 加载。 |

---

## measurement（量算工具样式）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `pointStyle.pixelSize` | 16 | 测量点像素大小。 |
| `pointStyle.color` | `#FFFF00` | 测量点颜色。 |
| `pointStyle.outlineColor` | `#000000` | 轮廓颜色。 |
| `pointStyle.outlineWidth` | 3 | 轮廓宽度。 |
| `labelStyle.font` | `'16pt Arial Bold'` | 标签字体。 |
| `labelStyle.fillColor` | `#FFFFFF` | 标签颜色。 |
| `labelStyle.outlineColor` | `#000000` | 标签描边色。 |
| `labelStyle.outlineWidth` | 3 | 描边宽度。 |
| `labelStyle.pixelOffset.x/y` | `0/-35` | 标签偏移。 |

### 关联代码
- `src/composables/useMeasurementTools.js` 中的测量实体样式。

---

## autoLabel（自动标注默认样式）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `defaultStyle.font` | `16px Microsoft YaHei` | 默认标签字体。 |
| `fillColor` / `outlineColor` | `#FFFFFF` / `#000000` | 标签颜色。 |
| `outlineWidth` | 2 | 描边宽度。 |
| `style` | `FILL_AND_OUTLINE` | Cesium LabelStyle。 |
| `pixelOffset` | `{x:0, y:-15}` | 标签偏移。 |
| `heightReference` | `NONE` | 高度参考。 |
| `disableDepthTestDistance` | `Number.POSITIVE_INFINITY` | 禁用深度测试的距离。 |
| `scale` | 1.2 | 标签缩放。 |
| `horizontalOrigin`/`verticalOrigin` | `CENTER` | 对齐方式。 |
| `distanceDisplayCondition.near/far` | 0 / 5000 | 可见距离范围。 |

### 关联代码
- `src/utils/autoLabelFromGeojson.js` 会合并图层配置与该默认样式。

---

## cameraControls（相机移动策略）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `resolutionScaleRange.min` | 0.6 | 相机移动时允许的最小渲染比例。 |
| `resolutionScaleRange.maxWhileMoving` | 0.75 | 移动时的最大比例上限（避免高负载）。 |
| `moveEndDebounceMs` | 120 | 相机移动结束后恢复状态的延迟。 |
| `wheelIdleDebounceMs` | 200 | 鼠标滚轮停顿后的回调延迟。 |
| `minTilesetSseWhileMoving` | 8 | 相机移动时临时提高的 SSE 下限。 |

### 关联代码
- `src/composables/useCameraControls.js`。

---

## highlight（实体高亮）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `durationMs` | 3000 | 高亮持续时间（毫秒）。 |
| `intervalMs` | 500 | 闪烁间隔。 |

### 关联代码
- `src/composables/useGeojsonLod.js` 的 `highlightEntity`。

---

## renderLifecycle（渲染生命周期）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `restartCooldownMs` | 2000 | Viewer 重启冷却时间。 |
| `restartDelayMs` | 300 | 调度重启前的延迟。 |

### 关联代码
- `src/composables/useRenderLifecycle.js`。

---

## scene（Viewer 场景初始化）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `toggles.highDynamicRange` 等 | `false` | 控制 HDR、雾、天空、大气、太阳、月亮等开关。 |
| `requestRender.enabled` | `true` | 是否启用 requestRenderMode。 |
| `requestRender.maximumRenderTimeChangeMs` | `1000/30` | 最大渲染间隔（毫秒）。 |
| `globe.maximumScreenSpaceError` | 6.0 | 地球 SSE。 |
| `globe.tileCacheSize` | 800 | 地球瓦片缓存。 |
| `cameraController.enableCollisionDetection` | `true` | 相机碰撞检测。 |
| `cameraController.minimumCollisionTerrainHeight` | 5.0 | 碰撞最小高度。 |
| `clock.shouldAnimate` | `false` | 是否播放动画。 |

### 关联代码
- `src/modules/cesium/bootstrap/scene.ts`。

---

## tilesetLoader（3D Tiles 加载器默认参数）

字段对应 `Cesium.Cesium3DTileset.fromUrl` 的可选项，默认值以性能优化为主。主要包括：

- `show`、`heightOffset`、`debug`、`cullWithChildrenBounds` 等基础属性。
- 屏幕空间误差设置：`maximumScreenSpaceError`、`skipLevelOfDetail`、`baseScreenSpaceError`、`skipScreenSpaceErrorFactor`、`skipLevels`。
- 请求优化：`cullRequestsWhileMoving`、`preferLeaves`、`progressiveResolutionHeightFraction` 等。
- 注视点优先策略：`foveatedScreenSpaceError`、`foveatedConeSize`、`foveatedTimeDelay` 等。
- `maximumNumberOfLoadedTiles`：限制在内存中的瓦片数量。

### 关联代码
- `src/utils/tilesetLoader.js`。

---

## cesium（Cesium Viewer 高阶配置）

| 字段 | 说明 |
| --- | --- |
| `defaultPosition` | Viewer 初始化时的相机位置（哈尔滨）。 |
| `buildingPositions` | 示例建筑实体信息（经纬高度、名称、颜色）。 |
| `performance.scene/terrain` | 镜头及地形优化参数。 |
| `presetPositions` | 预设飞行位置（`harbin`、`buildings`、`districts`、`airport`、`railway`）。 |
| `dataSources` | 默认数据源配置（路径与样式），注意最终路径在运行时会加上 `import.meta.env.BASE_URL`。 |
| `ui.controlPanel` | UI 控制面板位置、主题。 |
| `camera` | 默认相机方向、飞行时长、最近/最远距离。 |
| `events` | Viewer 交互开关（双击、右键、滚轮）。 |

### 关联代码
- `src/config/cesiumConfig.js`、`src/stores/cesiumStore.js`、`src/composables/useCesiumBoot.ts` 等。

---

## tilesets（3DTiles 服务地址）

| 环境 | 字段 | 说明 |
| --- | --- | --- |
| `development` | `baseUrl` | 开发环境 3DTiles 服务根路径。默认 `http://localhost:8888`。 |
|  | `buildings` | 建筑 tileset 路径。 |
| `production` | 同上，默认指向 `http://localhost:8899`。 |

### 关联代码
- `src/config/tilesetsConfig.js`、`src/utils/tilesetLoader.js`。

---

## offline（离线部署）

### localDataSources
- `imagery.primary/fallback`：本地图像路径。
- `imagery.bounds`：影像覆盖范围（经纬度）。
- `models.buildings/terrain`：本地 3D Tiles 或地形。
- `geospatial.districts/boundaries`：本地 GeoJSON。

### features
- `networkFeatures`：控制各类联网特性开关（Ion、地形、影像、地理编码、天气）。
- `localFeatures`：离线环境启用功能（本地影像、本地模型等）。

### performance
- `scene`、`terrain`、`memory`：离线性能调优参数。

### errorHandling
- `networkErrorFallback`：网络失败是否回落到本地资源。
- `localResourceFallback`：本地资源加载失败时的处理策略（字符串标识对应逻辑实现）。

### viewerOptions
- Cesium Viewer 的 UI 组件开关、`requestRenderMode`、`maximumRenderTimeChange`、`imageryProvider` 等。

### 关联代码
- `src/config/offlineConfig.js`、`src/composables/useCesiumBoot.ts`。

---

## cloneConfigSection / deepClone

| 函数 | 说明 |
| --- | --- |
| `cloneConfigSection(value)` | 优先使用原生 `structuredClone`，否则回退到 `deepClone`，确保每次引用配置时不会意外修改共享对象。 |
| `deepClone(value)` | 简单的递归深拷贝实现。数组与对象均逐项复制。 |

### 使用建议
- **读取**：`const settings = cloneConfigSection(APP_CONFIG.display);`
- **修改**：对克隆出的对象进行修改，再传入使用模块，避免污染全局默认值。

---

## 配置自定义流程建议

1. **确定需求范围**：根据上文模块定位需要调整的字段，例如 LOD 阈值、标注数量或 Tileset 质量。
2. **修改 `appConfig.js`**：直接更新对应字段或增加新的层级、服务配置。
3. **同步测试**：
   - 调整显示/LOD 后，验证 `useCesiumBoot` 的切换逻辑。
   - 修改标注规则后，确认 `useGeojsonLod` 中的标签数量符合预期。
   - 离线配置变更后，使用无网络环境或 `VITE_OFFLINE_MODE=true` 进行实测。
4. **扩展新配置**：如新增功能，可在 `APP_CONFIG` 中加入自定义模块，并在相关代码中引入，保持集中式管理。

---

如需进一步了解各项配置在代码中的使用位置，可结合上述“关联代码”定位具体实现文件，便于调试与扩展。若需新增配置项，请保持键名语义清晰、单位标注明确，并更新本指南以方便团队协作。***
