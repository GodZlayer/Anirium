export function malRelationTargets(payload) {
  const targets = new Map();
  for (const [media, key] of [["anime", "related_anime"], ["manga", "related_manga"]]) {
    for (const relation of Array.isArray(payload?.[key]) ? payload[key] : []) {
      const id = relation?.node?.id;
      if (Number.isSafeInteger(id) && id > 0) targets.set(`${media}:${id}`, { media, id });
    }
  }
  return [...targets.values()];
}
