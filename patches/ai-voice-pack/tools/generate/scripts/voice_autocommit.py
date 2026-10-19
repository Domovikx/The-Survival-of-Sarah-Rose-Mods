#!/usr/bin/env python3
"""Автокоммит озвучки TSSR: коммитит новые файлы audio/ пачками ~1000, без пуша.

Зачем: wav копятся тысячами, один большой коммит/пуш висит и таймаутится.
Скрипт крутится в фоне, раз в --interval смотрит untracked-файлы в audio/
и если их >= --batch — коммитит первые --batch штук ("add voices").

Безопасность:
  - трогает ТОЛЬКО untracked (??) внутри audio/, чужие изменения не коммитит;
  - свежие файлы моложе --min-age секунд пропускает (файл может ещё
    дописываться/нормализоваться loudnorm — коммитим только устоявшиеся);
  - ничего не пушит, ничего не удаляет.

Использование (системный python, только stdlib)::

    python patches/ai-voice-pack/tools/generate/scripts/voice_autocommit.py  # вечный цикл (раз в 5 мин)
    python patches/ai-voice-pack/tools/generate/scripts/voice_autocommit.py --once  # один проход и выход
    python patches/ai-voice-pack/tools/generate/scripts/voice_autocommit.py --batch 500 --interval 600 --once

Двойной клик (без админа): tools/generate/scripts/voice-autocommit.cmd
(вечный цикл в окне, закрыл окно — остановил). Остановка генерации его
не трогает.
"""

import argparse
import os
import re
import subprocess
import sys
import time

from voicekit import paths  # единственный источник путей (см. voicekit/paths.py)

# git status --porcelain печатает пути от корня репы — и status, и add/commit
# крутим оттуда же: путь от подкаталога к audio/ иначе не сходится
# (смещение путей после переезда scripts в mods-repo, проверено 2026-10-19).
REPO_ROOT = paths.REPO_ROOT
VOICE_PATHSPEC = os.path.relpath(
    paths.AUDIO_DIR, REPO_ROOT).replace(os.sep, '/') + '/'

_OCT_RE = re.compile(r'[0-7]{1,3}')


def run_git(args, input_text=None):
    """git + args -> stdout (str). Бросает RuntimeError при неуспехе."""
    p = subprocess.run(
        ['git'] + args, cwd=REPO_ROOT, capture_output=True, timeout=300,
        input=input_text.encode('utf-8') if input_text is not None else None)
    if p.returncode != 0:
        err = p.stderr.decode('utf-8', errors='replace').strip()
        raise RuntimeError('git %s: %s' % (' '.join(args[:3]), err))
    return p.stdout.decode('utf-8', errors='replace')


def _unquote(path):
    """Снять git-кавычки porcelain (C-стиль: внешняя обёртка + эскейпы).

    Нужна, т.к. porcelain квотит пути с пробелами ('Captain Belmont')
    даже при core.quotePath=false. Восьмеричные эскейпы собираются
    в байты и декодятся как UTF-8 (имена с не-ASCII)."""
    if not (len(path) >= 2 and path.startswith('"')
            and path.endswith('"')):
        return path
    inner = path[1:-1]
    buf = bytearray()
    i = 0
    while i < len(inner):
        c = inner[i]
        if c == '\\' and i + 1 < len(inner):
            n = inner[i + 1]
            if n == 'n':
                buf.append(0x0A)
                i += 2
                continue
            if n == 't':
                buf.append(0x09)
                i += 2
                continue
            if n in '"\\':
                buf.extend(n.encode('ascii'))
                i += 2
                continue
            m = _OCT_RE.match(inner, i + 1)
            if m:
                buf.append(int(m.group(0), 8))
                i += 1 + len(m.group(0))
                continue
        buf.extend(c.encode('utf-8'))
        i += 1
    return buf.decode('utf-8')


def parse_porcelain(out):
    """Строки '?? <path>' -> отсортированный список путей (без кавычек)."""
    files = []
    for line in out.splitlines():
        if line.startswith('??'):
            files.append(_unquote(line[3:].strip()))
    return sorted(files)


def untracked_voice_files():
    """Отсортированный список untracked-путей внутри audio/.

    --untracked-files=all: каждый файл отдельной строкой (иначе
    целиком новые папки схлопываются в одну запись 'dir/' и сотни
    файлов выпадают из подсчёта пачки — грабли 2026-10-01: RU SailorPath
    на 393 файла был одной строкой).
    -c core.quotePath=false: пути как есть, без C-кавычек (иначе имена
    с пробелами — 'Captain Belmont' — приходили в кавычках и не
    находились на диске при проверке settled())."""
    out = run_git(['-c', 'core.quotePath=false', 'status', '--porcelain',
                   '--untracked-files=all', '--', VOICE_PATHSPEC])
    return parse_porcelain(out)


def settled(files, min_age):
    """Только файлы старше min_age секунд (устоявшиеся на диске)."""
    now = time.time()
    ok = []
    for f in files:
        try:
            if now - os.path.getmtime(os.path.join(REPO_ROOT, f)) >= min_age:
                ok.append(f)
        except OSError:
            pass  # файл исчез между status и проверкой — пропускаем
    return ok


def commit_batch(files):
    """git add (через stdin-список) + commit. Возвращает sha."""
    # --pathspec-from-file со stdin: переживает длинные списки (лимит cmd 8КБ).
    try:
        run_git(['add', '--pathspec-from-file=-', '--'],
                input_text='\n'.join(files) + '\n')
    except RuntimeError:
        # старый git без pathspec-from-file: чанками по 100
        for i in range(0, len(files), 100):
            run_git(['add', '--'] + files[i:i + 100])
    run_git(['commit', '-m', 'add voices'])
    return run_git(['rev-parse', '--short', 'HEAD']).strip()


def pass_once(batch, min_age):
    files = settled(untracked_voice_files(), min_age)
    if len(files) < batch:
        return None
    return commit_batch(files[:batch])


def main(argv=None):
    ap = argparse.ArgumentParser(description='Автокоммит озвучки пачками')
    ap.add_argument('--batch', type=int, default=1000,
                    help='файлов в коммите (по умолч. 1000)')
    ap.add_argument('--interval', type=int, default=3600,
                    help='сек между проверками (по умолч. 3600 = 60 мин)')
    ap.add_argument('--min-age', type=int, default=180,
                    help='не трогать файлы моложе N сек (по умолч. 180)')
    ap.add_argument('--once', action='store_true', help='один проход и выход')
    args = ap.parse_args(argv)

    try:
        run_git(['rev-parse', '--show-toplevel'])
    except RuntimeError as e:
        print('Не git-репозиторий: %s' % e)
        return 1

    if args.once:
        try:
            sha = pass_once(args.batch, args.min_age)
        except RuntimeError as e:
            print('Ошибка: %s' % e)
            return 1
        if sha:
            print('Коммит %s' % sha)
        else:
            print('Недобор до пачки %d — пропуск' % args.batch)
        return 0

    print('Автокоммит: пачки по %d, проверка каждые %dс, min-age %dс. '
          'Ctrl+C — стоп.' % (args.batch, args.interval, args.min_age))
    try:
        while True:
            try:
                sha = pass_once(args.batch, args.min_age)
                if sha:
                    print('%s: коммит %s' % (
                        time.strftime('%H:%M:%S'), sha))
            except RuntimeError as e:
                print('%s: ошибка: %s' % (time.strftime('%H:%M:%S'), e))
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print('\nСтоп.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
