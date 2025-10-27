import type { Viewer } from 'cesium';
import type { CesiumLogHandler } from '@/constants/cesium';

export interface ViewerBootPayload {
  Cesium: typeof import('cesium');
  container: HTMLElement;
  viewerOptions?: Viewer.ConstructorOptions;
  resumeRenderLoop?: () => void;
  pauseRenderLoop?: () => void;
  scheduleRestart?: (reason?: string) => void;
  logger?: CesiumLogHandler;
}

export interface ViewerBootContext {
  Cesium: typeof import('cesium');
  viewer: Viewer;
  container: HTMLElement;
  logger: CesiumLogHandler;
  disposers: Array<() => void>;
  payload: ViewerBootPayload;
}

export interface CesiumProviderHooks {
  beforeViewerReady?(ctx: ViewerBootContext): void | Promise<void>;
  afterViewerReady?(ctx: ViewerBootContext): void | Promise<void>;
  onDestroy?(ctx: ViewerBootContext): void | Promise<void>;
}

export type ViewerPluginDisposer = () => void;

export function createViewerContext(payload: ViewerBootPayload): ViewerBootContext {
  const {
    Cesium,
    container,
    viewerOptions,
    resumeRenderLoop,
    pauseRenderLoop,
    scheduleRestart,
    logger = () => {}
  } = payload;

  const viewer = new Cesium.Viewer(container, viewerOptions);
  resumeRenderLoop?.();

  const disposers: Array<() => void> = [];

  const guardRenderable = () => {
    const canvas = viewer.scene?.canvas;
    const renderable =
      !!canvas &&
      canvas.clientWidth > 0 &&
      canvas.clientHeight > 0 &&
      canvas.width > 0 &&
      canvas.height > 0;

    if (!renderable) {
      pauseRenderLoop?.();
      try {
        viewer.scene.requestRenderMode = true;
      } catch (_) {
        /* ignore */
      }
      scheduleRestart?.('preRender');
      return;
    }

    resumeRenderLoop?.();
    try {
      viewer.scene.requestRenderMode = false;
    } catch (_) {
      /* ignore */
    }
  };

  try {
    viewer.scene.preRender.addEventListener(guardRenderable);
    disposers.push(() => {
      viewer.scene.preRender.removeEventListener(guardRenderable);
    });
  } catch (_) {
    /* ignore */
  }

  return {
    Cesium,
    viewer,
    container,
    logger,
    disposers,
    payload
  };
}

export async function installViewerPlugins(
  ctx: ViewerBootContext,
  providers: CesiumProviderHooks[]
): Promise<ViewerPluginDisposer> {
  const cleanupStack: ViewerPluginDisposer[] = [];

  for (const provider of providers) {
    if (!provider?.beforeViewerReady) continue;
    await Promise.resolve(provider.beforeViewerReady(ctx));
  }

  for (const provider of providers) {
    if (!provider?.afterViewerReady) continue;
    const result = await Promise.resolve(provider.afterViewerReady(ctx));
    if (typeof result === 'function') {
      cleanupStack.push(result);
    }
  }

  const disposer: ViewerPluginDisposer = () => {
    while (cleanupStack.length) {
      const fn = cleanupStack.pop();
      try {
        fn?.();
      } catch (_) {
        /* ignore */
      }
    }
    for (const provider of providers) {
      if (!provider?.onDestroy) continue;
      try {
        provider.onDestroy(ctx);
      } catch (_) {
        /* ignore */
      }
    }
  };

  ctx.disposers.push(disposer);
  return disposer;
}

export function disposeViewerContext(ctx: ViewerBootContext): void {
  while (ctx.disposers.length) {
    const disposer = ctx.disposers.pop();
    try {
      disposer?.();
    } catch (_) {
      /* ignore */
    }
  }

  try {
    ctx.viewer.scene?.primitives?.removeAll?.();
  } catch (_) {
    /* ignore */
  }

  try {
    ctx.viewer.destroy();
  } catch (_) {
    /* ignore */
  }
}
