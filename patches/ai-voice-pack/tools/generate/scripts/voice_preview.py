#!/usr/bin/env python
"""Превью-генерация: по 3 самых длинных фразы на голос (для ревью).

Для голосов с вариантами (рефы {Name}_1.wav, ...) генерит ОБА —
файлы {uid}__{Name}_1.opus и {uid}__{Name}_2.opus лежат рядом, слушай пары.
Для одиночных ({Name}.wav) — один вариант. Resumable (готово = есть .opus;
ветка .wav учтена на случай возврата легаси).

После прогона пишет output/voice/preview_review.md — таблица
«персонаж → вариант → uid → текст» для ревью.

ЗАПУСК (ОБЯЗАТЕЛЬНО через venv CosyVoice):
  C:\\tools\\cosyvoice3\\.venv\\Scripts\\python.exe tools/voice_preview.py
  ... --chars Alaric Atilla        (только выбранные)
  ... --dry-run                    (только план, без генерации)
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import catalog, paths  # noqa: E402

BATCH = os.path.join(paths.SCRIPTS_DIR, 'voice_batch.py')
OUT_MD = os.path.join(paths.OUTPUT_DIR, 'voice', 'preview_review.md')

N_LINES = 3


def _ai_voice_exists(arc, uid, variant):
    """Фраза сгенерирована? Новый формат — .opus, легаси — .wav (нет dup)."""
    stem = os.path.join(paths.ai_voice_dir('ru'), arc,
                        '{}__{}'.format(uid, variant))
    return os.path.isfile(stem + '.opus') or os.path.isfile(stem + '.wav')


def ref_variants(name):
    """[(вариант, путь_к_рефу)]: A/B-варианты {Name}_{v}.wav + активный {Name}.wav."""
    out = []
    pats = sorted(glob.glob(os.path.join(paths.char_dir(name),
                                         name + '_*.wav')))
    for p in pats:
        label = os.path.splitext(os.path.basename(p))[0]
        out.append((label, p))
    single = paths.ref_active(name)
    if os.path.isfile(single) and not out:
        out.append((name, single))
    return out


def longest_uids(who_ids, n=N_LINES, is_narrator=False):
    """n самых длинных реплик: диалог (по who) или наррация для Narrator."""
    entries = catalog.load_catalog()['entries']
    if is_narrator:
        cand = [e for e in entries if e['category'] == 'narration']
    else:
        cand = [e for e in entries
                if e.get('who') in who_ids and e['category'] == 'dialogue']
    cand.sort(key=lambda e: len(e.get('new') or ''), reverse=True)
    seen = set()
    out = []
    for e in cand:
        if e['uid'] not in seen:
            seen.add(e['uid'])
            out.append(e)
        if len(out) >= n:
            break
    return out


def run_batch(name, uids, ref_path):
    cmd = [sys.executable, BATCH, '--char', name,
           '--uid'] + uids + ['--limit', str(N_LINES),
                              '--ref', ref_path]
    print('\n=== {} | {} ({}) ==='.format(
        name, os.path.basename(ref_path), time.strftime('%H:%M:%S')))
    r = subprocess.run(cmd, cwd=paths.ROOT)
    return r.returncode


def main():
    ap = argparse.ArgumentParser(description='Превью озвучки: 3 фразы на голос')
    ap.add_argument('--chars', nargs='*', default=None, help='только эти голоса')
    ap.add_argument('--dry-run', action='store_true', help='только план')
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    voices = catalog.load_voices()
    chars = args.chars if args.chars else list(voices.keys())
    missing = [c for c in chars if c not in voices]
    if missing:
        print('нет рефа:', ', '.join(missing))
        return 1

    plan = []
    for name in chars:
        vcfg = voices[name]
        who_ids = set(vcfg.get('who', []))
        if not who_ids and name != 'Narrator':
            print('!! {}: пустой who-список — пропуск'.format(name))
            continue
        phrases = longest_uids(who_ids, is_narrator=(name == 'Narrator'))
        if not phrases:
            print('!! {}: нет фраз'.format(name))
            continue
        refs = ref_variants(name)
        if not refs:
            print('!! {}: нет рефов ({Name}.wav в корне каста)'.format(name))
            continue
        for variant, ref_path in refs:
            plan.append((name, variant, ref_path, phrases))

    print('ПЛАН: {} прогонов × {} фраз'.format(len(plan), N_LINES))
    for name, variant, _, phrases in plan:
        print('  {:18s} {:22s} {}'.format(
            name, variant, ' | '.join(p['uid'][:8] for p in phrases)))
    if args.dry_run:
        print('DRY-RUN: генерации нет.')
        return 0

    review = []
    t0 = time.time()
    for i, (name, variant, ref_path, phrases) in enumerate(plan, 1):
        uids = [p['uid'] for p in phrases]
        exist = all(
            _ai_voice_exists(p['arc'], p['uid'], variant)
            for p in phrases)
        if exist:
            print('[{}/{}] {} {} — уже есть, скип'.format(
                i, len(plan), name, variant))
            for p in phrases:
                review.append('| {} | {} | {} | `{}` | {} |'.format(
                    name, variant, p['arc'], p['uid'], p['new']))
            continue
        print('\n[{}/{}] {} (~{:d} файлов)'.format(
            i, len(plan), name, len(phrases)))
        rc = run_batch(name, uids, ref_path)
        if rc != 0:
            print('!! {} FAILED (rc={}) — прерываю'.format(name, rc))
            break
        for p in phrases:
            review.append('| {} | {} | {} | `{}` | {} |'.format(
                name, variant, p['arc'], p['uid'], p['new']))

    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    with open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write('# Превью-ревью озвучки ({})\n\n'.format(
            time.strftime('%Y-%m-%d %H:%M')))
        f.write('Слушай пары в `audio/vo_ru/{arc}/`. Формат файла: '
                '`{uid}__{variant}.opus` (новые) / `.wav` (легаси).\n\n')
        f.write('| Персонаж | Вариант | Арка | uid | Текст (ru) |\n')
        f.write('|---|---|---|---|---|\n')
        f.write('\n'.join(review))
        f.write('\n')
    print('\nревью: {}\nвсего {:.0f} мин'.format(OUT_MD, (time.time() - t0) / 60))
    return 0


if __name__ == '__main__':
    sys.exit(main())