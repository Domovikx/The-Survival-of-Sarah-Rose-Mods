#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Конвертация ai_voice/**/*.wav -> .opus 24k mono (ffmpeg libopus).

УСТАРЕЛО с 2026-10-14: в ai_voice только opus (легаси-wav удалены,
финальная миграция) — файлов для конвертации нет, запуск даёт
«start: 0 к конвертации» и exit 0. Инструмент оставлен для рефов/истории.

Резумабельный: существующий .opus пропускается. WAV не удаляется —
voice_config.rpy подхватывает opus первым, wav остаётся фолбэком.

Управление (маркеры в output/voice/, см. convert_opus_ctl.py):
  convert_opus.pause  — пауза: положить файл; resume: удалить
  convert_opus.stop   — остановка: выход после текущего чанка
Статус: output/voice/convert_opus.status.json + stdout-лог.
Коды выхода: 0 = всё конвертировано, 2 = остановлено вручную, 1 = ошибка.
Запись атомарная: ffmpeg -> *.opus.part, затем os.replace — обрыв
не оставляет битый .opus (при resume не будет skip мусора).
"""
import argparse
import ctypes
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_ROOT = os.path.join(ROOT, "ai_voice")
CTRL_DIR = os.path.join(ROOT, "output", "voice")
PAUSE_FILE = os.path.join(CTRL_DIR, "convert_opus.pause")
STOP_FILE = os.path.join(CTRL_DIR, "convert_opus.stop")
PID_FILE = os.path.join(CTRL_DIR, "convert_opus.pid")
STATUS_FILE = os.path.join(CTRL_DIR, "convert_opus.status.json")

EXIT_DONE = 0
EXIT_ERROR = 1
EXIT_STOPPED = 2


def pid_alive(pid):
    if not pid:
        return False
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x1000, False, pid)  # QUERY_LIMITED
    if not h:
        return False
    code = ctypes.c_ulong()
    ok = k32.GetExitCodeProcess(h, ctypes.byref(code))
    k32.CloseHandle(h)
    return bool(ok) and code.value == 259  # STILL_ACTIVE


def write_pid():
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))


def clear_pid():
    try:
        os.remove(PID_FILE)
    except OSError:
        pass


def write_status(state, done, skip, fail, total, in_sz, out_sz, t0):
    el = time.time() - t0
    processed = done + skip + fail
    rate = processed / el if el > 0 else 0
    eta = (total - processed) / rate if rate > 0 else -1
    st = {
        "state": state,
        "pid": os.getpid(),
        "done": done,
        "skip": skip,
        "fail": fail,
        "total": total,
        "processed": processed,
        "wav_mb": round(in_sz / 1048576.0, 1),
        "opus_mb": round(out_sz / 1048576.0, 1),
        "ratio_pct": round(out_sz / in_sz * 100, 1) if in_sz else None,
        "elapsed_s": int(el),
        "rate_files_per_s": round(rate, 2),
        "eta_s": int(eta) if eta >= 0 else None,
        "updated": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    tmp = STATUS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f, ensure_ascii=False)
    # Windows: читатель (ctl status) может держать файл открытым — retry
    for attempt in range(20):
        try:
            os.replace(tmp, STATUS_FILE)
            break
        except PermissionError:
            time.sleep(0.15)
    else:
        try:
            os.remove(tmp)
        except OSError:
            pass
    return st


def log_report(state, done, skip, fail, total, in_sz, out_sz, t0):
    st = write_status(state, done, skip, fail, total, in_sz, out_sz, t0)
    eta = ("%ds" % st["eta_s"]) if st["eta_s"] is not None else "?"
    print("[%ds] %s ok=%d skip=%d fail=%d %d/%d wav=%.1fMB opus=%.1fMB (%s%%) eta=%s"
          % (st["elapsed_s"], state, done, skip, fail, st["processed"], total,
             st["wav_mb"], st["opus_mb"], st["ratio_pct"], eta), flush=True)


def convert(src):
    out = os.path.splitext(src)[0] + ".opus"
    part = out + ".part"
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return src, 0, True, 0, 0
    sz_in = os.path.getsize(src) if os.path.exists(src) else 0
    try:
        r = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
             "-c:a", "libopus", "-b:a", "24k", "-ac", "1", "-f", "opus", part],
            capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        _rm(part)
        return src, -1, False, sz_in, 0
    if r.returncode != 0 or not os.path.exists(part) or os.path.getsize(part) == 0:
        _rm(part)
        return src, r.returncode if r.returncode else 1, False, sz_in, 0
    os.replace(part, out)
    return src, 0, False, sz_in, os.path.getsize(out)


def _rm(p):
    try:
        os.remove(p)
    except OSError:
        pass


def find_wavs(langs):
    out = []
    for lang in langs:
        for dp, _, fns in os.walk(os.path.join(VOICE_ROOT, lang)):
            for fn in fns:
                if fn.endswith(".wav"):
                    out.append(os.path.join(dp, fn))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", nargs="+", default=["ru", "en"])
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0, help="для теста: только N файлов")
    args = ap.parse_args()

    old_pid = 0
    if os.path.exists(PID_FILE):
        try:
            old_pid = int(open(PID_FILE).read().strip())
        except (ValueError, OSError):
            old_pid = 0
    if pid_alive(old_pid):
        print("уже запущено (pid %d) — выход" % old_pid)
        return EXIT_ERROR

    os.makedirs(CTRL_DIR, exist_ok=True)
    write_pid()
    t0 = time.time()
    done = skip = fail = 0
    in_sz = out_sz = 0

    try:
        all_wavs = find_wavs(args.langs)
        already = sum(1 for w in all_wavs
                      if os.path.exists(os.path.splitext(w)[0] + ".opus"))
        wavs = [w for w in all_wavs
                if not os.path.exists(os.path.splitext(w)[0] + ".opus")]
        if args.limit:
            wavs = wavs[: args.limit]
        total = len(wavs)
        print("start: %d к конвертации, %d уже opus (langs=%s, workers=%d)"
              % (total, already, ",".join(args.langs), args.workers), flush=True)
        log_report("running", done, skip, fail, total, in_sz, out_sz, t0)

        chunk = max(args.workers * 4, args.workers)
        stopped = False
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            for start in range(0, total, chunk):
                while os.path.exists(PAUSE_FILE) and not os.path.exists(STOP_FILE):
                    log_report("paused", done, skip, fail, total, in_sz, out_sz, t0)
                    time.sleep(3)
                if os.path.exists(STOP_FILE):
                    stopped = True
                    break
                futs = [ex.submit(convert, w) for w in wavs[start:start + chunk]]
                for fut in as_completed(futs):
                    src, rc, was, sz_in, sz_out = fut.result()
                    if was:
                        skip += 1
                    elif rc == 0:
                        done += 1
                        in_sz += sz_in
                        out_sz += sz_out
                    else:
                        fail += 1
                        print("FAIL %s rc=%s" % (src, rc), flush=True)
                    if (done + skip + fail) % 200 < args.workers:
                        log_report("running", done, skip, fail, total, in_sz, out_sz, t0)

        if stopped:
            log_report("stopped", done, skip, fail, total, in_sz, out_sz, t0)
            print("остановлено вручную (convert_opus.stop) — resume: перезапуск "
                  "продолжит, skip готового opus", flush=True)
            return EXIT_STOPPED

        log_report("done", done, skip, fail, total, in_sz, out_sz, t0)
        print("DONE: ok=%d skip=%d fail=%d" % (done, skip, fail), flush=True)
        return EXIT_DONE
    finally:
        clear_pid()


if __name__ == "__main__":
    sys.exit(main())
