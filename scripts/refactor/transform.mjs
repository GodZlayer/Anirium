import path from "node:path";
import { syntax, walk } from "./ast.mjs";
import { colorKey, paletteClass } from "./palette.mjs";

function component(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i], parent = ancestors[i - 1];
    const name = node.type === "FunctionDeclaration" ? node.id?.name : ["ArrowFunctionExpression", "FunctionExpression"].includes(node.type) && parent?.type === "VariableDeclarator" ? parent.id?.name : null;
    if (name && /^[A-Z]/.test(name) && node.body?.type === "BlockStatement" && !node.async && !node.generator) return node;
  }
  return null;
}
export function transform(source, file, registry) {
  const ast = syntax(source), edits = [], pending = [], contexts = new Map();
  const candidate = (node, rule, detail) => pending.push({ rule, line: node.loc?.start.line, detail: String(detail).slice(0, 180) });
  const context = ancestors => {
    const owner = component(ancestors);
    if (!owner) return null;
    if (!contexts.has(owner)) {
      let name = "__presentation";
      for (let index = 1; source.includes(name); index++) name = `__presentation${index}`;
      contexts.set(owner, name);
    }
    return contexts.get(owner);
  };
  const edit = (node, text, rule) => edits.push({ start: node.start, end: node.end, text, rule });
  walk(ast, (node, ancestors) => {
    const parent = ancestors.at(-1);
    if (node.type === "JSXText" || node.type === "StringLiteral" && parent?.type === "JSXAttribute" && ["title", "placeholder", "aria-label", "alt"].includes(parent.name?.name)) {
      const value = node.value.trim();
      if (!value || !/[\p{L}]/u.test(value)) return;
      const entries = registry.texts.get(value) || [];
      const unique = entries.length === 1 ? entries[0] : null;
      const binding = unique && context(ancestors);
      if (binding) {
        const spacing = node.type === "JSXText" && !/[\r\n]/.test(node.value);
        edit(node, `${spacing && /^\s/.test(node.value) ? '{" "}' : ""}{${binding}.text(${JSON.stringify(unique.id)})}${spacing && /\s$/.test(node.value) ? '{" "}' : ""}`, "localized-string");
      } else candidate(node, unique ? "unsupported-component" : entries.length ? "ambiguous-string" : "missing-translation", value);
    }
    if (node.type === "StringLiteral" || node.type === "TemplateElement") {
      const attribute = [...ancestors].reverse().find(item => item.type === "JSXAttribute");
      if (attribute?.name?.name === "className") {
        const value = node.type === "TemplateElement" ? node.value.raw : node.value;
        const result = paletteClass(value);
        if (result.count) edit(node, node.type === "TemplateElement" ? result.text : JSON.stringify(result.text), "theme-class");
        if (/#[\da-f]{3,8}\b|\brgba?\(/i.test(result.text)) candidate(node, "unresolved-color-class", result.text);
      }
      if (node.type === "StringLiteral" && attribute?.name?.name === "style" && parent?.type === "ObjectProperty" && /^(#|rgba?\(|hsla?\()/i.test(node.value)) {
        const token = colorKey(node.value, parent.key.name || parent.key.value, registry.themes), binding = token && context(ancestors);
        if (binding) edit(node, `${binding}.color(${JSON.stringify(token)})`, "theme-color");
        else candidate(node, "unresolved-color", node.value);
      }
    }
    if (node.type === "LogicalExpression" && ["||", "??"].includes(node.operator)) {
      const raw = source.slice(node.start, node.end);
      if (/(?:work_id|universe_id|mal_id|:arc-\$|:ep-\$)/.test(raw)) candidate(node, "identity-contract", raw);
    }
  });
  if (contexts.size) {
    let hook = "__usePresentation";
    for (let index = 1; source.includes(hook); index++) hook = `__usePresentation${index}`;
    const relative = path.relative(path.dirname(file), "resources/js/lib/usePresentation").replaceAll("\\", "/");
    edits.push({ start: 0, end: 0, text: `import { usePresentation as ${hook} } from ${JSON.stringify(relative.startsWith(".") ? relative : "./" + relative)};\n`, rule: "presentation-import" });
    for (const [owner, name] of contexts) edits.push({ start: owner.body.start + 1, end: owner.body.start + 1, text: `\n  const ${name} = ${hook}();`, rule: "presentation-context" });
  }
  const sorted = edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let next = source, previous = source.length + 1;
  for (const patch of sorted) {
    if (patch.end > previous) throw Error(`Overlapping AST edits in ${file}`);
    next = next.slice(0, patch.start) + patch.text + next.slice(patch.end);
    previous = patch.start;
  }
  syntax(next);
  return { source: next, edits, pending };
}

export function projectTheme(source) {
  if (source.includes("--wc-${key}")) return source;
  const anchors = [];
  walk(syntax(source), node => {
    if (node.type !== "CallExpression" || node.callee.name !== "useEffect") return;
    const [callback, dependencies] = node.arguments;
    if (!dependencies?.elements?.some(item => item?.name === "selectedTheme")) return;
    const statement = callback?.body?.body?.find(item => item.type === "VariableDeclaration" && item.declarations.some(value => value.id.name === "root"));
    if (statement) anchors.push(statement.end);
  });
  if (anchors.length !== 1) throw Error("Theme effect changed; explicit migration rule required");
  const at = anchors[0];
  const next = source.slice(0, at) + '\n    for (const [key, value] of Object.entries(selectedTheme.colors)) root.style.setProperty(`--wc-${key}`, value);' + source.slice(at);
  syntax(next);
  return next;
}
