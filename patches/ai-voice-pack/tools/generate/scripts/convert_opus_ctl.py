#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Пульт конвертера wav->opus (Windows, stdlib).

УСТАРЕЛО с 2026-10-14: в ai_voice только opus (легаси-wav удалены) —
конвертировать нечего; пульт оставлен для истории/рефов, ночная цепочка
convert-opus-night на пустом списке wav не падает (exit 0) и лишь
запускает voice_ctl start all.

Команды:
  start   — запустить конвертацию фоном (DETACHED, BelowNormal)
  pause   — заморозить CPU (маркер convert_opus.pause)
  resume  — снять паузу
  stop    — остановить после текущего чанка (convert_opus.stop);
            следующий start продолжит (resumable)
  status  — состояние из convert_opus.status.json
"""
import argparse
import ctypes
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CTRL_DIR = os.path.join(ROOT, "output", "voice")
PAUSE_FILE = os.path.join(CTRL_DIR, "convert_opus.pause")
STOP_FILE = os.path.join(CTRL_DIR, "convert_opus.stop")
PID_FILE = os.path.join(CTRL_DIR, "convert_opus.pid")
STATUS_FILE = os.path.join(CTRL_DIR, "convert_opus.status.json")
LOG_FILE = os.path.join(CTRL_DIR, "convert_opus.log")


def pid_alive(pid):
    if not pid:
        return False
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x1000, False, pid)
    if not h:
        return False
    code = ctypes.c_ulong()
    ok = k32.GetExitCodeProcess(h, ctypes.byref(code))
    k32.CloseHandle(h)
    return bool(ok) and code.value == 259


def current_pid():
    if not os.path.exists(PID_FILE):
        return 0
    try:
        return int(open(PID_FILE).read().strip())
    except (ValueError, OSError):
        return 0


def touch(path):
    os.makedirs(CTRL_DIR, exist_ok=True)
    with open(path, "w") as f:
        f.write(str(os.getpid()))


def cmd_start(args):
    if sys.platform != "win32":
        print("start: только Windows")
        return 1
    pid = current_pid()
    if pid_alive(pid):
        print("уже запущено (pid %d)" % pid)
        return 1
    for m in (STOP_FILE, PAUSE_FILE):
        if os.path.exists(m):
            os.remove(m)
    os.makedirs(CTRL_DIR, exist_ok=True)
    log = open(LOG_FILE, "a")
    try:
        p = subprocess.Popen(
            [sys.executable, os.path.join(ROOT, "tools", "convert_all_opus.py"),
             "--workers", str(args.workers)],
            cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=log, stderr=log,
            creationflags=0x08000000 | 0x00000200)  # DETACHED|NEW_GROUP
    except Exception as e:
        print("не стартовал: %s" % e)
        return 1
    # BelowNormal — не мешает интерактиву
    PROCESS_SET_INFORMATION = 0x0200
    BELOW_NORMAL = 0x4000
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(PROCESS_SET_INFORMATION, False, p.pid)
    if h:
        k32.SetPriorityClass(h, BELOW_NORMAL)
        k32.CloseHandle(h)
    print("запущено (pid %d, workers=%d), лог %s"
          % (p.pid, args.workers, os.path.relpath(LOG_FILE, ROOT)))
    return 0


def cmd_pause(args):
    pid = current_pid()
    if not pid_alive(pid):
        print("конвертер не запущен")
        return 1
    touch(PAUSE_FILE)
    print("пауза поставлена (сними: resume)")
    return 0


def cmd_resume(args):
    pid = current_pid()
    if not pid_alive(pid):
        print("конвертер не запущен — если остановлен, просто: start (продолжит)")
        return 1
    if os.path.exists(PAUSE_FILE):
        os.remove(PAUSE_FILE)
        print("пауза снята")
    else:
        print("паузы не было")
    return 0


def cmd_stop(args):
    pid = current_pid()
    if not pid_alive(pid):
        print("конвертер не запущен")
        return 1
    touch(STOP_FILE)
    if os.path.exists(PAUSE_FILE):
        os.remove(PAUSE_FILE)  # иначе стоит в paused и stop не увидит
    print("остановка после текущего чанка (start продолжит, skip готового)")
    return 0


def cmd_status(args):
    pid = current_pid()
    alive = pid_alive(pid)
    print("=== конвертер: %s ===" % ("RUNNING pid=%d" % pid if alive else "STOPPED"))
    if os.path.exists(PAUSE_FILE):
        print("  маркер: PAUSE")
    if os.path.exists(STOP_FILE):
        print("  маркер: STOP")
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, encoding="utf-8") as f:
                st = json.load(f)
        except (ValueError, OSError):
            st = None
        if st:
            eta = ("%d мин" % (st["eta_s"] // 60)) if st.get("eta_s") is not None else "?"
            print("  стейт: %s" % st.get("state"))
            print("  прогресс: %d/%d (ok=%d skip=%d fail=%d)"
                  % (st.get("processed", 0), st.get("total", 0),
                     st.get("done", 0), st.get("skip", 0), st.get("fail", 0)))
            print("  размер: wav %.1f MB -> opus %.1f MB (%s%%)"
                  % (st.get("wav_mb", 0), st.get("opus_mb", 0), st.get("ratio_pct")))
            print("  скорость: %s файлов/с, ETA %s" % (st.get("rate_files_per_s"), eta))
            print("  обновлено: %s" % st.get("updated"))
    elif alive:
        print("  статус ещё не записан (первый чанк)")
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("start")
    p.add_argument("--workers", type=int, default=8)
    p.set_defaults(fn=cmd_start)
    for name, fn in (("pause", cmd_pause), ("resume", cmd_resume),
                     ("stop", cmd_stop), ("status", cmd_status)):
        sp = sub.add_parser(name)
        sp.set_defaults(fn=fn)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
