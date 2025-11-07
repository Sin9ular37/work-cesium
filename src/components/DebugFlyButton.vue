<template>
  <button class="debug-fly-btn" type="button" @click="emit('trigger')">
    <slot>测试定位</slot>
  </button>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (event: 'trigger'): void;
}>();
</script>

<style scoped>
.debug-fly-btn {
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: background 0.2s ease, transform 0.2s ease;
}

.debug-fly-btn:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: translateY(-1px);
}

.debug-fly-btn:active {
  transform: scale(0.97);
}
</style>
