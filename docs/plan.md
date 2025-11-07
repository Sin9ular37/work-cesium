## 当前 3D Tiles 优化回顾与后续方案

### 已实施的优化
1. **盒转区域 + 父节点补齐**  
   - `scripts/box-to-region.js` 将所有 `boundingVolume.box` 按世界坐标转为 `region`，解析并累积每个节点的 `transform`。  
   - 转换后自底向上合并 region，填补缺失或过小的父节点 boundingVolume，避免根节点包不住子节点导致视锥裁剪。
2. **层级重建**  
   - `scripts/rebuild-tileset-tree.js` 依据 region 重建四叉树，限制节点瓦片数与深度，并在根 `geometricError` ≤ 0 时按覆盖范围估算正值，确保 Cesium 会继续向下请求。
3. **静态巡检**  
   - `scripts/analyze-tileset.js` 统计层级、region 覆盖、高程、几何误差、内容 URI 等指标，输出潜在问题（region 越界、`geometricError` 异常、内容重复等），用于验证优化效果。

### 可考虑的替代/补充方案
1. **保留 box 直接重构 tileset**  
   - 使用原始 `boundingVolume.box`（不转 region）重新生成层级，可借助 Cesium 官方工具或自写脚本按 box 划分，避免转换误差。
2. **重新切片/输出 3D Tiles**  
   - 借助 `3d-tiles-tools`、Cesium ion、Cesiumlab 等对原始模型/点云重新切片，使工具自动生成 LOD、bounding volume 与 `geometricError`。
3. **SSE / refine 策略优化**  
   - 在现有树上调整 `refine`、`maximumScreenSpaceError`、`dynamicScreenSpaceError` 或自定义 `screenSpaceErrorByDistance`，控制请求节奏并强化关键区域显示。
4. **基于空间索引的自定义划分**  
   - 将所有瓦片的 box/region 转成地理坐标，使用 R 树/四叉树重新聚合，再生成新的 tileset.json，实现按数据分布的自适应切分。
5. **检查并矫正内容 transform**  
   - 遍历 B3DM 的 `RTC_CENTER` 与 glTF 节点矩阵，确保与 tileset transform/region 一致。必要时把 transform 烤入 B3DM 并清理 tileset 中的 transform，避免双重变换。

> 以上方案可单独或组合实施：若继续沿用现有脚本，可先根据分析结果定位仍不可见的瓦片；如需更彻底的重构，可优先考虑“重新切片”或“基于空间索引的自定义划分”。如需我协助某个具体方案，请指出优先级。***


我倾向优先尝试两条路线：

1、重新切片 / 重新导出 3D Tiles
这是最“稳”的方案：让成熟的 tiler（Cesium ion、3d-tiles-tools、Cesiumlab 等）根据原始模型或点云重新生成 tileset，bounding volume、LOD、geometricError 都由工具自动推算。虽然耗时，但能彻底避免我们手写脚本可能遗漏的 transform/矩阵细节，适合 400GB 这种超大数据。

2、保留 box 直接重构 tileset（跳过 box→region 转换）
如果短期内不想重切数据，可以基于原始 boundingVolume.box 做层级重建：我们可以用 box 直接驱动四叉树划分（Cesium 本就支持 box ），避免转换成 region 时的精度和 transform 问题。实现上可以扩展现有 rebuild-tileset-tree.js 或编写一个新的“box-based”构建器，保持所有节点 transform 原样传递。
这两个方案分别代表“彻底换生成链路”和“在现有数据上最小风险地重建树”。如果你希望继续沿用现有数据，我建议先做第 2 条；如果能接受重新加工源数据，就直接走第 1 条。需要我先落实哪一个，告诉我即可。
