const PERF_NAMESPACE = '[APP_PERF]';

const getGlobalObject = () => {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  // Fallback for older runtimes.
  // eslint-disable-next-line no-undef
  if (typeof global !== 'undefined') {
    // eslint-disable-next-line no-undef
    return global;
  }
  return {};
};

const isPerfLoggingEnabled = () => {
  const runtimeGlobal = getGlobalObject();
  return __DEV__ || runtimeGlobal.__ENABLE_PERF_LOGS === true;
};

export const perfNow = () => Date.now();

export const perfLog = (scope, event, payload = {}) => {
  if (!isPerfLoggingEnabled()) {
    return;
  }
  const safeScope = String(scope || 'unknown').trim() || 'unknown';
  const safeEvent = String(event || 'event').trim() || 'event';
  const details =
    payload && typeof payload === 'object' ? payload : {value: payload};
  let serializedDetails = '{}';
  try {
    serializedDetails = JSON.stringify(details);
  } catch {
    serializedDetails = '{"note":"unserializable_payload"}';
  }
  console.log(`${PERF_NAMESPACE}[${safeScope}] ${safeEvent} ${serializedDetails}`);
};

export const createPerfTimer = (scope, event, basePayload = {}) => {
  const startedAt = perfNow();
  perfLog(scope, `${event}:start`, basePayload);

  return {
    end(extraPayload = {}) {
      const endedAt = perfNow();
      const durationMs = Math.max(0, endedAt - startedAt);
      perfLog(scope, `${event}:end`, {
        ...basePayload,
        ...extraPayload,
        durationMs,
      });
      return durationMs;
    },
    fail(error, extraPayload = {}) {
      const endedAt = perfNow();
      const durationMs = Math.max(0, endedAt - startedAt);
      perfLog(scope, `${event}:error`, {
        ...basePayload,
        ...extraPayload,
        durationMs,
        error: String(error?.message || error || 'unknown'),
      });
      return durationMs;
    },
  };
};
