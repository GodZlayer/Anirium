"""Anirium refactoring CLI. Routine execution never invokes an AI model."""
import argparse
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/refactor"))
from state import read_json, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["run", "audit", "monitor", "status", "pause", "resume", "rollback"])
    parser.add_argument("--run", help="Existing run UUID; defaults to the latest run")
    parser.add_argument("--apply", action="store_true", help="Apply only proven, backed-up AST transformations")
    parser.add_argument("--panel", action="store_true", help="Open the requested live panel in a normal window")
    args = parser.parse_args()
    if args.action in {"run", "audit"}:
        from supervisor import execute
        return execute(ROOT, args.apply if args.action == "run" else False, args.panel, args.run)
    base = ROOT / "storage/app/refactor"
    run_id = str(uuid.UUID(args.run or read_json(base / "latest.json", {})["run_id"]))
    directory = base / "runs" / run_id
    status = read_json(directory / "status.json", {})
    import psutil
    try:
        alive = abs(psutil.Process(status["pid"]).create_time() - status["process_start"]) < 0.01
    except (psutil.NoSuchProcess, KeyError):
        alive = False
    if args.action == "rollback":
        if alive:
            raise RuntimeError("Wait for the active run to stop before rollback")
        from supervisor import execute
        return execute(ROOT, True, args.panel, run_id, rollback=True)
    if args.action == "resume" and not alive:
        from supervisor import execute
        return execute(ROOT, status.get("apply", False), args.panel, run_id)
    if args.action == "monitor":
        from panel import monitor
        monitor(directory)
    elif args.action == "status":
        if not alive and status.get("state") in {"running", "paused"}:
            status["state"] = "interrupted"
        print(json.dumps({"status": status, "observation": "running" if alive else "stopped", "progress": read_json(directory / "progress.json")}, ensure_ascii=False, indent=2))
    else:
        if not alive:
            raise RuntimeError("No active run to pause")
        write_json(directory / "control.json", {"action": args.action})
        print(f"{args.action}: request recorded for {run_id}; applied at the next checkpoint")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"REFATORAÇÃO INTERROMPIDA: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
