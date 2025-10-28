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
  top: 60px;
  right: 10px;
  width: 320px;
  height: calc(100vh - 80px);
  background: #ffffff;
  color: #1f2937;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 1250;
}

.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 14px;
  background: #005FA2;
  color: #ffffff;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.info-btn {
  appearance: none;
  border: none;
  border-radius: 4px;
  padding: 0 10px;
  height: 30px;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  background: transparent;
  transition: background 0.18s ease, transform 0.18s ease;
}

.info-btn:hover {
  background: rgba(0, 0, 0, 0.12);
  transform: scale(1.06);
}

.info-body {
  padding: 12px 14px 16px;
  overflow-y: auto;
  line-height: 1.6;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-body .property-item {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.info-body .property-item strong {
  display: inline-block;
  min-width: 72px;
  color: #0b74da;
}

.info-body .entity-properties {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-body .geometry-info {
  border-top: 2px solid #0b74da;
  padding-top: 10px;
}

.info-body::-webkit-scrollbar {
  width: 8px;
}

.info-body::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.2);
  border-radius: 8px;
}

.info-body::-webkit-scrollbar-track {
  background: transparent;
}

@media (max-width: 992px) {
  .info-panel {
    right: 12px;
    width: 300px;
  }
}

@media (max-width: 576px) {
  .info-panel {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: 48vh;
    border-radius: 12px 12px 0 0;
  }

  .info-header {
    border-radius: 12px 12px 0 0;
  }
}
</style>
