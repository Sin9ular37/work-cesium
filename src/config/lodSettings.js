import { APP_CONFIG, cloneConfigSection } from './appConfig';

const displayConfig = APP_CONFIG.display || {};
const thresholdsConfig = displayConfig.thresholds || {};
const labelRulesConfig = displayConfig.labelLimitRules || {};
const gridOffsetsConfig = displayConfig.gridOffsets || {};

/**
 * LOD 与标注控制相关配置，统一从 APP_CONFIG 中派生，确保配置集中管理。
 */
export const DISPLAY_THRESHOLDS = cloneConfigSection(thresholdsConfig);

export const LOD_HYSTERESIS = displayConfig.hysteresis ?? 0;

export const GRID_LAYER_HEIGHT_OFFSET = gridOffsetsConfig.layer ?? 0;
export const GRID_LABEL_HEIGHT_OFFSET = gridOffsetsConfig.label ?? GRID_LAYER_HEIGHT_OFFSET;

/**
 * 按层级划分的标注数量限制。可根据业务需要进一步调整。
 */
export const LABEL_LIMIT_RULES = cloneConfigSection(labelRulesConfig);

const DEFAULT_LABEL_LIMIT_RULES =
  LABEL_LIMIT_RULES.default && Array.isArray(LABEL_LIMIT_RULES.default)
    ? LABEL_LIMIT_RULES.default
    : [];

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
