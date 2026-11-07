export function createCanonicalPreferenceWriter({ write, apply, failed, isCurrent }) {
  let pending = Promise.resolve();
  return (payload, account) => {
    pending = pending.then(async () => {
      if (!isCurrent(account)) return;
      try {
        const response = await write(payload);
        if (isCurrent(account)) apply(response);
      } catch (error) {
        if (isCurrent(account)) await failed(error);
      }
    }).catch(() => {});
    return pending;
  };
}
