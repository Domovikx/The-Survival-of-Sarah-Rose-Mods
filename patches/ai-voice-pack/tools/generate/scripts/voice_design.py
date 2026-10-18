#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Генерация кандидатов-голосов по текстовому описанию (Qwen3-TTS VoiceDesign).

ЧТО ДЕЛАЕТ:
  Для каждого выбранного персонажа генерирует N реплик-кандидатов
  (Qwen3-TTS-12Hz-1.7B-VoiceDesign, инструкция = instruct_en из YAML-каста)
  и кладёт их в voice_candidates/{Имя}/generated/{NN}.mp3.
  После прогона пишет статистику в voice_candidates/voice_candidates.yaml
  (секция generation: дата, ok/skip/give_up/fail по каждому персонажу).

ИСТОЧНИК КАСТА (YAML):
  voice_candidates/{Имя}/{Имя}.yaml — контракт персонажа:
    name, gender, age, who, instruct_en (англ. описание для модели), texts.
  Файл = контракт: добавил yaml -> персонаж появился в --list и генерации.

ПРАВИЛА (важно):
  1. Реф для CosyVoice3 должен быть >= 10с. Если клип вышел короче, тул
     автоматически повторяет генерацию: сначала с инструкцией «говори
     медленно», затем с удлинённым текстом (text + следующий текст).
  2. Тексты в касте содержат явный признак пола («я пошёл/пошла»...).
  3. Постобработка: убирается ведущая тишина, mp3 24 kHz mono 96k.
  4. Тул резюмабелен: существующие NN.mp3 не пересоздаются.
     Чтобы перегенерировать — удали файл (или используй --force).

ЗАПУСК (нужен python с пакетом qwen_tts — venv pinokio-приложения Qwen3-TTS):
  C:\\pinokio\\api\\Qwen3-TTS-Pinokio.git\\app\\venv\\Scripts\\python.exe ^
      tools/voice_design.py --list
  ... tools/voice_design.py --char Carolyn --n 6
  ... tools/voice_design.py --n 3            # все голоса из каста, по 3 шт

