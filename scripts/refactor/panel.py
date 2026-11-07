"""The user's chronological terminal layout, with job-scoped telemetry."""
import os
import sys
import time
from pathlib import Path
from state import read_json, tail
from windows_job import WindowsJob


def monitor(directory):
    import psutil
    directory = Path(directory)
    initial = read_json(directory / "status.json")
    if not initial:
        raise RuntimeError("No recorded run to monitor")
    live = psutil.pid_exists(initial["pid"]) and abs(psutil.Process(initial["pid"]).create_time() - initial["process_start"]) < 0.01
    job = WindowsJob(initial["job_name"], existing=True) if live else WindowsJob("Local\\AniriumMonitor-" + str(os.getpid()))
    print("=" * 79)
    print(" ANIRIUM — PAINEL DE REFATORAÇÃO AO VIVO")
    print("=" * 79, flush=True)
    try:
        while True:
            status = read_json(directory / "status.json", {})
            progress = read_json(directory / "progress.json", {})
            metrics = status.get("metrics", {})
            alive = psutil.pid_exists(status.get("pid", -1))
            if alive:
                alive = abs(psutil.Process(status["pid"]).create_time() - status["process_start"]) < 0.01
            state = status.get("state", "unknown")
            if not alive and state == "running":
                state = "interrupted"
            total = progress.get("total")
            processed = str(progress.get("processed", 0)) + (f" / {total}" if total is not None else " / total ainda desconhecido")
            rows = {
                "EXECUÇÃO": status.get("run_id"), "ESTADO": state,
                "ETAPA ATUAL": progress.get("phase", status.get("phase", "initializing")),
                "ARQUIVO / LOTE": progress.get("file", "—"), "PROCESSADO": processed,
                "ÚLTIMO CHECKPOINT": progress.get("checkpoint", "—"),
                "CPU TOTAL ESTEIRA": f"{metrics.get('cpu_percent', 0):.1f}% / limite 10%",
                "MEMÓRIA COMPROMETIDA": f"{metrics.get('committed_bytes', 0) / 1e6:.1f} MB / limite 1000 MB",
                "PICO DE MEMÓRIA": f"{metrics.get('peak_committed_bytes', 0) / 1e6:.1f} MB",
                "PROCESSADORES": "CPU 4 a CPU 11", "HEARTBEAT": status.get("heartbeat", "—"),
                "ALTERAÇÕES / PENDÊNCIAS": f"{progress.get('changes', 0)} / {progress.get('pending', '—')}",
                "RESULTADO": status.get("result", "Em processamento; publicação anterior preservada"),
            }
            print(f"\n[{time.strftime('%H:%M:%S')}] >>> STATUS DA REFATORAÇÃO <<<")
            for label, value in rows.items():
                print(f"  [{label:24}] : {value}")
            for line in tail(directory / "events.log"):
                print("  " + line)
            print("-" * 79, flush=True)
            if state not in {"running", "paused"}:
                print("Consulta encerrada. Os relatórios continuam disponíveis.", flush=True)
                if sys.stdin.isatty():
                    input("Pressione Enter para fechar este painel.")
                return
            time.sleep(10)
    except KeyboardInterrupt:
        print("Painel fechado. A esteira continua independente.", flush=True)

