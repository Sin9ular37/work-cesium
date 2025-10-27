import { reactive, ref, type Ref } from 'vue';

export interface InfoPanelPayload {
  content: string;
  entity: any;
  layerKey?: string;
}

export interface HoverState {
  entity: any;
  layerKey?: string;
}

export interface InfoPanelController {
  visible: Ref<boolean>;
  content: Ref<string>;
  hovered: Ref<HoverState | null>;
  selected: Ref<HoverState | null>;
  open: (payload: InfoPanelPayload) => void;
  close: () => void;
  setHover: (payload: HoverState | null) => void;
  clearHover: () => void;
  clear: () => void;
}

export function useInfoPanel(): InfoPanelController {
  const visible = ref(false);
  const content = ref('');
  const hovered = ref<HoverState | null>(null);
  const selected = ref<HoverState | null>(null);

  const open = (payload: InfoPanelPayload) => {
    content.value = payload.content;
    selected.value = {
      entity: payload.entity,
      layerKey: payload.layerKey
    };
    visible.value = true;
  };

  const close = () => {
    visible.value = false;
    content.value = '';
    selected.value = null;
  };

  const setHover = (payload: HoverState | null) => {
    hovered.value = payload;
  };

  const clearHover = () => {
    hovered.value = null;
  };

  const clear = () => {
    content.value = '';
    hovered.value = null;
    selected.value = null;
    visible.value = false;
  };

  return {
    visible,
    content,
    hovered,
    selected,
    open,
    close,
    setHover,
    clearHover,
    clear
  };
}