CPU: ~1-2 мин на клип (1.7B, torch+cpu). Запускай на ночь или частями.
"""

import argparse
import os
import subprocess
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voicekit import catalog, paths, tts_env  # noqa: E402

LOG_PATH = os.path.join(paths.OUTPUT_DIR, 'voice', 'design.log')
STATS_PATH = paths.CAST_SUMMARY_YAML

from voicekit import config as _cfg

TEMPO = _cfg.get('design', 'tempo',
                 "темп речи спокойный, неторопливый, паузы короткие")
MIN_TEXT_LEN = int(_cfg.get('design', 'min_text_len', 150))
MAX_TEXT_LEN = int(_cfg.get('design', 'max_text_len', 250))
DEFAULT_TEMP = float(_cfg.get('design', 'temperature', 0.9))
DEFAULT_TOP_P = float(_cfg.get('design', 'top_p', 0.9))

FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"


def load_cast():
    """Каст из voice_candidates/*/*.yaml. {Имя: cfg} (только с texts)."""
    cast = {}
    for name in catalog.cast_names():
        cfg = catalog.load_cast(name)
        if not isinstance(cfg, dict) or not cfg.get('texts'):
            print("WARN: пропускаю {} (нет texts)".format(
                paths.char_yaml(name)))
            continue
        cfg.setdefault('instruct_en', '')
        short = [t for t in cfg['texts']
                 if len(text_item(t)[0]) < MIN_TEXT_LEN]
        if short:
            print("WARN: {} — {} фраз короче {} символов (клип <10с): {}".format(
                name, len(short), MIN_TEXT_LEN,
                ', '.join('{}с'.format(len(t)) for t in short)))
        cast[name] = cfg
    return cast


def ensure_qwen_tts():
    """Подложить каталог приложения Qwen3-TTS в sys.path, если пакет не найден."""
    try:
        import qwen_tts  # noqa: F401
        return
    except ImportError:
        pass
    p = tts_env.QWEN_APP
    if p and os.path.isdir(os.path.join(p, "qwen_tts")):
        sys.path.insert(0, p)
        return
    sys.exit("qwen_tts не найден. Укажи каталог приложения через env "
             "QWEN_TTS_APP.")


def log(msg):
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)


def load_stats():
    if not os.path.exists(STATS_PATH):
        return {}
    try:
        import yaml
        with open(STATS_PATH, encoding="utf-8") as f:
            d = yaml.safe_load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def write_stats(stats, n):
    """Обновить voice_candidates.yaml: дата прогона + результат по персонажам."""
    import datetime
    import yaml
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    doc = load_stats()
    if not doc or "generation" not in doc:
        doc = {"generation": {}}
    doc.setdefault("updated", now)
    doc["updated"] = now
    for char, per in stats.items():
        per = dict(per)
        per["last_run"] = now
        doc["generation"][char] = per
    os.makedirs(os.path.dirname(STATS_PATH), exist_ok=True)
    with open(STATS_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(doc, f, allow_unicode=True, sort_keys=False)
    log("stats -> {}".format(STATS_PATH))


def postprocess(wav_path, mp3_path):
    """Убрать ведущую тишину, mp3 24 kHz mono 96k."""
    subprocess.run([
        FFMPEG, "-y", "-i", wav_path,
        "-af", "silenceremove=start_periods=1:start_duration=0.15:start_threshold=-50dB",
        "-ac", "1", "-ar", "24000", "-b:a", "96k", mp3_path,
    ], capture_output=True)


def build_instruct(cfg, i):
    """Инструкция для кандидата i.

    Ядро (пол/возраст) — из instruct_en. Вариативность — из variations:
      - instruct_en содержит {style}  -> подставляем variations[i % n]
      - variations без {style}        -> добавляем через "; "
      - variations нет                -> как раньше (без вариаций)
    """
    base = cfg.get("instruct_en") or ""
    vars_ = cfg.get("variations") or []
    if not base:
        base = (cfg.get("base", "") + "; " +
                cfg["vars"][i % len(cfg["vars"])]).strip("; ")
    if vars_:
        style = vars_[i % len(vars_)]
        if "{style}" in base:
            base = base.replace("{style}", style)
        else:
            base = base.strip() + "; " + style
    return base


def sample_params(cfg, i):
    """Параметры семплирования — ОДНА конфигурация на всех кандидатов.

    Кандидаты отличаются только инструкцией (variations), а не случайным
    семплированием: одинаковые temp/top_p -> честное сравнение голосов.
    Дефолт 0.9/0.9 (проверен, стабилен); переопределяется в yaml полями
    `temperature` и `top_p` (числа, не диапазоны).
    """
    temp = float(cfg.get("temperature", DEFAULT_TEMP))
    top_p = float(cfg.get("top_p", DEFAULT_TOP_P))
    return temp, top_p


def text_item(item):
    """Фраза из texts: str (старый формат) или dict {text, emotion_en, emotion_ru}."""
    if isinstance(item, dict):
        return item.get("text", ""), item.get("emotion_en", ""), \
            item.get("emotion_ru", "")
    return item, "", ""


def gen_one(model, dst, char, cfg, i, n):
    """Один кандидат с автодобором длины >= 10с."""
    import soundfile as sf
    if os.path.exists(dst):
        log("skip {} (exists)".format(dst))
        return "skip"
    items = cfg["texts"]
    text, emotion_en, emotion_ru = text_item(items[i % len(items)])
    extra, _, _ = text_item(items[(i + 1) % len(items)])

    base_instruct = build_instruct(cfg, i)
    if emotion_en:
        base_instruct = base_instruct.strip() + "; " + emotion_en
    temp, top_p = sample_params(cfg, i)
    if not base_instruct:
        log("FAIL {} #{}: нет instruct_en в {}".format(char, i + 1, dst))
        return "fail"

    attempts = [
        (base_instruct + "; " + TEMPO,
         text, temp, top_p),
        (base_instruct + "; " + TEMPO +
         "; speak slowly, deliberately, stretching words", text, 0.85, top_p),
        (base_instruct + "; " + TEMPO +
         "; speak slowly, deliberately, stretching words",
         text + " " + extra, 0.85, top_p),
    ]
    for att, (instruct, t, temp, p) in enumerate(attempts):
        log("== {} #{}/{} try{} temp={:.2f} top_p={:.2f}".format(
            char, i + 1, n, att + 1, temp, p))
        try:
            t1 = time.time()
            wavs, sr = model.generate_voice_design(
                text=t, instruct=instruct, language="Russian",
                do_sample=True, temperature=temp, top_p=p,
                max_new_tokens=4096)
            gen_s = time.time() - t1
            dur = len(wavs[0]) / sr
            wav_tmp = dst.replace(".mp3", ".wav")
            sf.write(wav_tmp, wavs[0], sr)
            postprocess(wav_tmp, dst)
            os.remove(wav_tmp)
            d2 = float(subprocess.check_output(
                [FFPROBE, "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", dst]).decode().strip())
            if d2 >= 10.0:
                log("OK try{} gen {:.1f}s raw {:.1f}s -> {:.1f}s".format(
                    att + 1, gen_s, dur, d2))
                return "ok"
            log("SHORT try{} raw {:.1f}s -> {:.1f}s".format(att + 1, dur, d2))
        except Exception:
            log("FAIL {} #{} try{}:\n{}".format(char, i + 1, att + 1,
                                                traceback.format_exc()))
            return "fail"
    log("GIVE UP {} #{}/{}".format(char, i + 1, n))
    return "give_up"


def main():
    ap = argparse.ArgumentParser(description="Генерация кандидатов-голосов "
                                             "(Qwen3-TTS VoiceDesign)")
    ap.add_argument('--char', action='append', default=None,
                    help='только этот персонаж (можно несколько раз)')
    ap.add_argument('--n', type=int,
                    default=int(_cfg.get('design', 'candidates', 6)),
                    help='сколько кандидатов на голос (default из конфига)')
    ap.add_argument('--list', action='store_true', help='показать каст и выйти')
    ap.add_argument('--force', action='store_true',
                    help='перегенерировать существующие файлы кандидатов')
    args = ap.parse_args()

    cast = load_cast()
    if not cast:
        print("Каст пуст: нет voice_candidates/*/*.yaml с texts")
        return 1

    if args.list:
        for name, cfg in sorted(cast.items()):
            print("{:24} {} текстов | {}".format(
                name, len(cfg["texts"]), (cfg.get("instruct_en") or
                                          cfg.get("base") or "")[:60]))
        return 0

    if args.char:
        missing = [c for c in args.char if c not in cast]
        if missing:
            print("Нет в касте: {}".format(", ".join(missing)))
            print("Есть: " + ", ".join(sorted(cast)))
            return 1
        todo = {c: cast[c] for c in args.char}
    else:
        todo = cast

    snap = tts_env.voice_design_snapshot()
    if not snap:
        sys.exit("Нет VoiceDesign в HF-кэше: " + tts_env.VOICE_DESIGN_MODEL)
    ensure_qwen_tts()
    import torch  # noqa: F401
    from qwen_tts import Qwen3TTSModel
    log("loading model from {}".format(snap))
    model = Qwen3TTSModel.from_pretrained(snap, device_map="cpu",
                                          dtype=torch.float32)
    log("model loaded")

    total = 0
    stats = {}
    for char, cfg in todo.items():
        dst_dir = paths.char_subdir(char, 'generated')
        os.makedirs(dst_dir, exist_ok=True)
        per_char = {"n": args.n, "ok": 0, "skip": 0, "give_up": 0, "fail": 0}
        for i in range(args.n):
            dst = os.path.join(dst_dir, "{:02d}.mp3".format(i + 1))
            if args.force and os.path.exists(dst):
                os.remove(dst)
            res = gen_one(model, dst, char, cfg, i, args.n)
            per_char[res] += 1
            if res == "ok":
                total += 1
        stats[char] = per_char
    write_stats(stats, args.n)
    log("DONE total: {}".format(total))


if __name__ == "__main__":
    main()