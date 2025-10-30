import type { HeadingPitchRoll, Cartesian3 } from 'cesium';
import { APP_CONFIG, cloneConfigSection } from '@/config/appConfig';

export interface CameraPose {
  destination: Cartesian3 | {
    longitude: number;
    latitude: number;
    height: number;
  };
  orientation?: HeadingPitchRoll | {
    heading: number;
    pitch: number;
    roll: number;
  };
  duration?: number;
}

export interface ZoomThresholds {
  showTilesBelow: number;
  hideTilesAbove: number;
}

export type CesiumLogHandler = (...args: unknown[]) => void;

const cameraConfig = APP_CONFIG.camera || {};
const displayConfig = APP_CONFIG.display || {};

export const DEFAULT_CAMERA_VIEW: CameraPose = cloneConfigSection(
  cameraConfig.defaultView || {}
) as CameraPose;

export const DEFAULT_ZOOM_LEVELS = cloneConfigSection(cameraConfig.zoomLevels || {});

export const DEFAULT_DISPLAY_THRESHOLDS: ZoomThresholds = cloneConfigSection(
  displayConfig.thresholds || {}
) as ZoomThresholds;

export const CESIUM_BOOT_LOG_PREFIX = '[CesiumBoot]';
