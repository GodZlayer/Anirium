export function externalKey(reference) {
  const { provider, media } = reference || {};
  const id = String(reference?.id ?? "");
  if (!/^[a-z][a-z0-9-]*$/.test(provider || "") || !["anime", "manga", "novel"].includes(media)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.length > (provider === "anime-planet" ? 512 : 128)) throw new Error("Invalid external catalog identity");
  return `${provider}:${media}:${id}`;
}

export function validateReferences(references) {
  if (!Array.isArray(references) || !references.length) throw new Error("Missing external catalog references");
  const namespaces = new Map(), unique = new Map();
  for (const reference of references) {
    const key = externalKey(reference), namespace = `${reference.provider}:${reference.media}`;
    if (namespaces.has(namespace) && namespaces.get(namespace) !== key) throw new Error("Ambiguous source granularity");
    namespaces.set(namespace, key);
    unique.set(key, { provider: reference.provider, media: reference.media, id: String(reference.id) });
  }
  return [...unique.values()];
}
