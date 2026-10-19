#!/usr/bin/env python3
"""Thermal guard: паузы генерации озвучки от перегрева системы.

Контекст: 2026-10-12 ПК сам перезагрузился (Kernel-Power 41) на фоне
часовой генерации — корпус прогрелся, карта ушла в перегрев. Прямых
датчиков температуры в системе нет (MSAcpi_ThermalZoneTemperature
только под админом, ADL драйвера не отдаёт), поэтому защита работает
по косвенным сигналам:

  1. Duty-cycle: через каждые --work минут работы очереди ставятся
     на паузу на --cool минут — корпус успевает остыть.
  2. GPU: если видеоадаптер занят (любой движок GPU >= --gpu-threshold %)
     дольше --gpu-hold секунд (игра, оллама, рендер) — очереди встают;
     снимаются после --gpu-idle секунд простоя адаптера.
  3. Ручная пауза пользователя (voice-pause) не трогается: guard
     ставит/снимает паузу только если ставил её сам (свой стейт).

Пауза/снятие — через voice_ctl (заморозка воркеров, wav целы).
Стоп: создать файл output/voice/thermal.stop (guard снимет свою
паузу и выйдет). Лог: output/voice/thermal_guard.log.

Запуск: python scripts/thermal_guard.py [--dry-run]
Двойной клик: scripts/thermal-guard.cmd
Автостарт: задача TSSR-ThermalGuard (AtLogOn, pythonw без окна).
"""

import argparse
import ctypes
import json
import os
import struct
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'output', 'voice')
LOG_FILE = os.path.join(OUT, 'thermal_guard.log')
STOP_FILE = os.path.join(OUT, 'thermal.stop')
STATE_FILE = os.path.join(OUT, 'thermal_guard.json')

DEFAULTS = {
    'work': 45,        # минут непрерывной генерации до паузы
    'cool': 10,        # минут остывания
    'gpu_threshold': 40.0,  # % утилизации движка GPU = «занят»
    'gpu_hold': 60,    # сек занятости GPU подряд до паузы
    'gpu_idle': 120,   # сек простоя GPU подряд до снятия паузы
    'tick': 15,        # сек между опросами
}


# ---------- лог / стейт ----------

def log(msg):
    line = '%s %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), msg)
    try:
        os.makedirs(OUT, exist_ok=True)
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass
    try:
        print(line, flush=True)
    except Exception:
        pass


