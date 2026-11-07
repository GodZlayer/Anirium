import test from "node:test";
import assert from "node:assert/strict";
import { transform, projectTheme } from "./transform.mjs";
import { declaration, syntax } from "./ast.mjs";
import { paletteClass } from "./palette.mjs";

const entry = { id: "I18N_DICTIONARY:actions.save", values: { "pt-BR": "Salvar", "en-US": "Save" } };
const registry = { texts: new Map([["Salvar", [entry]], ["Save", [entry]]]), themes: { black: { colors: { textPrimary: "#FFF9F0", accentGold: "#FFC766", borderHighlight: "#FFC766" } } } };

test("AST transformations preserve unrelated strings and IDs, translate mounted labels and are idempotent", () => {
  const source = 'import React from "react"; const wire="Salvar"; export function Card(){ return <button className={`text-white ${true ? "bg-zinc-900/80" : "hover:bg-black"}`} title="Salvar">Salvar</button>; }';
  const result = transform(source, "resources/js/Components/Card.tsx", registry);
  syntax(result.source);
  assert.match(result.source, /const wire="Salvar"/);
  assert.match(result.source, /__presentation\.text\("I18N_DICTIONARY:actions.save"\)/);
  assert.match(result.source, /text-\[color:var\(--wc-textPrimary\)\]/);
  assert.match(result.source, /bg-\[color:var\(--wc-bgRaised\)\]\/80/);
  assert.equal(result.pending.length, 0);
  assert.equal(transform(result.source, "resources/js/Components/Card.tsx", registry).edits.length, 0);
});

test("unknown translations, noncomponent functions and ambiguous meanings become explicit pending items", () => {
  const source = 'function utility(){return <span>Salvar</span>}; export function Card(){return <div title="Unknown">Salvar</div>}';
  const ambiguous = { ...registry, texts: new Map([["Salvar", [entry, { ...entry, id: "different:meaning" }]]]) };
  const result = transform(source, "resources/js/Components/Card.tsx", ambiguous);
  assert.equal(result.edits.length, 0);
  assert.equal(result.pending.filter(item => item.rule === "ambiguous-string").length, 2);
  assert.equal(result.pending.filter(item => item.rule === "missing-translation").length, 1);
});

test("dictionary extraction never executes module statements or expressions", () => {
  assert.deepEqual(declaration('export const X: Record<string,string> = {a:"ok"}; throw Error("must not execute")', "X"), { a: "ok" });
  assert.throws(() => declaration('export const X={a:danger()}', "X"), /executable/);
});

test("palette mapping keeps variants and opacity without changing geometric classes", () => {
  assert.equal(paletteClass("p-4 hover:bg-black/40 text-emerald-400 rounded-xl").text,
    "p-4 hover:bg-[color:var(--wc-bgBase)]/40 text-[color:var(--wc-stateSuccess)] rounded-xl");
});

test("theme migration selects the theme effect, not the language effect with the same root declaration", () => {
  const source = 'function ThemeProvider(){useEffect(()=>{const root=document.documentElement;root.lang=language},[language]);useEffect(()=>{const root=document.documentElement;root.style.setProperty("x",selectedTheme.colors.bgBase)},[selectedTheme])}';
  const result = projectTheme(source);
  assert.match(result, /\[language\]\);useEffect\(\(\)=>\{const root=document.documentElement;\n    for/);
  assert.equal(projectTheme(result), result);
});
