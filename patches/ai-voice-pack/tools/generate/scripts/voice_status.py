#!/usr/bin/env python3
"""Статус и прогноз генерации озвучки TSSR.

Считает: сделано реплик (стем с .opus/.wav, RU/EN), % от плана
(voices.json: dialogue+narration), завершённые арки, размер, скорость
(замер прироста), прогноз до конца, здоровье процессов и tmp-сирот.

ЗАПУСК:
  python tools/voice_status.py                  # полный отчёт (~70с на замер)
  python tools/voice_status.py --fast           # без замера скорости (мгновенно)
  python tools/voice_status.py --arc Other      # точечно: по конкретной арке
  python tools/voice_status.py --char Sarah     # точечно: по персонажу (голосу)
  python tools/voice_status.py --detail         # подробный отчёт (арки × проценты,
                                                #   топ голосов, размер по аркам)
"""

import argparse
import glob
import os
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import catalog, paths  # noqa: E402

LANGS = ('ru', 'en')


def count_done(lang):
    """{арка: число готовых реплик} + всего.

    Готово = есть .opus ИЛИ .wav для одного stem ({uid}__{variant});
    пара wav+opus считается ОДИН раз. Корпус сейчас только opus
    (легаси-wav удалены 2026-10-14), но ветка .wav сохранена на случай
    возврата/подмешивания — тогда двойного счёта не будет.
    """
    base = os.path.join(paths.AI_VOICE_DIR, lang)
    made = defaultdict(int)
    if os.path.isdir(base):
        for arc in os.listdir(base):
            p = os.path.join(base, arc)
            if os.path.isdir(p):
                stems = set()
                for f in os.listdir(p):
                    if '.ln.tmp.' in f:
                        continue  # сироты loudnorm — не реплики
                    if f.endswith('.wav') or f.endswith('.opus'):
                        stems.add(os.path.splitext(f)[0])
                made[arc] = len(stems)
    return made, sum(made.values())


_CATALOG_CACHE = None


def _catalog_data():
    """Кэш voices.json: план/статус дергают его десятки раз (42 вызова = 8.6с)."""
    global _CATALOG_CACHE
    if _CATALOG_CACHE is None:
        try:
            _CATALOG_CACHE = catalog.load_catalog()
        except Exception:
            _CATALOG_CACHE = {}
    return _CATALOG_CACHE


def plan():
    """{арка: фраз} — озвучиваемые (dialogue+narration)."""
    plan = defaultdict(int)
    try:
        for x in _catalog_data()['entries']:
            if x['category'] in ('dialogue', 'narration'):
                plan[x['arc']] += 1
    except Exception:
        pass
    return plan


def char_plan():
    """{имя_голоса: {арка: фраз}} — план по голосам (Narrator = наррация)."""
    out = defaultdict(lambda: defaultdict(int))
    try:
        for x in _catalog_data()['entries']:
            if x['category'] not in ('dialogue', 'narration'):
                continue
            who = x['who_name'] if x['category'] == 'dialogue' else 'Narrator'
            if who:
                out[who][x['arc']] += 1
    except Exception:
        pass
    return out


def char_made():
    """{имя_голоса: число готовых реплик} по всем языкам (stem = uid__variant).

    Считается по стему, а не по файлу: пара wav+opus за один стем = один.
    """
    out = Counter()
    for lang in LANGS:
        base = os.path.join(paths.AI_VOICE_DIR, lang)
        if not os.path.isdir(base):
            continue
        for arc in os.listdir(base):
            p = os.path.join(base, arc)
            if not os.path.isdir(p):
                continue
            stems = set()
            for f in os.listdir(p):
                m = re.match(r'([0-9a-f]{32}__.+)\.(?:wav|opus)$', f)
                if m:
                    stems.add(m.group(1))  # полный стем uid__variant
            for s in stems:
                out[s.split('__', 1)[1]] += 1
    return out


def active_arcs():
    """Текущая арка каждого воркера: последняя START-метка в логе,
    для которой ещё нет DONE после неё."""
    out = {}
    for lang in LANGS:
        log = os.path.join(paths.OUTPUT_DIR, 'voice',
                           'gen_all_{}.log'.format(lang))
        arc = '?'
        if os.path.isfile(log):
            text = open(log, encoding='utf-8', errors='replace').read()
            starts = [(m.start(), m.group(1)) for m in
                      re.finditer(r'START {} (\w+)'.format(lang), text)]
            if starts:
                pos, arc = starts[-1]
                if re.search(r'DONE {} \w+'.format(lang), text[pos:]):
                    arc = '?'  # последняя START завершена, следующая не началась
        out[lang] = arc
    return out


