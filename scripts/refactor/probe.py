"""Short real resource test: two CPU workers, inherited affinity, aggregate OOM."""
import json
import os
import subprocess
import sys
import time
import uuid
import psutil
from windows_job import WindowsJob

job = WindowsJob("Local\\AniriumProbe-" + str(uuid.uuid4()))
code = "import time; data=bytearray(30_000_000); end=time.monotonic()+8; n=0\nwhile time.monotonic()<end: n+=1\nprint(n)"
before, started = job.sample()["cpu_seconds"], time.monotonic()
workers = [subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE) for _ in range(2)]
for worker in workers:
    assert psutil.Process(worker.pid).cpu_affinity() == list(range(4, 12))
for worker in workers:
    assert worker.wait(timeout=30) == 0
elapsed = time.monotonic() - started
cpu = (job.sample()["cpu_seconds"] - before) / elapsed / psutil.cpu_count() * 100
memory = subprocess.run([sys.executable, "-c", "try: data=bytearray(1_010_000_000)\nexcept MemoryError: print('enforced')\nelse: raise SystemExit('limit failed')"], capture_output=True, text=True, timeout=20)
assert memory.returncode == 0 and memory.stdout.strip() == "enforced", memory.stderr
assert cpu <= 11, cpu  # Allow measurement/scheduler boundary tolerance, not an increased configured quota.
print(json.dumps({"cpu_percent": cpu, "elapsed_seconds": elapsed, "aggregate_memory_rejection": True, "job": job.sample()}))
