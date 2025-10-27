<template>
  <div v-if="controller.visible.value" class="info-panel">
    <header class="info-header">
      <span class="title">详细信息</span>
      <button class="info-btn" type="button" @click="controller.close()">×</button>
    </header>
    <section class="info-body" v-html="controller.content.value" />
  </div>
</template>

<script setup lang="ts">
import type { InfoPanelController } from '../../composables/useInfoPanel';

const props = defineProps<{
  controller: InfoPanelController;
}>();

const controller = props.controller;
</script>

<style scoped>
.info-panel {
  position: absolute;
  top: 50px;
  left: 16px;
  width: 320px;
  max-height: calc(100vh - 70px);
  background: rgba(21, 27, 38, 0.95);
  color: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 1850;
  backdrop-filter: blur(8px);
}

.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.title {
  font-size: 16px;
  font-weight: 600;
}

.info-btn {
  appearance: none;
  border: none;
  border-radius: 12px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.18s ease;
}

.info-btn:hover {
  background: rgba(255, 255, 255, 0.24);
}

.info-body {
  padding: 12px 16px 18px;
  overflow-y: auto;
  line-height: 1.6;
}

.info-body .property-item {
  margin-bottom: 6px;
  font-size: 13px;
}

.info-body .property-item strong {
  display: inline-block;
  min-width: 72px;
  color: rgba(255, 255, 255, 0.85);
}

.info-body .entity-properties {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
