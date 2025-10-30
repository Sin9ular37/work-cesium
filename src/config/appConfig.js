export const APP_CONFIG = {
  display: {
    thresholds: {
      showTilesBelow: 500,
      hideTilesAbove: 700
    },
    hysteresis: 150,
    gridOffsets: {
      layer: 150,
      label: 150
    },
    labelLimitRules: {
      default: [
        { maxDistance: 500, limit: 20 },
        { maxDistance: 1000, limit: 15 },
        { maxDistance: 2000, limit: 10 },
        { maxDistance: 4000, limit: 5 },
        { maxDistance: Number.POSITIVE_INFINITY, limit: 3 }
      ],
      district: [
        { maxDistance: 60000, limit: 20 },
        { maxDistance: 120000, limit: 12 },
        { maxDistance: Number.POSITIVE_INFINITY, limit: 8 }
      ],
      township: [
        { maxDistance: 8000, limit: 20 },
        { maxDistance: 20000, limit: 12 },
        { maxDistance: Number.POSITIVE_INFINITY, limit: 6 }
      ],
      community: [
        { maxDistance: 5000, limit: 20 },
        { maxDistance: 12000, limit: 10 },
        { maxDistance: Number.POSITIVE_INFINITY, limit: 5 }
      ],
      grid: [
        { maxDistance: 1500, limit: 24 },
        { maxDistance: 4000, limit: 16 },
        { maxDistance: Number.POSITIVE_INFINITY, limit: 8 }
      ]
    }
  },
  geojson: {
    layers: {
      district: {
        name: '区县',
        url: './松北区县.geojson',
        minDistance: 30000,
        maxDistance: 150000,
        style: {
          fill: '#2563eb',
          fillAlpha: 0.25,
          outline: '#000000',
          outlineWidth: 3
        },
        labelStyle: {
          font: '30px Microsoft YaHei',
          fillColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 2,
          scale: 1.4,
          horizontalOrigin: 'CENTER',
          verticalOrigin: 'CENTER',
          maxVisibleDistance: 150000,
          showOnHover: true,
          showOnClick: true,
          showArea: true,
          showDistance: true
        },
        interactive: {
          clickable: true,
          hoverable: true,
          hoverStyle: {
            fill: '#ff6b6b',
            fillAlpha: 0.4,
            outline: '#ff0000',
            outlineWidth: 4
          }
        }
      },
      township: {
        name: '乡镇',
        url: './松北乡镇.geojson',
        minDistance: 20000,
        maxDistance: 30000,
        style: {
          fill: '#16a34a',
          fillAlpha: 0.25,
          outline: '#ffffff',
          outlineWidth: 2
        },
        labelStyle: {
          font: '20px Microsoft YaHei',
          fillColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 2,
          scale: 1.2,
          horizontalOrigin: 'CENTER',
          verticalOrigin: 'CENTER',
          maxVisibleDistance: 30000,
          showOnHover: true,
          showOnClick: true,
          showArea: true
        },
        interactive: {
          clickable: true,
          hoverable: true,
          hoverStyle: {
            fill: '#ff6b6b',
            fillAlpha: 0.4,
            outline: '#ff0000',
            outlineWidth: 3
          }
        }
      },
      community: {
        name: '社区',
        url: './松北社区.geojson',
        minDistance: 10000,
        maxDistance: 20000,
        style: {
          fill: '#f59e0b',
          fillAlpha: 0.25,
          outline: '#ffffff',
          outlineWidth: 2
        },
        labelStyle: {
          font: '18px Microsoft YaHei',
          fillColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 1,
          scale: 1.1,
          horizontalOrigin: 'CENTER',
          verticalOrigin: 'CENTER',
          maxVisibleDistance: 20000,
          showOnHover: true,
          showOnClick: true
        },
        interactive: {
          clickable: true,
          hoverable: true,
          hoverStyle: {
            fill: '#ff6b6b',
            fillAlpha: 0.4,
            outline: '#ff0000',
            outlineWidth: 2
          }
        }
      },
      grid: {
        name: '网格',
        url: './松北网格.geojson',
        minDistance: 0,
        maxDistance: 10000,
        style: {
          fill: '#ef4444',
          fillAlpha: 0.18,
          outline: '#ffffff',
          outlineWidth: 1
        },
        labelStyle: {
          font: '15px Microsoft YaHei',
          fillColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 1,
          scale: 1.0,
          horizontalOrigin: 'CENTER',
          verticalOrigin: 'CENTER',
          maxVisibleDistance: 10000,
          showOnHover: true,
          showOnClick: true
        },
        interactive: {
          clickable: true,
          hoverable: true,
          hoverStyle: {
            fill: '#ff6b6b',
            fillAlpha: 0.4,
            outline: '#ff0000',
            outlineWidth: 2
          }
        }
      }
    },
    flyCameraRange: {
      district: 50000,
      township: 25000,
      community: 15000,
      grid: 5000
    }
  },
  camera: {
    defaultView: {
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
    },
    zoomLevels: {
      maxLevel: 18,
      minLevel: 10
    }
  },
  tileset: {
    qualityTiers: [
      {
        maxDistance: 900,
        maximumScreenSpaceError: 2.4,
        maximumMemoryUsage: 896,
        dynamicScreenSpaceError: false
      },
      {
        maxDistance: 1600,
        maximumScreenSpaceError: 3.2,
        maximumMemoryUsage: 768,
        dynamicScreenSpaceError: true
      },
      {
        maxDistance: 2800,
        maximumScreenSpaceError: 5.0,
        maximumMemoryUsage: 640,
        dynamicScreenSpaceError: true
      },
      {
        maxDistance: Number.POSITIVE_INFINITY,
        maximumScreenSpaceError: 7.5,
        maximumMemoryUsage: 512,
        dynamicScreenSpaceError: true
      }
    ],
    gridQuality: {
      maximumScreenSpaceError: 2.0,
      maximumMemoryUsage: 1024,
      dynamicScreenSpaceError: false
    },
    screenSpaceErrorRange: {
      min: 1.8,
      max: 12
    },
    memoryUsageRange: {
      min: 256,
      max: 1536
    },
    dynamicScreenSpaceError: {
      disableBelowDistance: 1200
    },
    switchDelayMs: 180,
    clipping: {
      enabled: true,
      debugEdges: false,
      altitudeMargin: 1000,
      minHeight: -200,
      maxHeightCap: 8000,
      idleDebounceMs: 150,
      moveThrottleMs: 180,
      halfSizeRules: [
        { maxHeight: 300, halfSize: 800 },
        { maxHeight: 800, halfSize: 1500 },
        { maxHeight: 1500, halfSize: 2500 },
        { maxHeight: 3000, halfSize: 4500 },
        { maxHeight: 8000, halfSize: 9000 },
        { maxHeight: 20000, halfSize: 20000 },
        { maxHeight: Number.POSITIVE_INFINITY, halfSize: 40000 }
      ]
    }
  },
  basemap: {
    defaultArcGisUrl: 'https://data.hrbmap.org.cn/server/rest/services/Image/RS2024_4530/MapServer'
  },
  measurement: {
    pointStyle: {
      pixelSize: 16,
      color: '#FFFF00',
      outlineColor: '#000000',
      outlineWidth: 3
    },
    labelStyle: {
      font: '16pt Arial Bold',
      fillColor: '#FFFFFF',
      outlineColor: '#000000',
      outlineWidth: 3,
      pixelOffset: { x: 0, y: -35 }
    }
  },
  autoLabel: {
    defaultStyle: {
      font: '16px Microsoft YaHei',
      fillColor: '#FFFFFF',
      outlineColor: '#000000',
      outlineWidth: 2,
      style: 'FILL_AND_OUTLINE',
      pixelOffset: { x: 0, y: -15 },
      heightReference: 'NONE',
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale: 1.2,
      horizontalOrigin: 'CENTER',
      verticalOrigin: 'CENTER',
      distanceDisplayCondition: { near: 0.0, far: 5000 }
    }
  },
  cameraControls: {
    resolutionScaleRange: {
      min: 0.6,
      maxWhileMoving: 0.75
    },
    moveEndDebounceMs: 120,
    wheelIdleDebounceMs: 200,
    minTilesetSseWhileMoving: 8
  },
  highlight: {
    durationMs: 3000,
    intervalMs: 500
  },
  renderLifecycle: {
    restartCooldownMs: 2000,
    restartDelayMs: 300
  },
  scene: {
    toggles: {
      highDynamicRange: false,
      logarithmicDepthBuffer: false,
      fog: false,
      skyAtmosphere: false,
      sun: false,
      moon: false
    },
    requestRender: {
      enabled: true,
      maximumRenderTimeChangeMs: 1000 / 30
    },
    globe: {
      maximumScreenSpaceError: 6.0,
      tileCacheSize: 800
    },
    cameraController: {
      enableCollisionDetection: true,
      minimumCollisionTerrainHeight: 5.0
    },
    clock: {
      shouldAnimate: false
    }
  },
  tilesetLoader: {
    default: {
      show: false,
      heightOffset: 0,
      debug: false,
      cullWithChildrenBounds: true,
      dynamicScreenSpaceError: true,
      maximumScreenSpaceError: 48,
      maximumMemoryUsage: 256,
      skipLevelOfDetail: true,
      baseScreenSpaceError: 2048,
      skipScreenSpaceErrorFactor: 24,
      skipLevels: 2,
      immediatelyLoadDesiredLevelOfDetail: false,
      loadSiblings: false,
      clippingPlanes: undefined,
      cullRequestsWhileMoving: true,
      cullRequestsWhileMovingMultiplier: 20.0,
      preferLeaves: true,
      progressiveResolutionHeightFraction: 0.75,
      dynamicScreenSpaceErrorDensity: 0.00278,
      foveatedScreenSpaceError: true,
      foveatedConeSize: 0.1,
      foveatedMinimumScreenSpaceErrorRelaxation: 0.0,
      foveatedTimeDelay: 0.2,
      maximumNumberOfLoadedTiles: 128
    }
  },
  cesium: {
    defaultPosition: {
      longitude: 126.643927,
      latitude: 45.757446,
      height: 10000
    },
    buildingPositions: [
      {
        longitude: 126.53,
        latitude: 45.8,
        height: 100,
        name: '市中心主建筑',
        color: '#4A90E2'
      },
      {
        longitude: 126.535,
        latitude: 45.805,
        height: 80,
        name: '商业区建筑',
        color: '#50C878'
      },
      {
        longitude: 126.525,
        latitude: 45.795,
        height: 120,
        name: '高层建筑',
        color: '#FF6B35'
      }
    ],
    performance: {
      scene: {
        highDynamicRange: false,
        logarithmicDepthBuffer: false,
        fog: false,
        skyAtmosphere: false,
        sun: false,
        moon: false
      },
      terrain: {
        maximumScreenSpaceError: 4.0,
        tileCacheSize: 1000
      }
    },
    presetPositions: {
      harbin: {
        name: '哈尔滨市中心',
        longitude: 126.643927,
        latitude: 45.757446,
        height: 10000
      },
      buildings: {
        name: '建筑群',
        longitude: 126.53,
        latitude: 45.8,
        height: 1500
      },
      districts: {
        name: '区域概览',
        longitude: 126.643927,
        latitude: 45.757446,
        height: 15000
      },
      airport: {
        name: '哈尔滨太平国际机场',
        longitude: 126.25,
        latitude: 45.62,
        height: 8000
      },
      railway: {
        name: '哈尔滨火车站',
        longitude: 126.63,
        latitude: 45.76,
        height: 2000
      }
    },
    dataSources: {
      harbinDistricts: {
        url: 'data/harbin-districts.geojson',
        style: {
          polygonAlpha: 0.3,
          outlineColor: '#FFFFFF',
          outlineWidth: 2,
          labelFont: '14px sans-serif',
          labelColor: '#FFFFFF',
          labelOutlineColor: '#000000',
          labelOutlineWidth: 2
        }
      },
      buildings: {
        tilesetUrl: 'data/harbin-buildings-tileset.json',
        style: {
          color: '#4A90E2',
          alpha: 0.7
        }
      }
    },
    ui: {
      controlPanel: {
        position: 'top-left',
        theme: 'dark'
      }
    },
    camera: {
      defaultOrientation: {
        heading: 0,
        pitch: -75,
        roll: 0
      },
      flyToDuration: 2.0,
      minDistance: 100,
      maxDistance: 50000
    },
    events: {
      enableDoubleClick: false,
      enableRightClick: true,
      enableMouseWheel: true
    }
  },
  tilesets: {
    services: {
      development: {
        baseUrl: 'http://localhost:8888',
        buildings: '/tileset.json'
      },
      production: {
        baseUrl: 'http://localhost:8899',
        buildings: '/tileset.json'
      }
    }
  },
  offline: {
    localDataSources: {
      imagery: {
        primary: 'a605d-main/a605d-main/233/233_Level_6.png',
        fallback: 'a605d-main/a605d-main/233/233_Level_6.png',
        bounds: {
          west: -180.0,
          south: -89.6484375,
          east: 179.6484375,
          north: 90.0
        }
      },
      models: {
        buildings: 'example-3dtiles/tileset.json',
        terrain: null
      },
      geospatial: {
        districts: 'ceshi.geojson',
        boundaries: 'ceshi.geojson'
      }
    },
    features: {
      networkFeatures: {
        ionServices: false,
        worldTerrain: false,
        onlineImagery: false,
        geocoding: false,
        weather: false
      },
      localFeatures: {
        localImagery: true,
        local3DModels: true,
        localGeoData: true,
        staticBackground: true
      }
    },
    performance: {
      scene: {
        highDynamicRange: false,
        logarithmicDepthBuffer: false,
        fog: false,
        skyAtmosphere: false,
        sun: false,
        moon: false
      },
      terrain: {
        enabled: false,
        maximumScreenSpaceError: 0,
        tileCacheSize: 0
      },
      memory: {
        maximumMemoryUsage: 512,
        enableFrustumCulling: true,
        enableOcclusionCulling: true
      }
    },
    errorHandling: {
      networkErrorFallback: true,
      localResourceFallback: {
        imagery: 'createStaticBackground',
        models: 'hideModels',
        data: 'showErrorMessage'
      }
    },
    viewerOptions: {
      homeButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayerPicker: false,
      shadows: false,
      shouldAnimate: false,
      animation: false,
      timeline: false,
      geocoder: false,
      navigationHelpButton: false,
      terrain: undefined,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
      imageryProvider: false
    }
  }
};

export function cloneConfigSection(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return deepClone(value);
}

function deepClone(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }

  const cloned = {};
  for (const [key, val] of Object.entries(value)) {
    cloned[key] = deepClone(val);
  }
  return cloned;
}
