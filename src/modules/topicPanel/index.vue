<template>
  <div v-if="controller.visible.value" class="topic-panel">
    <div class="topic-header">
      <div class="title">专题图层</div>
      <div class="header-actions">
        <!-- <button class="icon-btn" type="button" @click="controller.refreshTopic">刷新</button> -->
        <button class="icon-btn" type="button" @click="controller.closeTopic">×</button>
      </div>
    </div>

    <div class="topic-body">
      <section v-for="group in controller.groups.value" :key="group.key" class="topic-group">
        <header class="group-head" @click="controller.toggleGroup(group.key)">
          <span class="caret">{{ group.open ? '▾' : '▸' }}</span>
          <span class="group-title">{{ group.title }}</span>
        </header>

        <div v-show="group.open" class="group-content">
          <article
            v-for="layer in group.layers"
            :key="layer.key"
            class="topic-item"
            :class="{ disabled: !layer.lodEnabled, active: layer.active }"
          >
            <div class="label">{{ layer.label }}</div>
            <div class="actions">
              <!-- <button
                v-if="layer.lodEnabled && controller.toggleLod"
                class="act-btn"
                type="button"
                @click.stop="controller.toggleLod(layer.key)"
              >
                {{ layer.lodEnabled ? 'LOD' : '启用' }}
              </button> -->
              <button
                v-if="layer.labelEnabled !== undefined"
                class="act-btn"
                type="button"
                :class="{ active: layer.labelEnabled }"
                @click.stop="controller.toggleLabel(layer.key)"
              >
                {{ layer.labelEnabled ? '隐藏标注' : '显示标注' }}
              </button>
              <button
                class="act-btn"
                type="button"
                :class="{ active: layer.visible }"
                @click.stop="controller.toggleLayerVisible(layer.key)"
              >
                {{ layer.visible ? '隐藏图层' : '显示图层' }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <div class="divider" />

      <section class="topic-group topic-tileset">
        <div class="topic-item">
          <div class="label">实景三维</div>
          <div class="actions">
            <button
              class="act-btn"
              type="button"
              :class="{ active: controller.tilesetVisible.value }"
              @click="controller.toggleTileset"
            >
              {{ controller.tilesetVisible.value ? '隐藏模型' : '显示模型' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TopicPanelController } from '../../composables/useTopicPanel';

defineProps<{
  controller: TopicPanelController;
}>();
</script>

<style scoped>
.topic-panel {
  position: absolute;
  top: 60px;
  right: 10px;
  width: 320px;
  height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #1f2937;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  z-index: 1200;
}

.topic-header {
  height: 44px;
  background: #005FA2;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
}

.topic-header .title {
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  appearance: none;
  border: none;
  border-radius: 4px;
  padding: 0 10px;
  height: 30px;
  min-width: 30px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  transition: background 0.18s ease, transform 0.18s ease;
}

.icon-btn:hover {
  background: rgba(0, 0, 0, 0.12);
  transform: scale(1.06);
}

.topic-body {
  padding: 12px 14px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.topic-group {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  overflow: hidden;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f9fafb;
  font-size: 14px;
  cursor: pointer;
  color: #1f2937;
  font-weight: 600;
  transition: background 0.18s ease;
}

.group-head:hover {
  background: #e6f2fb;
}

.caret {
  font-size: 14px;
  color: #6b7280;
}

.group-content {
  display: flex;
  flex-direction: column;
  padding: 8px 10px 10px;
  gap: 8px;
}

.topic-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 6px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}

.topic-item:last-child {
  border-bottom: none;
}

.topic-item.disabled {
  color: #9ca3af;
  opacity: 0.75;
}

.topic-item.disabled .act-btn {
  pointer-events: none;
  background: #f3f4f6;
  border-color: #e5e7eb;
  color: #9ca3af;
}

.topic-item.active {
  background: #e6f2fb;
  border-radius: 4px;
  border-bottom-color: transparent;
}

.topic-item .label {
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 8px;
}

.act-btn {
  appearance: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0 10px;
  height: 30px;
  background: #f6f8fa;
  color: #1f2937;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.act-btn:hover,
.act-btn.active {
  background: #0b74da;
  border-color: #0b74da;
  color: #ffffff;
}

.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}

.topic-tileset .topic-item {
  justify-content: space-between;
  border-bottom: none;
}

@media (max-width: 992px) {
  .topic-panel {
    right: 12px;
    width: 300px;
  }
}

@media (max-width: 576px) {
  .topic-panel {
    top: auto;
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    height: 52vh;
    border-radius: 12px 12px 0 0;
  }

  .topic-header {
    border-radius: 12px 12px 0 0;
  }
}
</style>