def python_workers():
    """Число активных voice_batch-процессов (приблизительно)."""
    try:
        r = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq python.exe'],
                           capture_output=True, text=True, timeout=20)
        n = r.stdout.lower().count('python')
        return n // 2  # venv-лаунчер + реальный процесс на воркер
    except Exception:
        return -1


def arc_size(lang, arc):
    """Дископотребление арки: opus (а .wav — на случай, если вернутся)."""
    p = os.path.join(paths.AI_VOICE_DIR, lang, arc)
    if not os.path.isdir(p):
        return 0
    return sum(os.path.getsize(os.path.join(p, f))
               for f in os.listdir(p)
               if f.endswith('.wav') or f.endswith('.opus'))


def report_speed(plan_total, total):
    print('\n=== СКОРОСТЬ (замер 60с) ===')
    before = {lang: count_done(lang)[1] for lang in LANGS}
    time.sleep(60)
    after = {lang: count_done(lang)[1] for lang in LANGS}
    delta = sum(after[l] - before[l] for l in LANGS)
    per_hour = delta * 60
    left = plan_total - (total + delta)
    days = left / per_hour / 24 if per_hour else float('inf')
    print('  прирост: {} фраз/мин ≈ {} /час суммарно'.format(delta, per_hour))
    print('  осталось: {} фраз'.format(left))
    print('  ПРОГНОЗ: {:.0f} ч ≈ {:.1f} дня (без остановок)'.format(
        left / per_hour if per_hour else 0, days))


def cmd_arc(arc, fast):
    plan_total = plan().get(arc, 0)
    if not plan_total:
        print('Арка {!r} не найдена. Арки: {}'.format(
            arc, ', '.join(sorted(plan()))))
        return 1
    print('=== АРКА {} ==='.format(arc))
    for lang in LANGS:
        m, n = count_done(lang)
        c = m.get(arc, 0)
        print('  {:<2}: {:>5} / {:<6} ({:>5.2f}%) {}'.format(
            lang.upper(), c, plan_total, 100.0 * c / plan_total,
            '✓' if c >= plan_total else ''))
        if c:
            base = os.path.join(paths.AI_VOICE_DIR, lang, arc)
            stems = set()
            for f in os.listdir(base):
                mm = re.match(r'[0-9a-f]{32}__(.+)\.(?:wav|opus)$', f)
                if mm:
                    stems.add(mm.group(1))
            by_variant = Counter(stems)
            print('     по голосам:', ', '.join(
                '{} {}'.format(v, n) for v, n in by_variant.most_common(12)))
            print('     размер: {:.1f} МБ'.format(arc_size(lang, arc) / 1048576))
    if not fast:
        # прогноз на арку: сколько осталось (оба языка) при текущем темпе
        left = 2 * plan_total - sum(
            count_done(l)[0].get(arc, 0) for l in LANGS)
        print('  осталось в арке: {} фраз (RU+EN)'.format(left))
    return 0


def cmd_char(char, fast):
    cp = char_plan()
    if char not in cp:
        print('Персонаж {!r} не найден. Есть: {}'.format(
            char, ', '.join(sorted(cp)[:30])))
        return 1
    total_plan = sum(cp[char].values())
    made = char_made()
    done = made.get(char, 0)
    print('=== ПЕРСОНАЖ {} ==='.format(char))
    print('  план: {} фраз | сделано (RU+EN): {} ({:.1f}%)'.format(
        total_plan, done, 100.0 * done / (2 * total_plan) if total_plan else 0))
    print('  по аркам (план):')
    for arc in sorted(cp[char]):
        print('    {:18s} {:5d}'.format(arc, cp[char][arc]))
    if not fast:
        return 0
    return 0


