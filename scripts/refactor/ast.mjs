import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "@babel/parser";

export const digest = text => createHash("sha256").update(text).digest("hex");
export const syntax = source => parse(source, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: false });
export function walk(node, callback, ancestors = []) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  callback(node, ancestors);
  const next = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "extra", "comments", "tokens"].includes(key)) continue;
    if (Array.isArray(value)) for (const child of value) walk(child, callback, next);
    else if (value && typeof value.type === "string") walk(value, callback, next);
  }
}
export function literal(node) {
  if (["TSAsExpression", "TSSatisfiesExpression"].includes(node?.type)) return literal(node.expression);
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node?.type)) return node.value;
  if (node?.type === "NullLiteral") return null;
  if (node?.type === "ArrayExpression") return node.elements.map(literal);
  if (node?.type === "ObjectExpression") return Object.fromEntries(node.properties.map(property => {
    if (property.type !== "ObjectProperty" || property.computed) throw Error("Nonliteral dictionary property");
    return [property.key.name || property.key.value, literal(property.value)];
  }));
  throw Error("Dictionary contains executable or unsupported syntax");
}
export function declaration(source, name) {
  let found;
  walk(syntax(source), node => { if (node.type === "VariableDeclarator" && node.id.name === name) found = literal(node.init); });
  if (found === undefined) throw Error(`Missing dictionary ${name}`);
  return found;
}
export function atomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + `.${process.pid}.tmp`;
  fs.writeFileSync(temp, content);
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, file); break; }
    catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 20) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
export const json = (file, value) => atomic(file, JSON.stringify(value, null, 2));
export function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() && !entry.isSymbolicLink() ? files(path.join(directory, entry.name)) : entry.isFile() ? [path.join(directory, entry.name)] : []);
}
