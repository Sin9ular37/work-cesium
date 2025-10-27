import { readonly, ref, reactive } from 'vue';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  type?: ToastLevel;
  duration?: number;
}

export interface ToastPayload {
  id: number;
  message: string;
  type: ToastLevel;
  duration: number;
  createdAt: number;
}

export interface SpinnerState {
  active: boolean;
  message: string;
}

const toasts = ref<ToastPayload[]>([]);
const spinner = reactive<SpinnerState>({
  active: false,
  message: ''
});

let toastSeed = 0;

const normalizeDuration = (duration?: number) => {
  if (duration === 0) return 0;
  if (typeof duration === 'number' && duration > 0) return duration;
  return 2200;
};

const pushToast = (toast: ToastPayload) => {
  toasts.value = [...toasts.value, toast];
  if (toast.duration > 0) {
    window.setTimeout(() => dismissToast(toast.id), toast.duration);
  }
};

export const notify = (message: string, options: ToastOptions = {}) => {
  if (!message) return;
  const type: ToastLevel = options.type ?? 'info';
  const duration = normalizeDuration(options.duration);
  const toast: ToastPayload = {
    id: ++toastSeed,
    message,
    type,
    duration,
    createdAt: Date.now()
  };
  pushToast(toast);
  return toast.id;
};

export const dismissToast = (id: number) => {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
};

export const clearToasts = () => {
  toasts.value = [];
};

export const setSpinner = (active: boolean, message = '') => {
  spinner.active = active;
  spinner.message = active ? message : '';
};

export interface ConfirmOptions {
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export const confirmAction = async (options: ConfirmOptions) => {
  const { message } = options;
  if (typeof window === 'undefined') {
    return false;
  }
  return window.confirm(message);
};

export const useUiFeedback = () => ({
  toasts: readonly(toasts),
  spinner: readonly(spinner),
  notify,
  dismissToast,
  clearToasts,
  setSpinner,
  confirmAction
});
