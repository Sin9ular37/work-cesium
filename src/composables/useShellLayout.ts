import { onMounted, onUnmounted, reactive, readonly, watch, type Ref } from 'vue';

type ShortcutHandler = (event: KeyboardEvent) => void;

interface ShortcutEntry {
  key: string;
  handler: ShortcutHandler;
}

export interface ShellLayoutController {
  panelStates: Readonly<Record<string, boolean>>;
  registerPanel: (name: string, state: Ref<boolean>) => () => void;
  registerShortcut: (key: string, handler: ShortcutHandler) => () => void;
  setPanelVisible: (name: string, value: boolean) => void;
  togglePanel: (name: string) => void;
}

export function useShellLayout(): ShellLayoutController {
  const panelStates = reactive<Record<string, boolean>>({});
  const shortcuts = new Map<string, ShortcutEntry>();
  const panelDisposers: Array<() => void> = [];

  const normalizeKey = (key: string) => key.trim().toLowerCase();

  const keydownHandler = (event: KeyboardEvent) => {
    const key = normalizeKey(event.key);
    const entry = shortcuts.get(key);
    if (entry) {
      entry.handler(event);
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', keydownHandler, true);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', keydownHandler, true);
    panelDisposers.forEach((dispose) => dispose());
    shortcuts.clear();
  });

  const registerPanel = (name: string, state: Ref<boolean>) => {
    panelStates[name] = state.value;
    const stop = watch(
      state,
      (value) => {
        panelStates[name] = value;
      },
      { immediate: false }
    );
    panelDisposers.push(() => {
      stop();
      delete panelStates[name];
    });
    return () => {
      stop();
      delete panelStates[name];
    };
  };

  const registerShortcut = (key: string, handler: ShortcutHandler) => {
    const normalized = normalizeKey(key);
    shortcuts.set(normalized, { key: normalized, handler });
    return () => {
      shortcuts.delete(normalized);
    };
  };

  const setPanelVisible = (name: string, value: boolean) => {
    panelStates[name] = value;
  };

  const togglePanel = (name: string) => {
    panelStates[name] = !panelStates[name];
  };

  return {
    panelStates: readonly(panelStates),
    registerPanel,
    registerShortcut,
    setPanelVisible,
    togglePanel
  };
}
