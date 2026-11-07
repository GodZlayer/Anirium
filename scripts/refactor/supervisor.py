"""Budgeted native runner; no work is delegated to Docker or an LLM."""
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from state import now, read_json, write_json
from windows_job import WindowsJob


def execute(root, apply=False, show_panel=False, resume=None, rollback=False):
    import msvcrt
    import psutil
    run_id = str(uuid.UUID(resume)) if resume else str(uuid.uuid4())
    job_name = "Local\\AniriumRefactor-" + run_id
    job = WindowsJob(job_name)  # Must succeed BEFORE inputs, workers or mutation.
    base = root / "storage/app/refactor"
    base.mkdir(parents=True, exist_ok=True)
    lock = open(base / "pipeline.lock", "a+b")
    lock.seek(0)
    if lock.read(1) == b"":
        lock.write(b"0")
        lock.flush()
    lock.seek(0)
    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    directory = base / "runs" / run_id
    directory.mkdir(parents=True, exist_ok=True)
    status = {"schema": 1, "run_id": run_id, "pid": os.getpid(),
              "process_start": psutil.Process().create_time(), "job_name": job_name,
              "started_at": now(), "state": "running", "phase": "initializing", "apply": apply}
    write_json(base / "latest.json", {"run_id": run_id})
    write_json(directory / "status.json", status)
    write_json(directory / "control.json", {"action": "resume"})
    environment = {**os.environ, "NODE_OPTIONS": "--max-old-space-size=256",
                   "OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2",
                   "ANIRIUM_PYTHON": sys.executable, "PYTHONUTF8": "1"}
    command = ["node", str(root / "scripts/refactor/engine.mjs"), "--run=" + str(directory)]
    if apply:
        command.append("--apply")
    if rollback:
        command.append("--rollback")
    with open(directory / "events.log", "a", encoding="utf-8") as events:
        worker = subprocess.Popen(command, cwd=root, env=environment, stdout=events, stderr=subprocess.STDOUT)
        if show_panel:
            subprocess.Popen([sys.executable, str(root / "scripts/refactor.py"), "monitor", "--run", run_id], cwd=root,
                             creationflags=subprocess.CREATE_NEW_CONSOLE)
        previous_time, previous_cpu = time.monotonic(), job.sample()["cpu_seconds"]
        try:
            while True:
                sample = job.sample()
                committed, resident = 0, 0
                for pid in sample["pids"]:
                    try:
                        info = psutil.Process(pid).memory_info()
                        committed += info.private
                        resident += info.rss
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                instant = time.monotonic()
                sample.update(committed_bytes=committed, resident_bytes=resident,
                              cpu_percent=max(0, (sample["cpu_seconds"] - previous_cpu) / max(0.001, instant - previous_time) / psutil.cpu_count() * 100))
                previous_cpu, previous_time = sample["cpu_seconds"], instant
                status.update(heartbeat=now(), metrics=sample)
                progress = read_json(directory / "progress.json", {})
                status["phase"] = progress.get("phase", "initializing")
                control = read_json(directory / "control.json", {})
                status["state"] = "paused" if control.get("action") == "pause" else "running"
                code = worker.poll()
                if code is not None:
                    status.update(exit_code=code, finished_at=now())
                    status["state"] = "failed" if code else "needs_review" if progress.get("pending", 0) else "completed"
                    status["result"] = progress.get("result", "Worker failed; inspect events.log")
                write_json(directory / "status.json", status)
                if code is not None:
                    return code
                time.sleep(2)
        except BaseException as error:
            worker.terminate()
            worker.wait(timeout=15)
            status.update(state="interrupted", finished_at=now(), error=type(error).__name__)
            write_json(directory / "status.json", status)
            raise
        finally:
            lock.close()

