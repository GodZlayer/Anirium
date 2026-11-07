export function createWorkRefreshSession({ resolve, onValue, onError, needsRetry = () => false }) {
  let sequence = 0, stopped = false, busy = false, retryPending = false;
  const load = async () => {
    if (stopped) return;
    const request = ++sequence; busy = true;
    try {
      const value = await resolve();
      if (stopped || request !== sequence) return;
      retryPending = needsRetry(value); onValue(value);
    } catch (error) {
      if (stopped || request !== sequence) return;
      retryPending = true; onError(error);
    } finally { if (request === sequence) busy = false; }
  };
  return { load, retry: () => retryPending && !busy ? load() : Promise.resolve(),
    dispose: () => { stopped = true; sequence++; }, pending: () => !stopped && retryPending };
}

export async function resolveContextWork({ reference, resolve, readLegacy, findLegacy, kind = "work", resolveEntity }) {
  if (resolveEntity && ["universe", "episode", "season", "arc"].includes(kind)) {
    const context = await resolveEntity(kind, reference);
    if (context !== undefined) {
      return { work: context ? await resolve(context.work_id) : null, context, provisional: false };
    }
  }
  try { return { work: await resolve(reference), provisional: false }; }
  catch (error) {
    if (error.code !== "CATALOG_MANIFEST_UNAVAILABLE" || error.status !== 404) throw error;
    const legacy = await readLegacy();
    return { work: findLegacy(legacy, reference) || null, legacy, provisional: true };
  }
}
