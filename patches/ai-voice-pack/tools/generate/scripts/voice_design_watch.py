#!/usr/bin/env python
"""Демон-монитор генерации voice_design.py --n 10.

Каждые N минут (default 20) проверяет:
  - прогресс: сколько mp3 в generated vs цель (все касты с texts >= 10)
  - жив ли процесс voice_design (если мёртв — перезапускает)
  - не завис ли (нет новых файлов дольше stall-порога — убивает и
    перезапускает)

При каждом перезапуске убивает ВСЕ процессы voice_design.py и стартует
один свой (детерминированное состояние, без дублей). Всё резюмабельно:
готовые файлы скипаются.

СТОП: создай output/voice/watch.stop — демон выйдет на следующей итерации.

Запуск:
  python tools/voice_design_watch.py                 # интервалы по умолчанию
  python tools/voice_design_watch.py --interval 1200 --stall 1500 --once
"""

import argparse
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import catalog, config, paths  # noqa: E402

PY = r'C:\pinokio\api\Qwen3-TTS-Pinokio.git\app\venv\Scripts\python.exe'
N = int(config.get('design', 'candidates', 6))

STATUS_FILE = os.path.join(paths.OUTPUT_DIR, 'voice', 'design_status.txt')
STOP_FILE = os.path.join(paths.OUTPUT_DIR, 'voice', 'watch.stop')
WATCH_LOG = os.path.join(paths.OUTPUT_DIR, 'voice', 'watch.log')


def log(msg):
    line = time.strftime('%H:%M:%S ') + msg
    print(line)
    try:
        with open(WATCH_LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass


def status_file(msg):
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        with open(STATUS_FILE, 'w', encoding='utf-8') as f:
            f.write(msg + '\n')
    except Exception:
        pass


def target_count():
    """Сколько mp3 должно быть в generated (все касты с texts)."""
    n = 0
    for name in catalog.cast_names():
        if catalog.load_cast(name).get('texts'):
            n += N
    return n


def current_count():
    total = 0
    per_char = {}
    for name in catalog.cast_names():
        g = paths.char_subdir(name, 'generated')
        if not os.path.isdir(g):
            continue
        k = len([f for f in os.listdir(g) if f.endswith('.mp3')])
        per_char[name] = k
        total += k
    return total, per_char


def last_mp3_mtime():
    newest = 0
    for name in catalog.cast_names():
        g = paths.char_subdir(name, 'generated')
        if not os.path.isdir(g):
            continue
        for f in os.listdir(g):
            if f.endswith('.mp3'):
                m = os.path.getmtime(os.path.join(g, f))
                if m > newest:
                    newest = m
    return newest


def find_design_processes():
    """PID'ы процессов voice_design.py --n 10 (через wmic)."""
    out = subprocess.run(
        ['wmic', 'process', 'where', "name='python.exe'",
         'get', 'processid,commandline'],
        capture_output=True, text=True, errors='replace').stdout
    pids = []
    for line in out.splitlines():
        if 'voice_design.py' in line and '--n' in line:
            nums = [int(p) for p in line.split() if p.isdigit()]
            if nums:
                pids.append(nums[-1])
    return pids


def kill_all():
    for pid in find_design_processes():
        log('kill {}'.format(pid))
        subprocess.run(['taskkill', '/F', '/PID', str(pid)],
                       capture_output=True)


def start_design():
    stamp = time.strftime('%Y%m%d_%H%M%S')
    log_path = os.path.join(paths.OUTPUT_DIR, 'voice',
                            'design_run_{}.log'.format(stamp))
    log('start: {} -> {}'.format(
        ' '.join([os.path.basename(PY), 'voice_design.py --n {}'.format(N)]),
        log_path))
    f = open(log_path, 'w', encoding='utf-8')
    subprocess.Popen([PY, os.path.join(paths.TOOLS_DIR, 'voice_design.py'),
                      '--n', str(N)],
                     cwd=paths.ROOT, stdout=f, stderr=subprocess.STDOUT)


def iterate(interval, stall):
    target = target_count()
    count, per_char = current_count()
    newest = last_mp3_mtime()
    age = (time.time() - newest) if newest else -1
    pids = find_design_processes()

    msg = ('{} | mp3 {}/{} | последний файл {:.0f} мин назад | '
           'процессы: {}'.format(
               time.strftime('%Y-%m-%d %H:%M'), count, target,
               age / 60 if age >= 0 else -1, pids or '—'))
    log(msg)
    status_file(msg)

    if count >= target:
        log('DONE: цель достигнута ({}). Останавливаю процессы.'.format(target))
        kill_all()
        return False

    stalled = newest and age > stall
    if pids and not stalled:
        log('OK: процессы живы, прогресс идёт.')
        return True
    if stalled:
        log('!! завис: файлов нет > {} мин — убиваю и перезапускаю'.format(stall))
    else:
        log('!! процесс мёртв — перезапускаю')
    kill_all()
    start_design()
    return True


def main():
    ap = argparse.ArgumentParser(description='Демон-монитор voice_design')
    ap.add_argument('--interval', type=int, default=1200,
                    help='проверка каждые N секунд (default 1200 = 20 мин)')
    ap.add_argument('--stall', type=int, default=1500,
                    help='завис, если нет новых файлов дольше N сек (default 1500)')
    ap.add_argument('--once', action='store_true',
                    help='одна итерация и выход (проверка)')
    args = ap.parse_args()

    os.makedirs(os.path.join(paths.OUTPUT_DIR, 'voice'), exist_ok=True)
    log('watch start: interval={} stall={}'.format(args.interval, args.stall))
    log('стоп-файл: {}'.format(STOP_FILE))

    while True:
        try:
            if os.path.exists(STOP_FILE):
                log('стоп-файл найден — выхожу.')
                return 0
            if not iterate(args.interval, args.stall):
                return 0
        except Exception as e:
            log('!! ошибка итерации: {!r}'.format(e))
        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == '__main__':
    sys.exit(main())