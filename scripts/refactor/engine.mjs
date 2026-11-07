import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { atomic, digest, files, json, syntax } from "./ast.mjs";
import { dictionaries, definitions, presentationBridge } from "./dictionaries.mjs";
import { transform, projectTheme } from "./transform.mjs";

const root = process.cwd(), run = path.resolve(process.argv.find(value => value.startsWith("--run="))?.slice(6) || "");
if (!run.startsWith(path.join(root, "storage/app/refactor/runs") + path.sep)) throw Error("Invalid run directory");
const apply = process.argv.includes("--apply"), rollingBack = process.argv.includes("--rollback");
const progressFile = path.join(run, "progress.json"), ledgerFile = path.join(run, "ledger.json");
const read = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const ledger = read(ledgerFile, { schema: 1, files: {} });
let changes = 0, pending = [], processed = 0;
function progress(phase, extra = {}) {
  json(progressFile, { phase, processed, changes, pending: pending.length, observed_at: new Date().toISOString(), ...extra });
}
async function checkpoint(file) {
  while (read(path.join(run, "control.json"), {}).action === "pause") {
    progress("paused", { file });
    await delay(1000);
  }
}
function write(file, source, next) {
  if (!apply || source === next) return;
  const absolute = path.join(root, file), before = source === null ? null : digest(source), after = digest(next);
  const previous = ledger.files[file];
  if (previous && before !== previous.after && before !== previous.before) throw Error(`External change prevents resume: ${file}`);
  if ((fs.existsSync(absolute) ? digest(fs.readFileSync(absolute)) : null) !== before) throw Error(`Source changed before commit: ${file}`);
  if (!previous) {
    const backup = path.join(run, "backups", file);
    if (source !== null) atomic(backup, source);
    ledger.files[file] = { before, after, state: "prepared" };
  } else Object.assign(previous, { after, state: "prepared" });
  json(ledgerFile, ledger); // Write-ahead checkpoint survives a kill between replacement and confirmation.
  atomic(absolute, next);
  ledger.files[file].state = "applied";
  json(ledgerFile, ledger);
}
if (rollingBack) {
  for (const [file, record] of Object.entries(ledger.files).reverse()) {
    const absolute = path.join(root, file), current = fs.existsSync(absolute) ? digest(fs.readFileSync(absolute)) : null;
    if (current === record.before) continue;
    if (current !== record.after) throw Error(`External change prevents rollback: ${file}`);
    if (record.before === null) fs.unlinkSync(absolute);
    else atomic(absolute, fs.readFileSync(path.join(run, "backups", file)));
    record.state = "restored";
    json(ledgerFile, ledger);
  }
  progress("restored", { result: "Source changes restored from this run's verified backups" });
  process.exit(0);
}

const registry = dictionaries(root);
// Recover cumulative counts from originals, rather than showing zero after a resume.
for (const [file, record] of Object.entries(ledger.files)) {
  if (record.edit_count === undefined) {
    const backup = path.join(run, "backups", file);
    record.edit_count = file.endsWith(".tsx") && fs.existsSync(backup) ? transform(fs.readFileSync(backup, "utf8"), file, registry).edits.length || 1 : 1;
  }
  changes += record.edit_count;
}
const inventory = ["resources/js", "resources/css", "resources/views", "app", "routes", "database/migrations"]
  .flatMap(directory => files(path.join(root, directory))).filter(file => /\.(tsx?|mjs|css|php)$/.test(file));
const frontend = inventory.filter(file => file.endsWith(".tsx"));
json(path.join(run, "inventory.json"), inventory.map(file => ({ file: path.relative(root, file).replaceAll("\\", "/"), bytes: fs.statSync(file).size, sha256: digest(fs.readFileSync(file)) })));
json(path.join(run, "presentation-input.json"), { schema: 1, locales: registry.all, themes: registry.themes });
progress("inventory", { total: frontend.length });
const plans = [];
for (const absolute of frontend) {
  const file = path.relative(root, absolute).replaceAll("\\", "/");
  await checkpoint(file);
  const source = fs.readFileSync(absolute, "utf8"), result = transform(source, file, registry);
  const previous = ledger.files[file];
  if (previous && ![previous.before, previous.after].includes(digest(source))) throw Error(`Source changed since checkpoint: ${file}`);
  pending.push(...result.pending.map(item => ({ file, ...item })));
  const plan = { file, before: digest(source), after: digest(result.source), edits: result.edits.length };
  plans.push(plan);
  json(path.join(run, "transformations.json"), plans);
  if (result.edits.length) {
    write(file, source, result.source);
    changes += result.edits.length;
    console.log(JSON.stringify({ file, edits: result.edits.length, applied: apply }));
  }
  processed++;
  progress("transforming", { total: frontend.length, file, checkpoint: plan.after });
}
if (changes) {
  const file = "resources/js/lib/usePresentation.ts", absolute = path.join(root, file);
  const source = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
  write(file, source, presentationBridge());
}
// Existing theme effect owns all variables. Add only the missing generic projection.
const themeFile = "resources/js/context/ThemeContext.tsx", themeSource = fs.readFileSync(path.join(root, themeFile), "utf8");
if (!themeSource.includes("--wc-${key}")) {
  write(themeFile, themeSource, projectTheme(themeSource));
}
// Backend contracts are inventoried, never guessed or rewritten from a regexp.
for (const absolute of inventory.filter(file => !file.endsWith(".tsx"))) {
  const source = fs.readFileSync(absolute, "utf8"), file = path.relative(root, absolute).replaceAll("\\", "/");
  source.split(/\r?\n/).forEach((line, index) => {
    if (/PORTUGUESE_TITLE_MAP|LOCALIZED_SYNOPSIS_MAP|(?:work_id|universe_id)\s*\|\||\.mal_id\s*\|\|/.test(line)) pending.push({ file, line: index + 1, rule: "data-contract", detail: "Requires explicit migration rule; no identity reassignment allowed" });
  });
}
json(path.join(run, "pending.json"), pending);
progress("validating", { total: frontend.length });
for (const [file, record] of Object.entries(ledger.files)) {
  if (digest(fs.readFileSync(path.join(root, file))) !== record.after) throw Error(`Changed source during validation: ${file}`);
  syntax(fs.readFileSync(path.join(root, file), "utf8"));
  record.state = "verified";
}
json(ledgerFile, ledger);
progress("packaging", { total: frontend.length });
const child = spawn(process.env.ANIRIUM_PYTHON || "python", [path.join(root, "scripts/refactor/pack.py"), "--run", run], { stdio: "inherit", windowsHide: true });
const [code] = await once(child, "exit");
if (code !== 0) throw Error("Package validation failed; publication is unchanged");
pending.push({ file: "system", rule: "integration-gate", detail: "Full browser, build, database and remaining context verification required before activation" });
json(path.join(run, "pending.json"), pending);
progress("needs_review", { total: frontend.length, result: `${apply ? "Applied" : "Proposed"} ${changes} AST edits; ${pending.length} explicit pending items. Production manifest unchanged.` });
