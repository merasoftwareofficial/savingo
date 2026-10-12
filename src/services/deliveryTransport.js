// A request failure never owns/deletes pending work. Callers persist first and
// acknowledge their outbox only after validating the server response.
export const deliveryRetryDelay = attempt =>
  Math.min(300000, 10000 * 2 ** Math.min(5, Math.max(0, Number(attempt) || 0)));

export const deliveryFetch = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {...options, signal: controller.signal});
    // Consume the body inside the deadline too, rather than timing headers only.
    const raw = await response.text();
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {message: raw};
    }
    return {response, body};
  } finally {
    clearTimeout(timeout);
  }
};
