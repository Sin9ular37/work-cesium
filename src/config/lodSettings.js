/**
 * LOD 与标注控制相关配置。
 * 将阈值、滞回、标注数量等分离成独立模块，便于在组件外复用与维护。
 */

export const DISPLAY_THRESHOLDS = {
  showTilesBelow: 500,
  hideTilesAbove: 700
};

export const LOD_HYSTERESIS = 150;

export const GRID_LAYER_HEIGHT_OFFSET = 150;
export const GRID_LABEL_HEIGHT_OFFSET = GRID_LAYER_HEIGHT_OFFSET;

const DEFAULT_LABEL_LIMIT_RULES = [
  { maxDistance: 500, limit: 20 },
  { maxDistance: 1000, limit: 15 },
  { maxDistance: 2000, limit: 10 },
  { maxDistance: 4000, limit: 5 },
  { maxDistance: Number.POSITIVE_INFINITY, limit: 3 }
];

/**
 * 按层级划分的标注数量限制。可根据业务需要进一步调整。
 */
export const LABEL_LIMIT_RULES = {
  default: DEFAULT_LABEL_LIMIT_RULES,
  district: [
    { maxDistance: 60000, limit: 20 },
    { maxDistance: 120000, limit: 12 },
    { maxDistance: Number.POSITIVE_INFINITY, limit: 8 }
  ],
  township: [
    { maxDistance: 8000, limit: 20 },
    { maxDistance: 20000, limit: 12 },
    { maxDistance: Number.POSITIVE_INFINITY, limit: 6 }
  ],
  community: [
    { maxDistance: 5000, limit: 20 },
    { maxDistance: 12000, limit: 10 },
    { maxDistance: Number.POSITIVE_INFINITY, limit: 5 }
  ],
  grid: [
    { maxDistance: 1500, limit: 24 },
    { maxDistance: 4000, limit: 16 },
    { maxDistance: Number.POSITIVE_INFINITY, limit: 8 }
  ]
};

function resolveRules(layerKey, overrides) {
  if (Array.isArray(overrides) && overrides.length > 0) {
    return overrides;
  }
  return LABEL_LIMIT_RULES[layerKey] ?? LABEL_LIMIT_RULES.default;
}

/**
 * 根据距离和层级获取当前允许的最大标注数量。
 */
export function getLabelLimitForLayer(distance, layerKey, overrides) {
  const rules = resolveRules(layerKey, overrides);
  const safeDistance = Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;

  for (const rule of rules) {
    if (safeDistance < rule.maxDistance) {
      return rule.limit;
    }
  }

  const fallback = rules[rules.length - 1];
  return fallback ? fallback.limit : DEFAULT_LABEL_LIMIT_RULES[DEFAULT_LABEL_LIMIT_RULES.length - 1].limit;
}
