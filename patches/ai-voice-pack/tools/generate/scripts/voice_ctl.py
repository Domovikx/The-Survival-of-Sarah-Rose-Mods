#!/usr/bin/env python3
"""Пульт управления очередями озвучки TSSR (Windows).

Быстрые команды вместо поиска тулов вручную::

    python tools/voice_ctl.py status          # что сейчас происходит
    python tools/voice_ctl.py start [ru|en|all]   # запуск очередей (resumable)
    python tools/voice_ctl.py stop [ru|en|all]    # остановка очередей
    python tools/voice_ctl.py soft-stop [ru|en|all] [--timeout 300]  # доделать текущий файл и встать (CPU+RAM свободны, resumable)
    python tools/voice_ctl.py pause [ru|en|all]   # пауза (заморозка процессов)
    python tools/voice_ctl.py resume [ru|en|all]  # снять с паузы
    python tools/voice_ctl.py watch [--interval 30]  # живой мониторинг
    python tools/voice_ctl.py logs [--lang ru] [-n 20]  # хвост лога

Двойной клик (без админа): tools/voice-start.cmd, voice-stop.cmd,
voice-soft-stop.cmd, voice-pause.cmd, voice-resume.cmd, voice-status.cmd,
voice-watch.cmd.

Как это работает:
  - очереди = scripts/voice_queue.sh {ru|en} (bash, resumable, низкий приоритет);
  - процессы ищутся по cmdline: 'voice_queue.sh' (обертка) и 'voice_batch.mts'
    (воркер) + '--lang {lang}';
  - пауза = NtSuspendProcess по воркерам, состояние — output/voice/ctl_paused_{lang}.json;
  - soft-stop = снять паузу (если была) + дождаться '  saved ' текущего файла
    в gen_all_{lang}.log + обычный stop (CPU и RAM свободны);
  - генерация resumable: перезапуск продолжает с места останова, готовые файлы скипаются.

Только стандартная библиотека (работает системным python).
Вывод — ASCII-безопасный (консоль cp866/cp1251 не переваривает символы вроде x/✓).
"""

import argparse
import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time

from voicekit import paths  # единственный источник путей (см. voicekit/paths.py)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ('ru', 'en')
QUEUE_MARK = 'voice_queue.sh'
WORKER_MARK = 'voice_batch.mts'
LOG_TMPL = os.path.join(ROOT, 'output', 'voice', 'gen_all_{}.log')
PAUSE_TMPL = os.path.join(ROOT, 'output', 'voice', 'ctl_paused_{}.json')
STALE_LOG_SEC = 180  # лог старше — считаем очередь зависшей

PROGRESS_RE = re.compile(r'^\[(\d+)/(\d+)\]\s+(\S+)\s+(\S+)\s*(.*)$')
START_RE = re.compile(r'=== START (\w+) (\w+)')
DONE_RE = re.compile(r'=== DONE (\w+) (\w+)')


# ---------- чистые хелперы (покрыты тестами) ----------

def norm_langs(arg):
    """'ru'/'en'/'all'/None -> список языков. ValueError на мусоре."""
    if arg in (None, '', 'all', 'both'):
        return list(LANGS)
    if arg in LANGS:
        return [arg]
    raise ValueError("язык: 'ru', 'en' или 'all', получено %r" % (arg,))


def parse_progress_line(line):
    """'[5139/5207] uid Arc Who: текст' -> (done, total) | None."""
    m = PROGRESS_RE.match(line.strip())
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2)))


def parse_log_state(text):
    """Текст gen_all_{lang}.log -> (active_arc|None, (done,total)|None).

    active_arc: последний START без DONE после него (логика voice_status.py).
    Прогресс: последний [n/m] (воркер сейчас на этой арке).
    """
    arc = None
    last_start = None
    for m in START_RE.finditer(text):
        last_start = (m.start(), m.group(2))
    if last_start:
        pos, arc = last_start
        if DONE_RE.search(text[pos:]):
            arc = None
    prog = None
    for line in text.splitlines():
        p = parse_progress_line(line)
        if p:
            prog = p
    return arc, prog


