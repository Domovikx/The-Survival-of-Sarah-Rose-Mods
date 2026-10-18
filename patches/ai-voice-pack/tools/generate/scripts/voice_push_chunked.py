#!/usr/bin/env python3
"""Чанкованный пуш текущей ветки в origin (только fast-forward).

Зачем: незапушенная история — это гигабайты сгенерированных wav, одним
`git push` не влезает (обрыв по таймауту). Скрипт снимает снапшот
незапушенных коммитов (`rev-list HEAD --not --remotes`), режет их на куски
примерно в `--chunk-mb` и пушит от старых к новым::

    git push origin <boundary_sha>:refs/heads/<branch>

Первый push создаёт ветку, все следующие — fast-forward. Отправляются ТОЛЬКО
объекты, которых нет на сервере, поэтому прерванный запуск просто продолжается
с нового снапшота (уже уехавшие чанки на нём не появятся).

Ночной режим: `--at 23:00 --until 06:00` — ждёт стартового времени, затем
крутит цикл «снапшот -> пуш чанками -> переснапшот» (voice_autocomмит тем
временем добавляет коммиты) до дедлайна, пока не упадёт до 0 незапушенного,
или пока не появится стоп-файл.

Безопасность:
  - без force-push, master и рабочее дерево не трогаются;
  - после КАЖДОГО чанка сверяем `ls-remote` с boundary-шасом;
  - при ошибке чанк делится пополам (до --min-chunk-mb) и повторяется;
  - стоп-файл output/voice/push.stop — выход после текущего чанка.

Лог: output/voice/push.log. Двойной клик: tools/voice-push-night.cmd

Примеры::

    python tools/voice_push_chunked.py --dry-run
    python tools/voice_push_chunked.py --once --chunk-mb 700
    python tools/voice_push_chunked.py --at 23:00 --until 06:00 --chunk-mb 700
"""

import argparse
import datetime
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRANCH = 'master'  # текущая ветка; --branch перекрывает
LOG_FILE = os.path.join(ROOT, 'output', 'voice', 'push.log')
STOP_FILE = os.path.join(ROOT, 'output', 'voice', 'push.stop')
MB = 1024 * 1024
CAT_FILE_CHUNK = 5000  # оидов на один вызов cat-file


def run_git(args, input_text=None, timeout=3600, env=None):
    """git + args -> (stdout, stderr). RuntimeError при неуспехе."""
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    p = subprocess.run(
        ['git'] + args, cwd=ROOT, capture_output=True, timeout=timeout,
        env=full_env,
        input=input_text.encode('utf-8') if input_text is not None else None)
    out = p.stdout.decode('utf-8', errors='replace')
    err = p.stderr.decode('utf-8', errors='replace')
    if p.returncode != 0:
        raise RuntimeError('git %s: %s' % (
            ' '.join(args[:4]), err.strip()[-800:]))
    return out, err


