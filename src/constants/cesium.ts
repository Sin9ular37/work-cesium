import type { HeadingPitchRoll, Cartesian3 } from 'cesium';

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

export const DEFAULT_CAMERA_VIEW: CameraPose = {
  destination: {
    longitude: 126.535263,
    latitude: 45.803411,
    height: 50000
  },
  orientation: {
    heading: 0,
    pitch: -75,
    roll: 0
  },
  duration: 0
};

export const DEFAULT_ZOOM_LEVELS = {
  maxLevel: 18,
  minLevel: 10
};

export const DEFAULT_DISPLAY_THRESHOLDS: ZoomThresholds = {
  showTilesBelow: 500,
  hideTilesAbove: 700
};

export const CESIUM_BOOT_LOG_PREFIX = '[CesiumBoot]';
