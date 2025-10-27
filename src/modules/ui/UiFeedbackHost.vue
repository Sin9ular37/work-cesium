<template>
  <teleport to="body">
    <div class="ui-feedback-toast-container" aria-live="polite" aria-atomic="true">
      <transition-group name="ui-feedback-toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="ui-feedback-toast"
          :class="`is-${toast.type}`"
        >
          <span class="toast-message">{{ toast.message }}</span>
          <button class="toast-close" type="button" @click="dismiss(toast.id)">×</button>
        </div>
      </transition-group>
    </div>
  </teleport>

  <teleport to="body">
    <div v-if="spinner.active" class="ui-feedback-spinner-mask">
      <div class="ui-feedback-spinner">
        <span class="spinner-indicator" />
        <p class="spinner-text">{{ spinner.message || '正在处理…' }}</p>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { useUiFeedback } from '../../composables/useUiFeedback';

const { toasts, spinner, dismissToast } = useUiFeedback();

const dismiss = (id: number) => {
  dismissToast(id);
};
</script>

<style scoped>
.ui-feedback-toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2200;
  pointer-events: none;
}

.ui-feedback-toast-enter-active,
.ui-feedback-toast-leave-active {
  transition: all 0.18s ease;
}

.ui-feedback-toast-enter-from,
.ui-feedback-toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.ui-feedback-toast {
  min-width: 200px;
  max-width: 320px;
  padding: 10px 12px;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  color: #ffffff;
  backdrop-filter: blur(6px);
  background: rgba(29, 35, 46, 0.92);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  pointer-events: auto;
}

.ui-feedback-toast.is-success {
  background: rgba(20, 108, 67, 0.92);
}

.ui-feedback-toast.is-warning {
  background: rgba(178, 107, 0, 0.92);
}

.ui-feedback-toast.is-error {
  background: rgba(166, 38, 54, 0.92);
}

.toast-message {
  flex: 1;
  font-size: 13px;
  line-height: 18px;
}

.toast-close {
  appearance: none;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.toast-close:hover {
  background: rgba(255, 255, 255, 0.28);
}

.ui-feedback-spinner-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 26, 0.45);
  z-index: 2190;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.ui-feedback-spinner {
  min-width: 220px;
  padding: 24px 28px;
  border-radius: 14px;
  background: rgba(19, 24, 33, 0.94);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
}

.spinner-indicator {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: rgba(255, 255, 255, 0.85);
  animation: ui-feedback-spin 0.85s linear infinite;
}

.spinner-text {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.2px;
}

@keyframes ui-feedback-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
