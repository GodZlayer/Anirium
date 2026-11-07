export function createCatalogSnapshotCache(read, { onChange = () => {}, onError = () => {} } = {}) {
  let snapshot = null, pending = null;
  return {
    revision: () => snapshot?.revision ?? null,
    load(force = false) {
      if (snapshot && !force) return Promise.resolve(snapshot);
      if (pending) return pending;
      pending = Promise.resolve().then(read).then(next => {
        if (!Array.isArray(next?.items) || !next.items.length || !/^[a-f0-9]{64}$/.test(next.revision)) throw new Error("Invalid catalog snapshot");
        const changed = snapshot?.revision !== next.revision;
        snapshot = next;
        if (changed) onChange(next.items);
        return snapshot;
      }).catch(error => { onError(error); return snapshot || { items: [], revision: null }; }).finally(() => { pending = null; });
      return pending;
    },
  };
}