def format_age(sec):
    """Секунды -> '12 сек' / '5 мин' / '2 ч' / '3 дн'."""
    sec = int(sec)
    if sec < 90:
        return '%d сек' % sec
    if sec < 5400:
        return '%d мин' % (sec // 60)
    if sec < 172800:
        return '%d ч' % (sec // 3600)
    return '%d дн' % (sec // 86400)


def count_saved(text):
    """Число готовых файлов в логе: строки '  saved ...' (пишет voice_batch.mts).

    Чистая функция (покрыта тестами). Пустой текст -> 0.
    """
    if not text:
        return 0
    n = 0
    for line in text.splitlines():
        if '  saved ' in line:
            n += 1
    return n


# ---------- процессы Windows ----------

def list_processes():
    """Все процессы: [(pid, name, cmdline)]. Пустой cmdline -> ''."""
    ps = (r"Get-CimInstance Win32_Process | "
          r"Select-Object ProcessId,Name,CommandLine | "
          r"ConvertTo-Csv -NoTypeInformation")
    try:
        raw = subprocess.run(
            ['powershell.exe', '-NoProfile', '-Command', ps],
            capture_output=True, timeout=60).stdout
    except Exception:
        return []
    # Декодим с replace: для ASCII-маркеров кодировка не важна.
    text = raw.decode('utf-8', errors='replace')
    out = []
    try:
        for row in csv.DictReader(io.StringIO(text)):
            try:
                out.append((int(row['ProcessId']),
                            (row['Name'] or ''),
                            (row['CommandLine'] or '')))
            except (ValueError, KeyError):
                continue
    except Exception:
        return []
    return out


def find_queues(lang):
    """PID bash-оберток voice_queue.sh для языка."""
    return [pid for pid, name, cmd in list_processes()
            if name.lower() == 'bash.exe'
            and QUEUE_MARK in cmd and lang in cmd.split()]


def find_workers(lang):
    """PID воркеров voice_batch.mts --lang {lang}."""
    tag = '--lang %s' % lang
    return [pid for pid, name, cmd in list_processes()
            if name.lower() == 'python.exe'
            and WORKER_MARK in cmd and tag in cmd]


def taskkill(pid, tree=False):
    """taskkill /F [/T]. True если процесс убит/уже нет."""
    args = ['taskkill', '/PID', str(pid), '/F']
    if tree:
        args.append('/T')
    try:
        r = subprocess.run(args, capture_output=True, timeout=30)
        return r.returncode == 0
    except Exception:
        return False


def suspend_process(pid):
    """Заморозка процесса (NtSuspendProcess). Бросает OSError."""
    import ctypes
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x0800, False, pid)  # PROCESS_SUSPEND_RESUME
    if not h:
        raise OSError('OpenProcess(%s) не удался' % pid)
    try:
        rc = ctypes.windll.ntdll.NtSuspendProcess(h)
        if rc != 0:
            raise OSError('NtSuspendProcess(%s) rc=%s' % (pid, rc))
    finally:
        k32.CloseHandle(h)


def resume_process(pid):
    """Разморозка процесса (NtResumeProcess). Бросает OSError."""
    import ctypes
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x0800, False, pid)
    if not h:
        raise OSError('OpenProcess(%s) не удался' % pid)
    try:
        rc = ctypes.windll.ntdll.NtResumeProcess(h)
        if rc != 0:
            raise OSError('NtResumeProcess(%s) rc=%s' % (pid, rc))
    finally:
        k32.CloseHandle(h)


def find_bash():
    """Путь к bash.exe (Git for Windows)."""
    p = shutil.which('bash')
    if p:
        return p
    for c in (r'C:\Program Files\Git\bin\bash.exe',
              r'C:\Program Files\Git\usr\bin\bash.exe'):
        if os.path.isfile(c):
            return c
    return None


def set_below_normal(pid):
    """Понизить приоритет процесса (не фатально при ошибке)."""
    import ctypes
    try:
        k32 = ctypes.windll.kernel32
        h = k32.OpenProcess(0x0200, False, pid)  # PROCESS_SET_INFORMATION
        if h:
            k32.SetPriorityClass(h, 0x4000)  # BELOW_NORMAL_PRIORITY_CLASS
            k32.CloseHandle(h)
    except Exception:
        pass


# ---------- состояние очередей ----------

def read_log(lang):
    try:
        with open(LOG_TMPL.format(lang), encoding='utf-8',
                  errors='replace') as f:
            return f.read()
    except OSError:
        return ''


def count_done(lang, arc=None):
    """Число готовых реплик (стем wav|opus): язык или арка. -1 если папки нет.

    Пара wav+opus за один стем считается один раз. Корпус сейчас только
    opus (легаси-wav удалены 2026-10-14), ветка .wav оставлена на случай
    возврата — чтобы цифры не удвоились.
    """
    base = paths.ai_voice_dir(lang)
    if arc:
        base = os.path.join(base, arc)
    if not os.path.isdir(base):
        return -1
    if arc:
        try:
            return len({os.path.splitext(f)[0] for f in os.listdir(base)
                        if (f.endswith('.wav') or f.endswith('.opus'))
                        and '.ln.tmp.' not in f})
        except OSError:
            return -1
    total = 0
    try:
        for a in os.listdir(base):
            p = os.path.join(base, a)
            if os.path.isdir(p):
                try:
                    total += len({os.path.splitext(f)[0]
                                  for f in os.listdir(p)
                                  if (f.endswith('.wav') or f.endswith('.opus'))
                                  and '.ln.tmp.' not in f})
                except OSError:
                    pass
    except OSError:
        return -1
    return total


def pause_state(lang):
    try:
        with open(PAUSE_TMPL.format(lang), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def lang_status(lang):
    """Сводка по языку (словарь)."""
    workers = find_workers(lang)
    queues = find_queues(lang)
    paused = pause_state(lang)
    text = read_log(lang)
    arc, prog = parse_log_state(text) if text else (None, None)
    try:
        mtime = os.path.getmtime(LOG_TMPL.format(lang))
        age = time.time() - mtime
    except OSError:
        age = None
    done_arc = count_done(lang, arc) if arc else -1
    total = count_done(lang)
    if paused:
        state = 'PAUSED'
    elif workers:
        state = 'RUNNING' if (age is not None and age < STALE_LOG_SEC) \
            else 'STALLED'
    else:
        state = 'STOPPED'
    return {'lang': lang, 'state': state, 'workers': workers,
            'queues': queues, 'paused': paused, 'arc': arc, 'prog': prog,
            'done_arc': done_arc, 'total': total, 'log_age': age}


def print_status(langs):
    print('=== ОЗВУЧКА: %s ===' % time.strftime('%H:%M:%S'))
    for lang in langs:
        s = lang_status(lang)
        print('--- %s: %s ---' % (lang.upper(), s['state']))
        if s['workers']:
            print('  воркеры: %s' % ', '.join(map(str, s['workers'])))
        if s['paused']:
            print('  пауза с: %s (pids %s)' % (
                s['paused'].get('at', '?'),
                ', '.join(map(str, s['paused'].get('pids', [])))))
        if s['arc']:
            line = '  арка: %s' % s['arc']
            if s['prog']:
                d, t = s['prog']
                line += ' [%d/%d] (%.1f%%)' % (d, t, 100.0 * d / t if t else 0)
            if s['done_arc'] >= 0:
                line += ', готово: %d' % s['done_arc']
            print(line)
        elif s['prog']:
            d, t = s['prog']
            print('  прогресс: [%d/%d]' % (d, t))
        if s['log_age'] is None:
            print('  лог: нет')
        else:
            print('  лог: %s назад' % format_age(s['log_age']))
        if s['total'] >= 0:
            print('  всего %s фраз: %d' % (lang.upper(), s['total']))
        if s['state'] == 'STOPPED' and s['arc']:
            print('  встанет на: %s (resumable)' % s['arc'])
    return 0


# ---------- команды ----------

def cmd_status(args):
    return print_status(norm_langs(args.lang))


def cmd_start(args):
    if sys.platform != 'win32':
        print('start: только Windows')
        return 1
    bash = find_bash()
    if not bash:
        print('start: не найден bash.exe (нужен Git for Windows)')
        return 1
    rc = 0
    for lang in norm_langs(args.lang):
        if find_queues(lang) or find_workers(lang):
            print('%s: уже запущено, пропуск' % lang.upper())
            continue
        try:
            p = subprocess.Popen(
                [bash, os.path.join(paths.SCRIPTS_DIR, 'voice_queue.sh'), lang],
                cwd=ROOT, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=0x08000000 | 0x00000200)  # DETACHED|NEW_GROUP
        except Exception as e:
            print('%s: не стартовал: %s' % (lang.upper(), e))
            rc = 1
            continue
        set_below_normal(p.pid)
        time.sleep(5)
        if find_queues(lang) or find_workers(lang):
            print('%s: запущено (bash pid %d), лог output/voice/gen_all_%s.log'
                  % (lang.upper(), p.pid, lang))
        else:
            print('%s: стартовал, но очередь не видна — смотри voice-status'
                  % lang.upper())
    return rc


def cmd_stop(args):
    if sys.platform != 'win32':
        print('stop: только Windows')
        return 1
    rc = 0
    for lang in norm_langs(args.lang):
        killed = 0
        for pid in find_queues(lang):
            if taskkill(pid, tree=True):
                killed += 1
        time.sleep(2)
        for pid in find_workers(lang):
            if taskkill(pid, tree=True):
                killed += 1
        try:
            os.remove(PAUSE_TMPL.format(lang))
        except OSError:
            pass
        left = find_workers(lang) + find_queues(lang)
        if left:
            print('%s: осталось висеть: %s — добей вручную (taskkill)'
                  % (lang.upper(), left))
            rc = 1
        else:
            print('%s: остановлено (убито %d)' % (lang.upper(), killed))
    print('Готовые файлы целы, рестарт продолжит (resumable).')
    return rc


def cmd_pause(args):
    if sys.platform != 'win32':
        print('pause: только Windows')
        return 1
    rc = 0
    for lang in norm_langs(args.lang):
        if pause_state(lang):
            print('%s: уже на паузе (resume чтобы снять)' % lang.upper())
            continue
        pids = find_workers(lang)
        if not pids:
            print('%s: нечего морозить (воркеров нет)' % lang.upper())
            continue
        frozen = []
        for pid in pids:
            try:
                suspend_process(pid)
                frozen.append(pid)
            except OSError as e:
                print('%s: pid %d не заморожен: %s' % (lang.upper(), pid, e))
                rc = 1
        with open(PAUSE_TMPL.format(lang), 'w', encoding='utf-8') as f:
            json.dump({'pids': frozen,
                       'at': time.strftime('%Y-%m-%d %H:%M:%S')}, f)
        print('%s: пауза (заморожено %d: %s)' % (lang.upper(), len(frozen),
                                                ', '.join(map(str, frozen))))
    return rc


def cmd_resume(args):
    if sys.platform != 'win32':
        print('resume: только Windows')
        return 1
    rc = 0
    for lang in norm_langs(args.lang):
        st = pause_state(lang)
        if not st:
            print('%s: не на паузе' % lang.upper())
            continue
        alive = set(find_workers(lang))
        resumed = 0
        for pid in st.get('pids', []):
            if pid not in alive:
                print('%s: pid %d уже нет (перезапустился?)' %
                      (lang.upper(), pid))
                continue
            try:
                resume_process(pid)
                resumed += 1
            except OSError as e:
                print('%s: pid %d не разморожен: %s' % (lang.upper(), pid, e))
                rc = 1
        try:
            os.remove(PAUSE_TMPL.format(lang))
        except OSError:
            pass
        print('%s: снято с паузы (%d)' % (lang.upper(), resumed))
    return rc


def cmd_softstop(args):
    """Мягкая остановка: доделать текущий файл, потом обычный stop.

    - если была пауза — сначала resume (иначе файл никогда не доделается);
    - ждём новый '  saved ' в gen_all_{lang}.log (таймаут --timeout, по умолч. 300с);
    - потом та же зачистка, что в stop: taskkill очередей+воркеров, снять метку паузы.
    CPU и RAM освобождаются, готовые файлы целы, рестарт продолжает (resumable).
    """
    if sys.platform != 'win32':
        print('soft-stop: только Windows')
        return 1
    try:
        timeout = max(10, int(getattr(args, 'timeout', 300) or 300))
    except (TypeError, ValueError):
        timeout = 300
    rc = 0
    for lang in norm_langs(args.lang):
        if find_queues(lang) or find_workers(lang) or pause_state(lang):
            pass
        else:
            print('%s: уже остановлено' % lang.upper())
            continue
        # 1. снять паузу, если была (иначе ждать бессмысленно)
        st = pause_state(lang)
        if st:
            alive = set(find_workers(lang))
            resumed = 0
            for pid in st.get('pids', []):
                if pid not in alive:
                    continue
                try:
                    resume_process(pid)
                    resumed += 1
                except OSError as e:
                    print('%s: pid %d не разморожен: %s'
                          % (lang.upper(), pid, e))
                    rc = 1
            try:
                os.remove(PAUSE_TMPL.format(lang))
            except OSError:
                pass
            print('%s: снято с паузы (%d), жду текущий файл...'
                  % (lang.upper(), resumed))
        # 2. ждать доделки текущего файла (новый '  saved ' в логе)
        base = count_saved(read_log(lang))
        deadline = time.time() + timeout
        finished = False
        while time.time() < deadline:
            time.sleep(5)
            if not find_workers(lang) and not find_queues(lang):
                print('%s: очередь сама завершилась' % lang.upper())
                finished = True
                break
            if count_saved(read_log(lang)) > base:
                print('%s: текущий файл доделан' % lang.upper())
                finished = True
                break
        if not finished:
            print('%s: таймаут %dс — останавливаю жёстко '
                  '(текущий файл доделается при рестарте)' % (lang.upper(), timeout))
        # 3. обычная зачистка как в stop
        killed = 0
        for pid in find_queues(lang):
            if taskkill(pid, tree=True):
                killed += 1
        time.sleep(2)
        for pid in find_workers(lang):
            if taskkill(pid, tree=True):
                killed += 1
        try:
            os.remove(PAUSE_TMPL.format(lang))
        except OSError:
            pass
        left = find_workers(lang) + find_queues(lang)
        if left:
            print('%s: осталось висеть: %s — добей вручную (taskkill)'
                  % (lang.upper(), left))
            rc = 1
        else:
            print('%s: мягко остановлено (убито %d)' % (lang.upper(), killed))
    print('Готовые файлы целы, рестарт продолжит (resumable).')
    return rc


def cmd_watch(args):
    try:
        interval = max(5, int(args.interval))
    except (TypeError, ValueError):
        interval = 30
    langs = norm_langs(args.lang)
    print('Мониторинг каждые %d сек, Ctrl+C — выход.' % interval)
    try:
        while True:
            os.system('cls' if os.name == 'nt' else 'clear')
            print_status(langs)
            print('\nCtrl+C — выход.')
            time.sleep(interval)
    except KeyboardInterrupt:
        print('\nВыход.')
    return 0


def cmd_logs(args):
    langs = norm_langs(args.lang)
    n = max(1, int(args.n or 20))
    for lang in langs:
        print('=== лог %s (последние %d) ===' % (lang.upper(), n))
        try:
            with open(LOG_TMPL.format(lang), 'rb') as f:
                lines = f.read().splitlines()[-n:]
            for b in lines:
                print(b.decode('utf-8', errors='replace').rstrip('\r'))
        except OSError:
            print('(нет лога)')
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description='Пульт очередей озвучки TSSR')
    sub = ap.add_subparsers(dest='cmd')

    def add_lang(p):
        p.add_argument('lang', nargs='?', default='all',
                       help="ru|en|all (по умолчанию all)")

    s = sub.add_parser('status', help='что сейчас происходит')
    add_lang(s)
    s = sub.add_parser('start', help='запустить очереди')
    add_lang(s)
    s = sub.add_parser('stop', help='остановить очереди')
    add_lang(s)
    s = sub.add_parser('soft-stop', help='доделать текущий файл и встать (CPU+RAM свободны)')
    add_lang(s)
    s.add_argument('--timeout', default=300, help='сек ждать текущий файл')
    s = sub.add_parser('pause', help='пауза (заморозка воркеров)')
    add_lang(s)
    s = sub.add_parser('resume', help='снять с паузы')
    add_lang(s)
    s = sub.add_parser('watch', help='живой мониторинг')
    add_lang(s)
    s.add_argument('--interval', default=30, help='сек между опросами')
    s = sub.add_parser('logs', help='хвост логов')
    s.add_argument('--lang', default='all', help='ru|en|all')
    s.add_argument('-n', default=20, help='сколько строк')

    args = ap.parse_args(argv)
    try:
        if args.cmd is None:
            args.lang = 'all'
            return cmd_status(args)
        if args.cmd == 'status':
            return cmd_status(args)
        if args.cmd == 'start':
            return cmd_start(args)
        if args.cmd == 'stop':
            return cmd_stop(args)
        if args.cmd == 'soft-stop':
            return cmd_softstop(args)
        if args.cmd == 'pause':
            return cmd_pause(args)
        if args.cmd == 'resume':
            return cmd_resume(args)
        if args.cmd == 'watch':
            return cmd_watch(args)
        if args.cmd == 'logs':
            return cmd_logs(args)
    except ValueError as e:
        print('Ошибка: %s' % e)
        return 1
    ap.print_help()
    return 1


if __name__ == '__main__':
    sys.exit(main())
