#!/usr/bin/env python
"""Пофразовая разметка эмоций: catalog/emotions.json (uid -> emotion_en).

Быстрая ЭВРИСТИКА по тексту (RU+EN) — покрывает «заряженные» фразы
(мат, восклицания, интимные/боль/радость маркеры). Нейтральные фразы
остаются без эмоции — модель сама берёт тон из текста.

LLM-апгрейд (опционально, точнее): разметить эмоции через локальную
модель (ollama/LM Studio) вместо эвристики — см. --llm-url.

Формат: {"uid": "emotion_en", ...} — читается voice_batch'ем.
Приоритет в voice_batch: --emotion > emotions.json[uid] > без эмоции.

ЗАПУСК:
  python tools/emotion_tag.py            # эвристика -> catalog/emotions.json
  python tools/emotion_tag.py --dry-run  # только статистика
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import catalog, paths  # noqa: E402

# (regex по RU+EN тексту, emotion_en)
RULES = [
    (re.compile(r'(fuck|shit|bitch|whore|cunt|bastard|slut|scum|ид[ио]? на хуй|шлюх|убью|убить|сдохн|презр|мерз)', re.I),
     'Angrily, with contempt'),
    (re.compile(r'(!!!|!{2,}|крич|орать|замолч|хватит|прекрати|не смей|пошёл вон)', re.I),
     'Loudly, with intensity'),
    (re.compile(r'(\?{1,}|а что|почему|зачем|кто|что ты|разве)', re.I),
     'Questioningly, with curiosity'),
    (re.compile(r'(поцел|кровать|разден|тело|грудь|член|киск|любл|нежн|страст|стонать|конча|хочу тебя|прижмись)', re.I),
     'In a soft intimate whisper, with desire'),
    (re.compile(r'(больн|боюсь|страшно|не надо|пожалуйста.*не|умоля|помогите|отпусти|пощад)', re.I),
     'Fearfully, with trembling pleading'),
    (re.compile(r'(рад|счаст|ура|отлично|прекрасно|великолепно|люблю тебя|спасибо.*богам)', re.I),
     'Happily, with warmth'),
    (re.compile(r'(конечно же|ну да|как же|ещё бы|конечно.*конечно|прелесть какая)', re.I),
     'Sarcastically, with a dry smirk'),
    (re.compile(r'(шёпот|тихо|не крич|потише|шепну|на ухо)', re.I),
     'In a hushed whisper'),
    (re.compile(r'(приказ|немедленно|сейчас же|встань|на колени|слушай меня|я велю)', re.I),
     'With commanding authority'),
    (re.compile(r'(прости|извини|виноват|прошу прощения|к сожалению)', re.I),
     'Apologetically, with regret'),
    (re.compile(r'(смею|ха-ха|хе-хе|ухмыл|насмеш)', re.I),
     'With a mocking chuckle'),
]

EMOTIONS_JSON = paths.VOICES_JSON.replace('voices.json', 'emotions.json')


def tag_phrase(text_ru, text_en):
    """Эмоция по тексту (первая подходящая) или None."""
    hay = (text_ru or '') + ' ' + (text_en or '')
    for rx, emo in RULES:
        if rx.search(hay):
            return emo
    return None


LLM_PROMPT = (
    "You are a voice director. For this Russian voice line, describe the "
    "DIRECTOR's emotional state while reading it (how the narrator or "
    "speaker delivers it): an emotion/attitude instruction in English, "
    "2-6 words, like \"In a low menacing whisper\", \"Curiously observing\", "
    "\"With bored indifference\", \"Warmly, with affection\". "
    "EVERY line has a delivery state - even neutral observations have the "
    "narrator's attitude (attentively, warily, amused, flat, admiring...). "
    "NEVER reply 'none'. Reply with ONLY the short English instruction. "
    "Line: ")

DEFAULT_EMO = "Evenly, with a measured neutral tone"


def llm_ask(base_url, line, tries=3):
    """Эмоция фразы через локальную LLM (ollama /api/generate)."""
    body = json.dumps({
        "model": "phi4-mini",
        "prompt": LLM_PROMPT + line,
        "stream": False,
        "temperature": 0.3,
        "max_tokens": 25,
        "options": {"num_predict": 25},
    }).encode()
    req = urllib.request.Request(base_url + "/api/generate", body,
                                 {"Content-Type": "application/json"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            resp = (d.get('response') or '').strip().strip('.').strip()
            if resp and resp.lower() != 'none':
                return resp
            return None
        except Exception:
            if attempt < tries - 1:
                time.sleep(5 * (attempt + 1))
    return None


def main():
    ap = argparse.ArgumentParser(description='Разметка эмоций по фразам')
    ap.add_argument('--dry-run', action='store_true', help='только статистика')
    ap.add_argument('--llm-url', default=None,
                    help='URL локальной LLM (напр. http://127.0.0.1:11434) — '
                         'разметка через модель вместо эвристики')
    ap.add_argument('--tagged', action='store_true',
                    help='LLM-режим: размечать только уже помеченные фразы '
                         '(быстрее; нейтральные остаются без эмоции)')
    args = ap.parse_args()

    data = catalog.load_catalog()
    entries = data['entries']
    voiced = [e for e in entries if e['category'] in ('dialogue', 'narration')]

    out = {}
    stats = {}
    if os.path.exists(EMOTIONS_JSON):
        with open(EMOTIONS_JSON, encoding='utf-8') as f:
            out = json.load(f)

    if args.llm_url:
        base = args.llm_url.rstrip('/')
        n_tagged = 0
        t0 = time.time()
        for i, e in enumerate(voiced, 1):
            if args.tagged and e['uid'] not in out:
                continue
            if e['uid'] in out:
                del out[e['uid']]  # LLM заменяет старое значение
            emo = llm_ask(base, e.get('new') or '') or DEFAULT_EMO
            if emo:
                out[e['uid']] = emo
                stats[emo] = stats.get(emo, 0) + 1
                n_tagged += 1
            if i % 200 == 0:
                rate = i / max(time.time() - t0, 0.001)
                print('  ... {}/{} ({:.0f}/мин), размечено {}'.format(
                    i, len(voiced), rate * 60, n_tagged), flush=True)
                with open(EMOTIONS_JSON, 'w', encoding='utf-8') as f:
                    json.dump(out, f, ensure_ascii=False, indent=1)
        print('LLM-разметка завершена: новых {}'.format(n_tagged))
    else:
        n_tagged = 0
        for e in voiced:
            emo = tag_phrase(e.get('new'), e.get('old'))
            if emo:
                out[e['uid']] = emo
                stats[emo] = stats.get(emo, 0) + 1
                n_tagged += 1
        print('фраз озвучиваемых: {}'.format(len(voiced)))
        print('размечено эмоций: {} ({:.0f}%)'.format(
            n_tagged, 100 * n_tagged / max(len(voiced), 1)))
        for emo, n in sorted(stats.items(), key=lambda x: -x[1]):
            print('  {:30s} {}'.format(emo, n))

    if args.dry_run:
        return 0
    os.makedirs(os.path.dirname(EMOTIONS_JSON), exist_ok=True)
    with open(EMOTIONS_JSON, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('-> {}'.format(EMOTIONS_JSON))
    return 0


if __name__ == '__main__':
    sys.exit(main())