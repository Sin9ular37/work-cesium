<template>
  <div ref="root" class="search-widget">
    <div class="search-input-wrapper" :class="{ active: controller.dropdownVisible.value }">
      <span class="search-icon" @click="controller.forceSearch">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="M15.5 14h-.79l-.28-.27a6.471 6.471 0 0 0 1.57-4.23A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 5 1.5-1.5-5-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
      </span>
      <input
        v-model="controller.query.value"
        class="search-input"
        type="text"
        :placeholder="placeholder"
        autocomplete="off"
        @input="controller.handleInput"
        @keydown="handleKeydown"
      />
      <button
        v-if="controller.query.value"
        class="search-clear"
        type="button"
        @click="handleClear"
      >
        ×
      </button>
      <span v-if="controller.isSearching.value" class="search-spinner" />
    </div>

    <transition name="search-dropdown">
      <div v-if="controller.dropdownVisible.value" class="search-dropdown">
        <div class="search-filters">
          <button
            v-for="filter in filters"
            :key="filter.key"
            type="button"
            :class="{ active: filter.active }"
            @click="controller.toggleFilter(filter.key)"
          >
            {{ filter.label }}
          </button>
        </div>
        <ul class="search-result-list">
          <template v-for="group in groupedWithIndex" :key="group.key">
            <li class="search-group-title">
              {{ group.label }}（{{ group.count }}）
            </li>
            <li
              v-for="entry in group.entries"
              :key="`${group.key}-${entry.absoluteIndex}`"
              :class="['search-result-item', { active: controller.activeIndex.value === entry.absoluteIndex }]"
              @mouseenter="controller.activeIndex.value = entry.absoluteIndex"
              @mouseleave="controller.activeIndex.value = -1"
              @click="controller.selectResult(entry.item)"
            >
              <div class="result-primary">
                <span class="result-name">{{ entry.item.name }}</span>
                <span class="result-index">#{{ entry.absoluteIndex + 1 }}</span>
              </div>
              <div class="result-layer">{{ group.label }}</div>
            </li>
          </template>
          <li v-if="controller.flatResults.value.length === 0" class="search-empty">
            未筛选到符合条件的图层
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { SearchWidgetController } from '../../composables/useSearchWidget';

const props = defineProps<{
  controller: SearchWidgetController;
  placeholder?: string;
}>();

const placeholder = props.placeholder ?? '请输入地址/名称…';
const controller = props.controller;
const root = ref<HTMLDivElement | null>(null);

const layerLabels: Record<string, string> = {
  district: '区划',
  township: '乡镇/街道',
  community: '社区',
  grid: '网格'
};

const filters = computed(() =>
  Object.entries(controller.filters).map(([key, active]) => {
    const group = controller.groupedResults.value.find((item) => item.key === key);
    const label = layerLabels[key] ?? group?.label ?? key;
    return {
      key,
      active,
      label
    };
  })
);

const groupedWithIndex = computed(() => {
  let offset = 0;
  return controller.groupedResults.value.map((group) => {
    const entries = group.items.map((item) => {
      const entry = { item, absoluteIndex: offset };
      offset += 1;
      return entry;
    });
    return {
      ...group,
      count: group.items.length,
      entries
    };
  });
});

const handleDocumentClick = (event: MouseEvent) => {
  const target = event.target as Node | null;
  if (root.value && target && !root.value.contains(target)) {
    controller.closeDropdown();
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    controller.moveSelection(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    controller.moveSelection(-1);
  } else if (event.key === 'Enter') {
    if (controller.dropdownVisible.value && controller.activeIndex.value >= 0) {
      event.preventDefault();
      controller.selectActive();
    } else {
      controller.forceSearch();
    }
  } else if (event.key === 'Escape') {
    controller.closeDropdown();
  }
};

const handleClear = () => {
  controller.clearQuery();
};

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick, true);
  controller.initSearchWidget();
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick, true);
  controller.destroySearchWidget();
});
</script>

<style scoped>
.search-widget {
  position: relative;
  width: 100%;
  max-width: 320px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 18px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.24);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  padding-left: 34px;
}

.search-input-wrapper.active,
.search-input-wrapper:focus-within {
  border-color: rgba(102, 191, 255, 0.75);
  box-shadow: 0 0 0 3px rgba(102, 191, 255, 0.3);
}

.search-icon {
  position: absolute;
  left: 12px;
  color: rgba(255, 255, 255, 0.8);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 18px;
  height: 18px;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 36px 0 0;
  border: none;
  outline: none;
  background: transparent;
  color: #ffffff;
  font-size: 14px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s ease;
  font-size: 16px;
  line-height: 1;
}

.search-clear:hover {
  background: rgba(255, 255, 255, 0.32);
}

.search-spinner {
  position: absolute;
  right: 42px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: rgba(255, 255, 255, 0.85);
  animation: search-spin 0.8s linear infinite;
}

.search-dropdown-enter-active,
.search-dropdown-leave-active {
  transition: all 0.18s ease;
}

.search-dropdown-enter-from,
.search-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.search-dropdown {
  position: absolute;
  z-index: 2000;
  left: 0;
  right: 0;
  margin-top: 6px;
  background: rgba(12, 17, 26, 0.94);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  overflow: hidden;
}

.search-filters {
  display: flex;
  gap: 6px;
  padding: 10px 12px 0;
}

.search-filters button {
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.search-filters button.active {
  background: rgba(102, 191, 255, 0.32);
  border-color: rgba(102, 191, 255, 0.65);
}

.search-result-list {
  list-style: none;
  margin: 10px 0 8px;
  padding: 0 8px 8px;
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-group-title {
  padding: 6px 8px 2px;
  font-size: 12px;
  opacity: 0.65;
  letter-spacing: 0.3px;
}

.search-result-item {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: background 0.15s ease;
}

.search-result-item:hover,
.search-result-item.active {
  background: rgba(102, 191, 255, 0.22);
}

.result-primary {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-name {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}

.result-index {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.25);
  padding: 2px 6px;
  border-radius: 8px;
}

.result-layer {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.search-empty {
  padding: 14px 12px;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

@keyframes search-spin {
  to {
    transform: translateY(-50%) rotate(360deg);
  }
}
</style>