def log(msg):
    line = time.strftime('%Y-%m-%d %H:%M:%S ') + msg
    print(line, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


# ---------- чистые хелперы (покрыты тестами) ----------

def plan_chunks(sizes, chunk_bytes):
    """Жадная нарезка на boundary-индексы.

    sizes — накопительные байты, достижимые из каждого коммита
    (монотонная последовательность, 0-й элемент — размер первого
    незапушенного коммита). Окно чанка считается от базы (0 для первого
    чанка, иначе sizes[предыдущего boundary]): ровно столько байт и уедет
    на push, потому что прошлый чанк уже утаскал «свои» объекты.
    Коммит нельзя дробить — если он сам больше лимита, он уезжает один.
    """
    bounds = []
    base = 0
    i = 0
    n = len(sizes)
    while i < n:
        j = i
        while j + 1 < n and sizes[j + 1] - base <= chunk_bytes:
            j += 1
        bounds.append(j)
        base = sizes[j]
        i = j + 1
    return bounds


def parse_ls_remote(out):
    """Вывод ls-remote -> полный шас (или None, если ветки нет)."""
    out = (out or '').strip()
    return out.split()[0] if out else None


def parse_hhmm(value):
    """'23:00' -> (23, 0). ValueError на мусоре."""
    parts = value.split(':')
    if len(parts) != 2:
        raise ValueError('time must be HH:MM, got %r' % value)
    h, m = int(parts[0]), int(parts[1])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError('time out of range: %r' % value)
    return h, m


def next_occurrence(hhmm, after=None):
    """Ближайшее время hhmm строго ПОСЛЕ after (или сейчас), +1 день если
    оно уже прошло."""
    h, m = parse_hhmm(hhmm)
    ref = after or datetime.datetime.now()
    t = ref.replace(hour=h, minute=m, second=0, microsecond=0)
    if t <= ref:
        t += datetime.timedelta(days=1)
    return t


# ---------- git-операции ----------

def unpushed_commits():
    """Шасы незапушенных коммитов HEAD, от старых к новым."""
    out, _ = run_git(['rev-list', '--reverse', 'HEAD', '--not', '--remotes'],
                     timeout=300)
    return [l for l in out.split() if l]


def size_upto(sha):
    """Байты объектов, достижимых из sha и отсутствующих на любом remote."""
    out, _ = run_git(['rev-list', '--objects', sha, '--not', '--remotes'],
                     timeout=600)
    oids = [line.split(' ', 1)[0] for line in out.splitlines() if line.strip()]
    total = 0
    for i in range(0, len(oids), CAT_FILE_CHUNK):
        res, _ = run_git(
            ['cat-file', '--batch-check=%(objectsize)'],
            input_text='\n'.join(oids[i:i + CAT_FILE_CHUNK]) + '\n',
            timeout=600)
        for line in res.splitlines():
            if line.isdigit():
                total += int(line)
    return total


def remote_tip():
    out, _ = run_git(['ls-remote', 'origin', 'refs/heads/' + BRANCH],
                     timeout=180)
    return parse_ls_remote(out)


def push_chunk(sha, timeout=3600):
    """Пуш boundary-шаса + проверка, что ветка на сервере действительно
    доехала до него."""
    run_git(['-c', 'http.version=HTTP/1.1',
             '-c', 'http.postBuffer=524288000',
             'push', 'origin', '%s:refs/heads/%s' % (sha, BRANCH)],
            timeout=timeout,
            env={'GIT_TERMINAL_PROMPT': '0'})
    tip = remote_tip()
    if tip != sha:
        raise RuntimeError('remote tip %s != expected %s' % (tip, sha))


# ---------- цикл ----------

def stop_requested():
    return os.path.exists(STOP_FILE)


def past_deadline(deadline):
    return deadline is not None and datetime.datetime.now() >= deadline


def push_cycle(chunk_bytes, deadline, dry_run=False):
    """Один проход: снапшот -> план -> пуш чанков.

    Возвращает True, если на момент снапшота было что пушить.
    RuntimeError с первой неудачи — вызывающий дробит чанк и повторяет.
    """
    commits = unpushed_commits()
    if not commits:
        log('unpushed: 0 commits')
        return False
    sizes = [size_upto(c) for c in commits]
    bounds = plan_chunks(sizes, chunk_bytes)
    total_mb = sizes[-1] / MB
    log('unpushed: %d commits, %.2f GiB, plan: %d chunk(s) <= %d MB'
        % (len(commits), sizes[-1] / (1024.0 * 1024 * 1024),
           len(bounds), chunk_bytes // MB))
    if dry_run:
        base = 0
        for k, idx in enumerate(bounds, 1):
            log('  chunk %d/%d: %s  +%d MB (cum %d MB)'
                % (k, len(bounds), commits[idx][:9],
                   (sizes[idx] - base) // MB, sizes[idx] // MB))
            base = sizes[idx]
        return True

    base = 0
    for k, idx in enumerate(bounds, 1):
        if stop_requested():
            log('stop file found — exiting before chunk %d' % k)
            return True
        if past_deadline(deadline):
            log('deadline reached — exiting before chunk %d' % k)
            return True
        sha = commits[idx]
        chunk_mb = (sizes[idx] - base) // MB
        log('push %d/%d: %s  (%d MB, cum %d MB)'
            % (k, len(bounds), sha[:9], chunk_mb, sizes[idx] // MB))
        push_chunk(sha)
        log('  ok, remote tip = %s' % sha[:9])
        base = sizes[idx]
        time.sleep(3)
    log('cycle done (%s pushed)' % commits[-1][:9])
    return True


def wait_until(when, check_every=30):
    """Спать до when, каждые check_every сек проверяя стоп-файл.
    Возвращает False, если стоп-файл появился раньше времени."""
    while datetime.datetime.now() < when:
        if stop_requested():
            return False
        time.sleep(check_every)
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(
        description='Чанкованный пуш master в origin (fast-forward only)')
    ap.add_argument('--branch', default='master',
                    help='какую ветку пушить (по умолч. master)')
    ap.add_argument('--chunk-mb', type=int, default=700,
                    help='максимум МБ на один push (по умолч. 700)')
    ap.add_argument('--min-chunk-mb', type=int, default=50,
                    help='до чего дробим чанк при ошибках (по умолч. 50)')
    ap.add_argument('--retries', type=int, default=3,
                    help='неудач подряд до уменьшения чанка (по умолч. 3)')
    ap.add_argument('--at', metavar='HH:MM',
                    help='ждать этого времени перед стартом (напр. 23:00)')
    ap.add_argument('--until', metavar='HH:MM',
                    help='стоп после этого времени (напр. 06:00)')
    ap.add_argument('--interval', type=int, default=600,
                    help='пауза между циклами, сек (по умолч. 600)')
    ap.add_argument('--once', action='store_true',
                    help='один цикл и выход')
    ap.add_argument('--dry-run', action='store_true',
                    help='только показать нарезку, ничего не пушить')
    args = ap.parse_args(argv)
    global BRANCH
    BRANCH = args.branch

    if not os.path.isdir(os.path.join(ROOT, '.git')):
        print('not a git repository: %s' % ROOT)
        return 1

    now = datetime.datetime.now()
    if args.at:
        start = next_occurrence(args.at)
        if start > now:
            log('waiting until %s (stop file: %s)'
                % (start.strftime('%Y-%m-%d %H:%M'),
                   os.path.relpath(STOP_FILE, ROOT)))
            if not wait_until(start):
                log('stop file appeared while waiting — exiting')
                return 0
    deadline = next_occurrence(args.until, after=datetime.datetime.now()) \
        if args.until else None
    if deadline:
        log('deadline: %s' % deadline.strftime('%Y-%m-%d %H:%M'))

    chunk = args.chunk_mb * MB
    fails = 0
    exit_code = 0
    while True:
        if stop_requested():
            log('stop file found — exiting')
            break
        if past_deadline(deadline):
            log('deadline reached — exiting')
            break
        try:
            had_work = push_cycle(chunk, deadline, dry_run=args.dry_run)
            fails = 0
            if args.once or args.dry_run:
                if not had_work and not args.dry_run:
                    log('nothing left to push')
                break
            if not had_work:
                log('nothing left to push')
                break
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            fails += 1
            log('attempt %d/%d failed: %s'
                % (fails, args.retries, str(e).replace('\n', ' ')[:300]))
            if args.once or args.dry_run:
                exit_code = 1
                break
            if fails >= args.retries:
                fails = 0
                half = max(args.min_chunk_mb * MB, chunk // 2)
                if half < chunk:
                    chunk = half
                    log('reducing chunk to %d MB and retrying'
                        % (chunk // MB))
                else:
                    log('chunk already at minimum (%d MB) — will retry'
                        % (chunk // MB))
            time.sleep(60)
            continue
        time.sleep(args.interval)
    return exit_code


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\ninterrupted')
        sys.exit(130)
