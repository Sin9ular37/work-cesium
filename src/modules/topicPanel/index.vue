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
  top: 50px;
  right: 16px;
  width: 320px;
  max-height: calc(100vh - 70px);
  display: flex;
  flex-direction: column;
  background: rgba(18, 25, 37, 0.94);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
  color: #ffffff;
  overflow: hidden;
  z-index: 1900;
  backdrop-filter: blur(8px);
}

.topic-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.topic-header .title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  appearance: none;
  border: none;
  border-radius: 12px;
  padding: 4px 10px;
  height: 28px;
  min-width: 28px;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.18s ease;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.22);
}

.topic-body {
  padding: 12px 16px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.topic-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
}

.caret {
  font-size: 14px;
}

.group-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.topic-item {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  transition: background 0.18s ease, border 0.18s ease;
}

.topic-item.active {
  border: 1px solid rgba(102, 191, 255, 0.5);
  background: rgba(102, 191, 255, 0.15);
}

.topic-item.disabled {
  opacity: 0.6;
}

.topic-item .label {
  font-size: 14px;
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 8px;
}

.act-btn {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.act-btn:hover,
.act-btn.active {
  background: rgba(102, 191, 255, 0.25);
  border-color: rgba(102, 191, 255, 0.6);
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.09);
  margin: 4px 0;
}

.topic-tileset .topic-item {
  justify-content: space-between;
}
</style>
