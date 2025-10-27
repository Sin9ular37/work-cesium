import { computed, reactive, ref, watch, type Ref } from 'vue';
import type { ToastLevel } from './useUiFeedback';

export type SearchLayerKey = 'district' | 'township' | 'community' | 'grid';

export interface GeoSearchEntity {
  entity: any;
  name: string;
  layerKey: SearchLayerKey | string;
}

export interface GeoSearchResults {
  district: GeoSearchEntity[];
  township: GeoSearchEntity[];
  community: GeoSearchEntity[];
  grid: GeoSearchEntity[];
  [key: string]: GeoSearchEntity[];
}

export interface SearchWidgetHooks {
  searchQuery: Ref<string>;
  searchResults: GeoSearchResults;
  searchFilter: Record<string, boolean>;
  searchInGeojsonLayers: (query: string) => Promise<GeoSearchResults>;
  highlightEntity: (entity: any, options?: Record<string, unknown>) => void;
  notify?: (message: string, options?: { type?: ToastLevel; duration?: number }) => void;
}

export interface SearchWidgetController {
  query: Ref<string>;
  isSearching: Ref<boolean>;
  dropdownVisible: Ref<boolean>;
  activeIndex: Ref<number>;
  filters: Record<string, boolean>;
  groupedResults: Ref<GroupedResult[]>;
  flatResults: Ref<GeoSearchEntity[]>;
  initSearchWidget: () => void;
  destroySearchWidget: () => void;
  handleInput: () => void;
  forceSearch: () => Promise<void>;
  moveSelection: (delta: number) => void;
  selectActive: () => void;
  selectResult: (item: GeoSearchEntity) => void;
  clearQuery: () => void;
  closeDropdown: () => void;
  toggleFilter: (key: string) => void;
}

export interface GroupedResult {
  key: SearchLayerKey;
  label: string;
  items: GeoSearchEntity[];
}

const LAYER_LABELS: Record<SearchLayerKey, string> = {
  district: '区划',
  township: '乡镇/街道',
  community: '社区',
  grid: '网格'
};

const DEFAULT_FILTERS: Record<SearchLayerKey, boolean> = {
  district: false,
  township: true,
  community: true,
  grid: true
};

export function useSearchWidget({
  searchQuery,
  searchResults,
  searchFilter,
  searchInGeojsonLayers,
  highlightEntity,
  notify
}: SearchWidgetHooks): SearchWidgetController {
  const dropdownVisible = ref(false);
  const isSearching = ref(false);
  const activeIndex = ref(-1);
  const debounceTimer = ref<number | null>(null);

  // 初始化默认过滤器
  Object.keys(DEFAULT_FILTERS).forEach((key) => {
    if (!(key in searchFilter)) {
      searchFilter[key] = DEFAULT_FILTERS[key as SearchLayerKey];
    }
  });

  const groupedResults = computed<GroupedResult[]>(() => {
    const keys: SearchLayerKey[] = ['district', 'township', 'community', 'grid'];
    return keys
      .filter((key) => searchFilter[key])
      .map((key) => ({
        key,
        label: LAYER_LABELS[key],
        items: searchResults[key] ?? []
      }))
      .filter((group) => group.items.length > 0);
  });

  const flatResults = computed(() => groupedResults.value.flatMap((group) => group.items));

  const clearDebounce = () => {
    if (debounceTimer.value) {
      window.clearTimeout(debounceTimer.value);
      debounceTimer.value = null;
    }
  };

  const performSearch = async () => {
    const keyword = searchQuery.value.trim();
    clearDebounce();
    if (!keyword) {
      dropdownVisible.value = false;
      activeIndex.value = -1;
      return;
    }
    isSearching.value = true;
    try {
      await searchInGeojsonLayers(keyword);
      const hasResult = groupedResults.value.length > 0;
      dropdownVisible.value = hasResult;
      activeIndex.value = hasResult ? 0 : -1;
      if (!hasResult && notify) {
        notify('未找到匹配结果', { type: 'warning' });
      }
    } catch (error) {
      console.warn('[search] 执行失败', error);
      dropdownVisible.value = false;
      if (notify) {
        notify('搜索失败，请稍后重试', { type: 'error' });
      }
    } finally {
      isSearching.value = false;
    }
  };

  const handleInput = () => {
    dropdownVisible.value = false;
    activeIndex.value = -1;
    clearDebounce();
    debounceTimer.value = window.setTimeout(() => {
      performSearch();
    }, 260);
  };

  const moveSelection = (delta: number) => {
    if (!dropdownVisible.value || !flatResults.value.length) {
      return;
    }
    const next = (activeIndex.value + delta + flatResults.value.length) % flatResults.value.length;
    activeIndex.value = next;
  };

  const selectResult = (item: GeoSearchEntity) => {
    if (!item) return;
    try {
      highlightEntity(item.entity, { layerKey: item.layerKey });
      dropdownVisible.value = false;
    } catch (error) {
      console.warn('[search] highlight 失败', error);
    }
  };

  const selectActive = () => {
    const item = flatResults.value[activeIndex.value];
    if (item) {
      selectResult(item);
    }
  };

  const clearQuery = () => {
    searchQuery.value = '';
    dropdownVisible.value = false;
    activeIndex.value = -1;
  };

  const closeDropdown = () => {
    dropdownVisible.value = false;
    activeIndex.value = -1;
  };

  const toggleFilter = (key: string) => {
    if (!(key in searchFilter)) return;
    searchFilter[key] = !searchFilter[key];
    performSearch();
  };

  const initSearchWidget = () => {
    if (searchQuery.value) {
      performSearch();
    }
  };

  const destroySearchWidget = () => {
    clearDebounce();
    dropdownVisible.value = false;
    activeIndex.value = -1;
  };

  watch(searchQuery, (value) => {
    if (!value) {
      dropdownVisible.value = false;
      activeIndex.value = -1;
    }
  });

  return {
    query: searchQuery,
    isSearching,
    dropdownVisible,
    activeIndex,
    filters: searchFilter,
    groupedResults,
    flatResults,
    initSearchWidget,
    destroySearchWidget,
    handleInput,
    forceSearch: performSearch,
    moveSelection,
    selectActive,
    selectResult,
    clearQuery,
    closeDropdown,
    toggleFilter
  };
}
