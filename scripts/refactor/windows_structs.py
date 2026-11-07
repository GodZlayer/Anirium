"""Win32 job layouts. Only standard library is needed to establish limits."""
import ctypes as C
from ctypes import wintypes as W


class BasicLimits(C.Structure):
    _fields_ = [("process_time", C.c_longlong), ("job_time", C.c_longlong),
                ("flags", W.DWORD), ("min_ws", C.c_size_t), ("max_ws", C.c_size_t),
                ("active_limit", W.DWORD), ("affinity", C.c_size_t),
                ("priority", W.DWORD), ("scheduling", W.DWORD)]


class IoCounters(C.Structure):
    _fields_ = [(name, C.c_ulonglong) for name in
                ("reads", "writes", "other", "read_bytes", "write_bytes", "other_bytes")]


class ExtendedLimits(C.Structure):
    _fields_ = [("basic", BasicLimits), ("io", IoCounters),
                ("process_memory", C.c_size_t), ("job_memory", C.c_size_t),
                ("peak_process_memory", C.c_size_t), ("peak_job_memory", C.c_size_t)]


class CpuRate(C.Structure):
    _fields_ = [("flags", W.DWORD), ("rate", W.DWORD)]


class Accounting(C.Structure):
    _fields_ = [(name, C.c_longlong) for name in
                ("user_time", "kernel_time", "period_user", "period_kernel")]
    _fields_ += [(name, W.DWORD) for name in
                 ("page_faults", "processes", "active", "terminated")]


class ProcessList(C.Structure):
    _fields_ = [("assigned", W.DWORD), ("count", W.DWORD),
                ("ids", C.c_size_t * 256)]
