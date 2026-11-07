function rangesFor(html, group) {
  const block = new RegExp(`<div class="${group}">([\\s\\S]*?)<\\/div>`, "i").exec(html)?.[1];
  const content = block && /<span class="Episodes">([\s\S]*?)<\/span>/i.exec(block)?.[1];
  return content ? content.replace(/<[^>]*>/g, "").split(",").map(value => value.trim()).filter(value => /^\d+(?:-\d+)?$/.test(value)) : [];
}

export function parseFillerGuide(html) {
  return {
    filler: rangesFor(html, "filler"),
    mixed: rangesFor(html, "mixed_canon/filler"),
    manga_canon: rangesFor(html, "manga_canon"),
    anime_canon: rangesFor(html, "anime_canon"),
  };
}
