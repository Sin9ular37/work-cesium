const LEVEL_WEIGHT = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const DEFAULT_SCOPE = 'Cesium';

const getEnv = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      return import.meta.env;
    }
  } catch (_) {}
  return {};
};

const resolveLevel = (level) => {
  if (typeof level === 'number') {
    return level;
  }
  if (typeof level === 'string') {
    const normalized = level.toLowerCase();
    if (normalized in LEVEL_WEIGHT) {
      return LEVEL_WEIGHT[normalized];
    }
  }
  return LEVEL_WEIGHT.info;
};

const shouldDebug = (options) => {
  if (typeof options?.debugEnabled === 'boolean') {
    return options.debugEnabled;
  }
  const env = getEnv();
  if (typeof env?.VITE_CESIUM_DEBUG_LOGS === 'string') {
    return env.VITE_CESIUM_DEBUG_LOGS === 'true';
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.__CESIUM_DEBUG_LOG__ === 'boolean') {
    return globalThis.__CESIUM_DEBUG_LOG__;
  }
  if (typeof env?.DEV === 'boolean') {
    return env.DEV;
  }
  return false;
};

const createPrinter = (method) => {
  if (typeof console === 'undefined') {
    return () => {};
  }
  const fn = console[method] || console.log;
  return (...args) => {
    try {
      fn.call(console, ...args);
    } catch (_) {}
  };
};

export function createLogger(scope = DEFAULT_SCOPE, options = {}) {
  const debugEnabled = shouldDebug(options);
  const threshold = resolveLevel(options.level ?? (debugEnabled ? 'debug' : 'info'));

  const prefixArgs = (level, args) => {
    if (!scope) return args;
    return [`[${scope}]`, ...args];
  };

  const emit = (level, ...args) => {
    const weight = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.debug;
    if (weight > threshold) return;
    const printer = createPrinter(level === 'debug' ? (debugEnabled ? 'debug' : 'log') : level);
    printer(...prefixArgs(level, args));
  };

  const logger = (...args) => {
    if (!debugEnabled) return;
    emit('debug', ...args);
  };

  logger.debug = (...args) => {
    if (!debugEnabled) return;
    emit('debug', ...args);
  };

  logger.info = (...args) => emit('info', ...args);
  logger.warn = (...args) => emit('warn', ...args);
  logger.error = (...args) => emit('error', ...args);
  logger.enabled = debugEnabled;
  logger.scope = scope;

  return logger;
}

const silent = () => {};
silent.debug = () => {};
silent.info = () => {};
silent.warn = () => {};
silent.error = () => {};
silent.enabled = false;
silent.scope = 'noop';

export const noopLogger = Object.freeze(silent);
