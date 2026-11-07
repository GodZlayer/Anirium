export function sourceHttpError(response, label, now = Date.now()) {
  const error = new Error(`${label} HTTP ${response.status}`);
  error.status = response.status;
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : null;
    const retryAt = seconds !== null ? now + seconds * 1000 : Date.parse(value);
    if (Number.isFinite(retryAt) && retryAt > now) error.retryAt = retryAt;
  }
  return error;
}
