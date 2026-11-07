import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await pause(100); }
  assert.fail("Supervisor did not reach expected process state");
}
test("supervisor restarts a failed cron and propagates PHP failure while cleaning children", { skip: process.platform === "win32", timeout: 20000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-supervisor-"));
  const script = (name, body) => fs.writeFileSync(path.join(root, name), "#!/bin/sh\n" + body, { mode: 0o755 });
  script("crond", 'if [ ! -e "$PROBE_ROOT/first" ]; then touch "$PROBE_ROOT/first"; exit 7; fi\necho $$ > "$PROBE_ROOT/cron.pid"\nexec sleep 60\n');
  script("php-fpm", 'echo $$ > "$PROBE_ROOT/php.pid"\nexec sleep 60\n');
  const child = spawn("sh", [path.resolve("docker/supervise-app.sh")], { env: { ...process.env, PATH: root + ":" + process.env.PATH, PROBE_ROOT: root }, stdio: "ignore" });
  const exited = once(child, "exit");
  t.after(async () => { if (child.exitCode === null) child.kill("SIGTERM"); await exited; fs.rmSync(root, { recursive: true }); });
  await until(() => fs.existsSync(path.join(root, "cron.pid")) && fs.existsSync(path.join(root, "php.pid")));
  const cron = Number(fs.readFileSync(path.join(root, "cron.pid"))), php = Number(fs.readFileSync(path.join(root, "php.pid")));
  process.kill(cron, 0);
  process.kill(php, "SIGTERM");
  const [code] = await exited;
  assert.notEqual(code, 0);
  assert.throws(() => process.kill(cron, 0), { code: "ESRCH" });
});