def load_state():
    try:
        with open(STATE_FILE, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {'paused': False, 'start': time.monotonic()}


def save_state(st):
    try:
        tmp = STATE_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(st, f)
        os.replace(tmp, STATE_FILE)
    except OSError as e:
        log('state save failed: %s' % e)


def stop_requested():
    return os.path.exists(STOP_FILE)


# ---------- GPU: утилизация через PDH (perf counters) ----------

PDH_FMT_DOUBLE = 0x00000200
PDH_OK = 0
PDH_MORE_DATA = 0x800007D2
PDH_ITEM_STRIDE = 24   # эмпирическая раскладка элемента массива
PDH_VALUE_OFFSET = 16  # double со значением внутри элемента


def _pdh_annotate(pdh):
    """Корректные прототипы: без restype статусы отдаются со знаком
    (PDH_MORE_DATA = 0x800007D2 превращается в отрицательное число)."""
    pdh.PdhOpenQueryW.argtypes = [
        ctypes.c_wchar_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    pdh.PdhOpenQueryW.restype = ctypes.c_ulong
    pdh.PdhAddEnglishCounterW.argtypes = [
        ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_ulong,
        ctypes.POINTER(ctypes.c_void_p)]
    pdh.PdhAddEnglishCounterW.restype = ctypes.c_ulong
    pdh.PdhCollectQueryData.argtypes = [ctypes.c_void_p]
    pdh.PdhCollectQueryData.restype = ctypes.c_ulong
    pdh.PdhGetFormattedCounterArrayW.argtypes = [
        ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_uint32),
        ctypes.POINTER(ctypes.c_uint32), ctypes.c_void_p]
    pdh.PdhGetFormattedCounterArrayW.restype = ctypes.c_ulong
    pdh.PdhCloseQuery.argtypes = [ctypes.c_void_p]
    pdh.PdhCloseQuery.restype = ctypes.c_ulong


class GpuMeter:
    """Максимальная утилизация движка GPU в %.

    Честный опрос: PdhAddEnglishCounter работает на любой локали,
    два CollectQueryData подряд дают значение rate-счётчика.

    Формат буфера PdhGetFormattedCounterArrayW (проверено 2026-10-12):
    count элементов по 24 байта (double на +16, 0..100), затем
    UTF-16 имена инстансов — структуры парсим сами, ctypes-структура
    из документации тут не подходит.
    """

    def __init__(self):
        self.ok = False
        self.query = ctypes.c_void_p()
        self.counter = ctypes.c_void_p()
        self._init_done = False
        try:
            self.pdh = ctypes.windll.pdh
            _pdh_annotate(self.pdh)
            r = self.pdh.PdhOpenQueryW(None, 0, ctypes.byref(self.query))
            if r != PDH_OK:
                raise OSError('PdhOpenQuery %d' % r)
            r = self.pdh.PdhAddEnglishCounterW(
                self.query, r'\GPU Engine(*)\Utilization Percentage',
                0, ctypes.byref(self.counter))
            if r != PDH_OK:
                raise OSError('PdhAddEnglishCounter %d' % r)
            self.ok = True
        except Exception as e:
            log('GPU meter unavailable: %s (duty-cycle only)' % e)

    def util(self):
        """% самого занятого движка GPU, либо None."""
        if not self.ok:
            return None
        try:
            if not self._init_done:
                if self.pdh.PdhCollectQueryData(self.query) != PDH_OK:
                    return None
                time.sleep(1.05)
                self._init_done = True
            if self.pdh.PdhCollectQueryData(self.query) != PDH_OK:
                return None
            size = ctypes.c_uint32(0)
            count = ctypes.c_uint32(0)
            r = self.pdh.PdhGetFormattedCounterArrayW(
                self.counter, PDH_FMT_DOUBLE,
                ctypes.byref(size), ctypes.byref(count), None)
            # первый вызов без буфера всегда возвращает PDH_MORE_DATA
            if r not in (PDH_OK, PDH_MORE_DATA) or size.value == 0:
                return None
            buf = ctypes.create_string_buffer(size.value)
            r = self.pdh.PdhGetFormattedCounterArrayW(
                self.counter, PDH_FMT_DOUBLE,
                ctypes.byref(size), ctypes.byref(count), buf)
            if r != PDH_OK:
                return None
            raw = bytes(buf.raw[:size.value])
            n = count.value
            if n == 0 or len(raw) < n * PDH_ITEM_STRIDE:
                return None
            best = 0.0
            for i in range(n):
                if i * PDH_ITEM_STRIDE + PDH_VALUE_OFFSET + 8 > len(raw):
                    break
                v = struct.unpack_from(
                    '<d', raw, i * PDH_ITEM_STRIDE + PDH_VALUE_OFFSET)[0]
                if 0.0 <= v <= 100.0 and v > best:
                    best = v
            return best
        except Exception as e:
            log('GPU read failed: %s' % e)
            return None


# ---------- чистая логика решений (покрыта тестами) ----------

def decide(st, now, gpu, cfg):
    """Один шаг охраны. st — dict, now — time.monotonic(), gpu — % | None.

    Возвращает (st2, action, reason), action: None | 'pause' | 'resume'.
    Чистая функция: ничего не трогает, только стейт и решение.
    """
    st = dict(st)
    work = cfg['work']
    cool = cfg['cool']

    # 1. duty-cycle: позиция в цикле work+cool от старта guard (секунды)
    cycle = (work + cool) * 60
    if work > 0 and cool > 0 and cycle > 0:
        duty_cool = (now - st.get('start', now)) % cycle >= work * 60
    else:
        duty_cool = False

    # 2. hysteresis по занятости GPU (hold/idle подряд)
    busy = gpu is not None and gpu >= cfg['gpu_threshold']
    if busy:
        if st.get('busy_since') is None:
            st['busy_since'] = now
        st['idle_since'] = None
    else:
        if st.get('idle_since') is None:
            st['idle_since'] = now
        st['busy_since'] = None
    gpu_block = bool(st.get('gpu_block', False))
    if not gpu_block:
        if (st.get('busy_since') is not None
                and now - st['busy_since'] >= cfg['gpu_hold']):
            gpu_block = True
    elif (st.get('idle_since') is not None
            and now - st['idle_since'] >= cfg['gpu_idle']):
        gpu_block = False
    st['gpu_block'] = gpu_block

    should_pause = duty_cool or gpu_block
    paused = bool(st.get('paused', False))
    if should_pause and not paused:
        reason = 'gpu-busy' if gpu_block else 'duty-cycle'
        return st, 'pause', reason
    if not should_pause and paused:
        return st, 'resume', 'cycle-done'
    return st, None, ('duty' if duty_cool else 'gpu' if gpu_block else 'ok')


# ---------- применение паузы через voice_ctl ----------

def ctl(langs, cmd):
    """python voice_ctl.py {pause|resume} {langs}. rc процесса."""
    proc = subprocess.run(
        [sys.executable, os.path.join(SCRIPTS, 'voice_ctl.py'), cmd, langs],
        cwd=ROOT, capture_output=True, text=True, timeout=120,
        encoding='utf-8', errors='replace')
    return proc.returncode


def ctl_paused_exists():
    """Есть ли ctl_paused_{ru,en}.json — физическая пауза воркеров."""
    return any(os.path.exists(os.path.join(OUT, 'ctl_paused_%s.json' % l))
               for l in ('ru', 'en'))


def apply_action(action, st, dry=False):
    """Ставит/снимает паузу. Обновляет st['paused'].

    Правила:
      - pause ставим только если физической паузы ещё нет; если паузу
        поставил пользователь — не помечаем своим стейтом;
      - resume снимаем только свою паузу (st['paused']).
    """
    if dry:
        log('DRY-RUN: would %s (paused=%s)' % (action, st.get('paused')))
        return st
    if action == 'pause':
        if ctl_paused_exists():
            log('queues already paused externally — not claiming')
            return st
        rc = ctl('all', 'pause')
        claimed = ctl_paused_exists()
        st['paused'] = claimed
        log('pause rc=%s claimed=%s' % (rc, claimed))
    elif action == 'resume':
        if not st.get('paused'):
            return st
        rc = ctl('all', 'resume')
        st['paused'] = False
        log('resume rc=%s' % rc)
    return st


# ---------- main loop ----------

def run_loop(cfg, dry=False):
    st = load_state()
    st.setdefault('start', time.monotonic())
    # после рестарта guard'а физическую паузу подтверждаем файлом
    if st.get('paused') and not ctl_paused_exists():
        st['paused'] = False
    log('guard started: work=%dmin cool=%dmin gpu>=%g%% hold=%ds idle=%ds '
        'paused=%s' % (cfg['work'], cfg['cool'], cfg['gpu_threshold'],
                       cfg['gpu_hold'], cfg['gpu_idle'], st.get('paused')))
    meter = GpuMeter()
    last_hb = 0.0
    while True:
        if stop_requested():
            log('stop file found — exiting')
            st = apply_action('resume', st, dry=dry)
            save_state(st)
            return 0
        gpu = meter.util()
        st2, action, reason = decide(st, time.monotonic(), gpu, cfg)
        st = st2
        if action:
            log('decision: %s (%s, gpu=%s)' % (
                action, reason, '%.0f%%' % gpu if gpu is not None else '?'))
            st = apply_action(action, st, dry=dry)
            save_state(st)
        if time.monotonic() - last_hb >= 300:
            last_hb = time.monotonic()
            log('heartbeat: gpu=%s paused=%s reason=%s' % (
                '%.0f%%' % gpu if gpu is not None else '?',
                st.get('paused'), reason))
            save_state(st)
        time.sleep(cfg['tick'])


def main(argv=None):
    ap = argparse.ArgumentParser(
        description='Thermal guard: duty-cycle + GPU-паузы генерации')
    ap.add_argument('--work', type=int, default=DEFAULTS['work'],
                    help='минут генерации до паузы (по умолч. %d)'
                         % DEFAULTS['work'])
    ap.add_argument('--cool', type=int, default=DEFAULTS['cool'],
                    help='минут остывания (по умолч. %d)' % DEFAULTS['cool'])
    ap.add_argument('--gpu-threshold', type=float,
                    default=DEFAULTS['gpu_threshold'],
                    help='утилизация GPU (в процентах) = занят, по умолч. %g'
                         % DEFAULTS['gpu_threshold'])
    ap.add_argument('--gpu-hold', type=int, default=DEFAULTS['gpu_hold'],
                    help='сек занятости GPU до паузы (по умолч. %d)'
                         % DEFAULTS['gpu_hold'])
    ap.add_argument('--gpu-idle', type=int, default=DEFAULTS['gpu_idle'],
                    help='сек простоя GPU до снятия (по умолч. %d)'
                         % DEFAULTS['gpu_idle'])
    ap.add_argument('--tick', type=int, default=DEFAULTS['tick'],
                    help='сек между опросами (по умолч. %d)'
                         % DEFAULTS['tick'])
    ap.add_argument('--once', action='store_true',
                    help='один цикл: решение + выход (для проверки)')
    ap.add_argument('--dry-run', action='store_true',
                    help='только логировать, паузу не ставить')
    args = ap.parse_args(argv)

    cfg = {
        'work': args.work, 'cool': args.cool,
        'gpu_threshold': args.gpu_threshold,
        'gpu_hold': args.gpu_hold, 'gpu_idle': args.gpu_idle,
        'tick': args.tick,
    }
    if args.once:
        st = load_state()
        meter = GpuMeter()
        gpu = meter.util()
        st2, action, reason = decide(st, time.monotonic(), gpu, cfg)
        print('gpu=%s action=%s reason=%s paused=%s' % (
            '%.0f%%' % gpu if gpu is not None else '?',
            action, reason, st2.get('paused')))
        return 0
    return run_loop(cfg, dry=args.dry_run)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\ninterrupted')
        sys.exit(130)
    except Exception as e:
        log('FATAL: %s' % e)
        raise
