"""One kernel-enforced budget for the supervisor and all inherited children."""
import ctypes as C
import os
import mmap
from ctypes import wintypes as W
from windows_structs import Accounting, CpuRate, ExtendedLimits, ProcessList

MEMORY_LIMIT = 1_000_000_000
PAGE_LIMIT = MEMORY_LIMIT // mmap.PAGESIZE * mmap.PAGESIZE
AFFINITY = 0xFF0


class WindowsJob:
    def __init__(self, name, existing=False):
        if os.name != "nt":
            raise RuntimeError("Native Windows is required; refusing an unbounded run")
        self.api = C.WinDLL("kernel32", use_last_error=True)
        signatures = {
            "CreateJobObjectW": ([C.c_void_p, W.LPCWSTR], W.HANDLE),
            "OpenJobObjectW": ([W.DWORD, W.BOOL, W.LPCWSTR], W.HANDLE),
            "SetInformationJobObject": ([W.HANDLE, C.c_int, C.c_void_p, W.DWORD], W.BOOL),
            "QueryInformationJobObject": ([W.HANDLE, C.c_int, C.c_void_p, W.DWORD, C.c_void_p], W.BOOL),
            "AssignProcessToJobObject": ([W.HANDLE, W.HANDLE], W.BOOL),
            "IsProcessInJob": ([W.HANDLE, W.HANDLE, C.POINTER(W.BOOL)], W.BOOL),
            "GetCurrentProcess": ([], W.HANDLE),
            "GetProcessAffinityMask": ([W.HANDLE, C.POINTER(C.c_size_t), C.POINTER(C.c_size_t)], W.BOOL),
            "CloseHandle": ([W.HANDLE], W.BOOL),
        }
        for method, (args, result) in signatures.items():
            function = getattr(self.api, method)
            function.argtypes, function.restype = args, result
        self.handle = self.api.OpenJobObjectW(0x3F, False, name) if existing else self.api.CreateJobObjectW(None, name)
        self.check(self.handle)
        if not existing:
            process_mask, system_mask = C.c_size_t(), C.c_size_t()
            self.check(self.api.GetProcessAffinityMask(self.api.GetCurrentProcess(), C.byref(process_mask), C.byref(system_mask)))
            if system_mask.value & AFFINITY != AFFINITY:
                raise RuntimeError("CPUs 4–11 are not all available")
            limits = ExtendedLimits()
            limits.basic.flags = 0x10 | 0x200 | 0x2000  # affinity, job memory, kill on last close
            limits.basic.affinity, limits.job_memory = AFFINITY, PAGE_LIMIT
            self.set(9, limits)
            self.set(15, CpuRate(0x1 | 0x4, 1000))  # ENABLE | HARD_CAP: 10% total CPU
        member = W.BOOL()
        self.check(self.api.IsProcessInJob(self.api.GetCurrentProcess(), self.handle, C.byref(member)))
        if not member.value:
            self.check(self.api.AssignProcessToJobObject(self.handle, self.api.GetCurrentProcess()))
        limits, cpu = self.query(9, ExtendedLimits), self.query(15, CpuRate)
        if limits.job_memory != PAGE_LIMIT or limits.basic.affinity != AFFINITY or cpu.rate != 1000 or cpu.flags & 5 != 5:
            raise RuntimeError(f"Operating system did not confirm limits: memory={limits.job_memory}, affinity={limits.basic.affinity:#x}, cpu_rate={cpu.rate}, cpu_flags={cpu.flags}")

    @staticmethod
    def check(result):
        if not result:
            raise C.WinError(C.get_last_error())

    def set(self, info, value):
        self.check(self.api.SetInformationJobObject(self.handle, info, C.byref(value), C.sizeof(value)))

    def query(self, info, kind):
        value = kind()
        self.check(self.api.QueryInformationJobObject(self.handle, info, C.byref(value), C.sizeof(value), None))
        return value

    def sample(self):
        processes = self.query(3, ProcessList)
        if processes.assigned > 256:
            raise RuntimeError("Unexpected process count in the pipeline job")
        account = self.query(1, Accounting)
        limits = self.query(9, ExtendedLimits)
        return {"pids": list(processes.ids[:processes.count]),
                "cpu_seconds": (account.user_time + account.kernel_time) / 10_000_000,
                "peak_committed_bytes": limits.peak_job_memory,
                "memory_limit_bytes": limits.job_memory, "cpu_limit_percent": 10,
                "affinity": list(range(4, 12)), "verified": True}
