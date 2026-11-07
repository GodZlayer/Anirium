function parts(body) {
  const result = []; let start = 0, braces = 0, links = 0;
  for (let index = 0; index < body.length; index++) {
    const pair = body.slice(index, index + 2);
    if (pair === "{{") { braces++; index++; }
    else if (pair === "}}") { braces--; index++; }
    else if (pair === "[[") { links++; index++; }
    else if (pair === "]]") { links--; index++; }
    else if (body[index] === "|" && !braces && !links) { result.push(body.slice(start, index)); start = index + 1; }
  }
  result.push(body.slice(start));
  return result;
}

export function wikitextTemplates(value) {
  if (typeof value !== "string" || value.length > 2_000_000) throw new Error("Unsupported wikitext size");
  const text = value.replace(/<!--[\s\S]*?-->|<nowiki\b[^>]*>[\s\S]*?<\/nowiki\s*>/gi, match => " ".repeat(match.length));
  const stack = [], nodes = []; let visited = 0;
  for (let index = 0; index < text.length - 1; index++) {
    const pair = text.slice(index, index + 2);
    if (pair === "{{") {
      if (stack.length >= 64 || ++visited > 50000) throw new Error("Wikitext template complexity exceeds supported bounds");
      stack.push({ start: index, parent: stack.at(-1)?.start ?? null }); index++;
    }
    else if (pair === "}}") {
      const node = stack.pop();
      if (!node) throw new Error("Unbalanced wikitext templates");
      const header = text.slice(node.start + 2, Math.min(index, node.start + 82));
      const delimiter = header.search(/[|\n]/), name = (delimiter < 0 ? header : header.slice(0, delimiter)).trim().replaceAll("_", " ").toLowerCase();
      if (["episode table", "episode table/part", "episode list/sublist", "episode list"].includes(name)) {
        const fields = parts(text.slice(node.start + 2, index)); fields.shift();
        const parameters = {};
        for (const field of fields) {
          const equal = field.indexOf("=");
          if (equal < 0) continue;
          const key = field.slice(0, equal).trim().toLowerCase();
          if (Object.hasOwn(parameters, key)) throw new Error("Ambiguous wikitext template parameter");
          parameters[key] = field.slice(equal + 1).trim();
        }
        nodes.push({ ...node, end: index + 2, name, parameters });
      }
      index++;
    }
  }
  if (stack.length) throw new Error("Unbalanced wikitext templates");
  return nodes.sort((a, b) => a.start - b.start);
}
