import { computed, ref, type Ref } from 'vue';

type TopicLayerKey = 'district' | 'township' | 'community' | 'grid';

export interface TopicLayerMeta {
  key: TopicLayerKey;
  label: string;
  supportLabel: boolean;
  supportToggle: boolean;
}

export interface TopicPanelOptions {
  topicState: {
    groups: Record<string, boolean>;
    lod: Record<string, boolean>;
    labels: Record<string, boolean>;
    layerVisible: Record<string, boolean>;
  };
  currentActiveLayer: Ref<TopicLayerKey | null | undefined>;
  toggleLayerVisible: (key: TopicLayerKey) => void;
  toggleLabel: (key: TopicLayerKey) => void;
  toggleLod?: (key: TopicLayerKey) => void;
  refreshLayers?: () => void;
  tilesetVisible: Ref<boolean>;
  toggleTileset: () => void;
}

export interface TopicPanelController {
  visible: Ref<boolean>;
  groups: Ref<TopicPanelGroup[]>;
  togglePanel: () => void;
  openTopic: (layer: TopicLayerKey) => void;
  closeTopic: () => void;
  refreshTopic: () => void;
  toggleGroup: (groupKey: string) => void;
  toggleLayerVisible: (key: TopicLayerKey) => void;
  toggleLabel: (key: TopicLayerKey) => void;
  toggleLod?: (key: TopicLayerKey) => void;
  tilesetVisible: Ref<boolean>;
  toggleTileset: () => void;
}

export interface TopicPanelGroup {
  key: string;
  title: string;
  open: boolean;
  layers: TopicPanelLayer[];
}

export interface TopicPanelLayer {
  key: TopicLayerKey;
  label: string;
  active: boolean;
  labelEnabled: boolean;
  visible: boolean;
  lodEnabled: boolean;
}

const LAYER_META: TopicLayerMeta[] = [
  { key: 'district', label: '区县', supportLabel: true, supportToggle: true },
  { key: 'township', label: '乡镇/街道', supportLabel: true, supportToggle: true },
  { key: 'community', label: '社区', supportLabel: true, supportToggle: true },
  { key: 'grid', label: '网格', supportLabel: true, supportToggle: true }
];

export function useTopicPanel(options: TopicPanelOptions): TopicPanelController {
  const {
    topicState,
    currentActiveLayer,
    toggleLayerVisible,
    toggleLabel,
    toggleLod,
    refreshLayers,
    tilesetVisible,
    toggleTileset
  } = options;

  const visible = ref(false);

  const groups = computed<TopicPanelGroup[]>(() => {
    const adminGroup: TopicPanelGroup = {
      key: 'admin',
      title: '行政区划',
      open: topicState.groups.adminOpen ?? true,
      layers: LAYER_META.map((meta) => ({
        key: meta.key,
        label: meta.label,
        active:
          currentActiveLayer.value === meta.key ||
          (typeof currentActiveLayer.value === 'object' &&
            (currentActiveLayer.value as any)?.value === meta.key),
        labelEnabled: topicState.labels?.[meta.key] !== false,
        visible: topicState.layerVisible?.[meta.key] !== false,
        lodEnabled: topicState.lod?.[meta.key] !== false
      }))
    };

    return [adminGroup];
  });

  const togglePanel = () => {
    visible.value = !visible.value;
  };

  const openTopic = (layer: TopicLayerKey) => {
    visible.value = true;
    if (topicState.layerVisible?.[layer] === false) {
      toggleLayerVisible(layer);
    }
  };

  const closeTopic = () => {
    visible.value = false;
  };

  const refreshTopic = () => {
    refreshLayers?.();
  };

  const toggleGroup = (groupKey: string) => {
    topicState.groups[groupKey] = !topicState.groups[groupKey];
  };

  return {
    visible,
    groups,
    togglePanel,
    openTopic,
    closeTopic,
    refreshTopic,
    toggleGroup,
    toggleLayerVisible,
    toggleLabel,
    toggleLod,
    tilesetVisible,
    toggleTileset
  };
}