def cmd_detail():
    p = plan()
    print('=== ПОДРОБНЫЙ ОТЧЁТ ===')
    print('План: {} фраз × 2 языка = {}'.format(
        sum(p.values()), sum(p.values()) * 2))
    print()
    hdr = '{:20s} | {:>8s} | {:>8s} | {:>7s} | {:>7s} | {:>10s}'.format(
        'Арка', 'RU', 'EN', 'RU%', 'EN%', 'Размер RU+EN')
    print(hdr)
    print('-' * len(hdr))
    for arc in sorted(p):
        ru, _ = count_done('ru')
        en, _ = count_done('en')
        cr, ce = ru.get(arc, 0), en.get(arc, 0)
        t = p[arc]
        size_mb = (arc_size('ru', arc) + arc_size('en', arc)) / 1048576
        print('{:20s} | {:>8d} | {:>8d} | {:>6.1f}% | {:>6.1f}% | {:>8.1f}МБ'
              .format(arc[:20], cr, ce, 100.0 * cr / t, 100.0 * ce / t,
                      size_mb))
    print()
    cm = char_made()
    print('=== ТОП ГОЛОСОВ (фразы RU+EN) ===')
    for v, n in cm.most_common(15):
        print('  {:30s} {}'.format(v, n))
    print()
    act = active_arcs()
    print('=== ВОКЕРЫ ===')
    print('  процессы voice_batch: {}'.format(python_workers()))
    for lang in LANGS:
        print('  {}: арка {}'.format(lang.upper(), act.get(lang, '?')))
    orphans = glob.glob(os.path.join(paths.AI_VOICE_DIR, '**', '*.ln.tmp.wav'),
                        recursive=True)
    print('  tmp-сирот (loudnorm): {}'.format(len(orphans)))
    return 0


def main():
    ap = argparse.ArgumentParser(description='Статус генерации озвучки TSSR')
    ap.add_argument('--fast', action='store_true',
                    help='без замера скорости')
    ap.add_argument('--arc', default=None, help='точечный статус по арке')
    ap.add_argument('--char', default=None, help='точечный статус по персонажу')
    ap.add_argument('--detail', action='store_true',
                    help='подробный отчёт: арки×%%, топ голосов, размеры')
    args = ap.parse_args()
    try:  # cp1251-консоль Windows: '×'/-ui-символы не должны ронять отчёт
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    if args.arc:
        return cmd_arc(args.arc, args.fast)
    if args.char:
        return cmd_char(args.char, args.fast)
    if args.detail:
        return cmd_detail()

    plan_total = sum(plan().values()) * 2
    made = {lang: count_done(lang) for lang in LANGS}
    total = sum(v[1] for v in made.values())

    print('=== СТАТУС ГЕНЕРАЦИИ ОЗВУЧКИ ===')
    print('План: {} фраз ({} × 2 языка)'.format(plan_total, plan_total // 2))
    for lang in LANGS:
        m, n = made[lang]
        print('  {:<2} {:>6} готово ({:>5.2f}%)'.format(
            lang.upper(), n, 100.0 * n / (plan_total // 2)))
    print('  ВСЕГО: {:>6} / {} ({:.2f}%)'.format(
        total, plan_total, 100.0 * total / plan_total))

    print('\n=== АРКИ ===')
    arcs = sorted(plan())
    for lang in LANGS:
        m, n = made[lang]
        lines = []
        for a in arcs:
            t = plan()[a]
            c = m.get(a, 0)
            mark = '✓' if t and c >= t else ''
            lines.append('{} {}/{} {}'.format(a[:14], c, t, mark))
        print('  {}: {}'.format(lang.upper(), ' | '.join(lines)))

    act = active_arcs()
    print('\n=== ВОКЕРЫ ===')
    workers = python_workers()
    print('  процессы voice_batch: {}'.format(
        workers if workers >= 0 else '? (нет tasklist)'))
    for lang in LANGS:
        print('  {}: арка {} (всего в арке {})'.format(
            lang.upper(), act.get(lang, '?'), plan().get(act.get(lang, ''), 0)))

    print('\n=== ЗДОРОВЬЕ ===')
    # один обход вместо двух recursive-glob + двух du (244k файлов на диске:
    # под профайлером glob+du+42×plan() давали ~29с, ду к тому же зависало
    # при параллельной генерации)
    orphans = parts = 0
    sizes = {'ru': 0, 'en': 0}
    for lang in LANGS:
        base = os.path.join(paths.AI_VOICE_DIR, lang)
        for _root, _dirs, files in os.walk(base):
            for f in files:
                if '.ln.tmp.' in f:
                    orphans += 1  # темпы loudnorm И конвертера (wav/opus)
                elif f.endswith('.part'):
                    parts += 1
                elif f.endswith('.wav') or f.endswith('.opus'):
                    try:
                        sizes[lang] += os.path.getsize(
                            os.path.join(_root, f))
                    except OSError:
                        pass
    print('  tmp-сирот (loudnorm/конвертер): {}'.format(orphans))
    print('  недописанных .part (обрыв конверта): {}'.format(parts))
    print('  размер: RU {:.1f} GB, EN {:.1f} GB'.format(
        sizes['ru'] / 1e9, sizes['en'] / 1e9))

    if args.fast or total == 0:
        print('\n(без замера скорости: --fast)')
        return 0
    report_speed(plan_total, total)
    return 0


if __name__ == '__main__':
    sys.exit(main())