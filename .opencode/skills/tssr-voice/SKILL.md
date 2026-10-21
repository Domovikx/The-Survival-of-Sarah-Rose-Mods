---
name: tssr-voice
description: Generate voice lines for The Survival of Sarah Rose using CosyVoice3 voice cloning. Batch generation, uid mapping, language switching, ref cleaning and loudness normalization.
---

# Skill: tssr-voice — Озвучка TSSR

Генерация озвучки TSSR (opus 24k mono; до 2026-10-14 — wav) через
Fun-CosyVoice3-0.5B (voice clone). Архитектура, решения и тулы — в `AGENTS.md`
проекта (обязательно читать).

## Ключевая идея: uid = md5(old)

`uid = md5(old-текста, UTF-8)` — полный 32-hex, язык-независимый ключ реплики.
`old` — исходный EN-текст из `translate ru strings:` (в рантайме = `_last_say_what`).

## Рантайм-раскладка

```text
ai_voice/                          # КОРЕНЬ ПРОЕКТА (рядом с game/), не внутри game/
  ru/{Arc}/{uid}__{variant}.opus    # русская озвучка, постфикс = имя рефа (СТАНДАРТ)
  en/{Arc}/{uid}__{variant}.opus    # английская озвучка (текст = old)
                                    #   wav в ai_voice НЕТ (удалены 2026-10-14,
                                    #   финальная миграция) — только opus;
                                    #   wav остаются в casts/ (рефы)
game/
  catalog/label_arc.json     # label -> Arc (грузится voice_config.rpy)
  voice_config.rpy           # config.auto_voice = static_auto_voice (callable)
```

Arc в рантайме = label-часть translation ID (`OpeningScene_92a05bc0` → `OpeningScene`)
через `label_arc.json`. Папка вне game/ работает благодаря
`config.searchpath.append("")` в voice_config.rpy.

**Поиск в игре:** приоритет `{uid}__{активный вариант}.opus` (кто говорит →
`_last_say_who.name` → `catalog/voice_list.json` → вариант = имя персонажа),
затем фолбэк glob `{uid}*.opus` → `{uid}*.wav` (первый по алфавиту; wav-файлов
в ai_voice нет — фолбэк-ветка остаётся в коде, но пуста). Сменил
`ref:` в yaml → `voice_manage.py select` (он сам перегенерит
`catalog/voice_list.json`) → в игре зазвучал новый вариант. Файлы разных
вариантов живут рядом, проигравшие просто теряют приоритет.

## Dev-структура refs (ПЛОСКАЯ, без дублей)

```text
refs/
  {Голос}.wav            # АКТИВНЫЙ реф (озвучен = этот файл существует)
  {Голос}_{variant}.wav  # варианты для A/B (Sarah_1, Sarah_3, Sigmund_2, ...)
casts//{Имя}/  # источники: *.mp3 (НЕ qwen_*.mp3)
```

ПРАВИЛА ЛЕЧЕНИЯ РЕФОВ (2026-09-01, зафиксированы):

1. «Подшипливание» источника клонируется CV3 → чистим ДО генерации:
   `highpass=f=60, afftdn=nr=15, deesser=i=0.5, highshelf=f=8000:g=-6`
2. Громкость всех рефов выровнена: EBU R128 loudnorm, **-16 LUFS, TP -1.5**
   (иначе голоса «гуляли» и генерация наследовала уровень)
3. Фейды 30мс по краям — защита от кликов
   Всё — в `tools/clean_refs.py` (loudnorm двухпроходный), вызывается автоматически
   из `add_candidate.py` одним прогоном: `mp3 → нарезка 10с → чистка → refs/{Голос}.wav`.

## Тулы

| Тул                           | Назначение                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voice_catalog.py`            | тл мода (patches/ai-voice-pack/tl/ru) + script.rpy установки → catalog/voices.jsonl + label_arc.json (только при апдейте игры; `--diff` — манифесты added/changed/dropped в tmp/voice_delta/)      |
| `voice_status.py`             | отчёт готово/нет голоса → catalog/missing_voices.md (заглушки)                                                                                                                                     |
| `add_candidate.py`            | MP3-кандидат → реф: нарезка 10с + чистка + loudnorm, одним прогоном (инкрементально; qwen_*.mp3 игнорируются)                                                                                      |
| `clean_refs.py`               | чистка рефа: highpass+afftdn+deesser+highshelf → loudnorm → фейды                                                                                                                                  |
| `voice_batch.py`              | батч-генерация в ai_voice/{lang}/{arc}/{uid}__{variant}.opus (СРАЗУ opus, wav не пишется; `--keep-wav` = старая цепочка, `--ref` перезаписывает реф из yaml)                                       |
| `catalog.gen_voice_list_json` | касты (who_codes) → catalog/voice_list.json (рантайм-мапа; зовётся select'ом/add_candidate/report)                                                                                                 |
| `levelnorm.py`                | выравнивание уровня реплик -16 LUFS / TP -1.5 (loudnorm dynamic; в генерации — внутри того же ffmpeg-прохода, что пишет opus; CLI `--dir` для wav — только рефы/легаси, в ai_voice wav больше нет) |
| `voice_preview.py`            | 3 самых длинных фразы × каждый вариант → ревью-таблица output/voice/preview_review.md                                                                                                              |
| `trim_tail_burst.py`          | паттерн-трим хвостов (импортится батчем)                                                                                                                                                           |

## Генерация

```bash
# ОБЯЗАТЕЛЬНО через venv CosyVoice
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/voice_batch.py \
  [--arc Prologue] [--char Sarah] [--uid uid1 uid2 ...] [--limit N]
  [--force] [--lang ru|en] [--dry-run] [--ref refs/{Имя}_{variant}.wav]
```

- Модель грузится 1 раз; resumable (существующие скипаются по stem
  `{uid}__{variant}`: есть .opus или .wav — включая постфикс варианта,
  поэтому разные рефы не конфликтуют; wav без opus доконвертится сам)
- Конфиг: cross_lingual + RL, flow-temp 0.8, cfg 0.7, RAS 0.8/25/0.1, seed 42, silent-trim
  (официальные параметры модели; flow-temp 1.2/cfg 0.9 давали артефакты)
- Озвучиваются только dialogue+наррация и только касты с рефом {Голос}.wav
- `--ref refs/X_2.wav` — генерация конкретным вариантом БЕЗ правки yaml
  (файлы выйдут `{uid}__X_2.wav`); yaml при этом не трогается
- Автотрим хвостов (паттерн: тишина ≥80мс → всплеск ≤500мс у конца файла)
- Авто-выравнивание уровня: каждый файл после сохранения прогоняется через
  levelnorm (loudnorm dynamic -16 LUFS/TP -1.5) — CV3 гуляет на ±2-4 dB
- Каждый wav сопровождает манифест `{wav}.txt` (uid/arc/ref/emotion/тексты/
  конфиг) — пишется ДО генерации

## Эмоции в генерации (рецепт 2026-09-02, проверено)

```bash
... voice_batch.py --char Sarah --emotion "In a burst of passion, crying out with joy and ecstasy" --emotion-tag passion --limit 10
```

ПРАВИЛА (подробно в AGENTS.md → «Эмоции в генерации»):

1. Эмоция ТОЛЬКО на английском — русские/китайские инструкции дают акцент
2. Формат — ОПИСАНИЕ СОСТОЯНИЯ, не приказ: «In a burst of passion, crying out
   with joy and ecstasy» ✓; «говори злобно» / «Speak angrily» ✗
3. Эмоция = СОСТОЯНИЕ ДИКТОРА (кто произносит), не содержание текста:
   - диалог участника: «In a burst of passion, crying out with joy and ecstasy»
   - наррация-наблюдение эротики: «Erotically and sensually»
   - оргазм/кульминация: «Crying out with joy, gasping through the spasms of orgasm»
4. Эмоция работает, когда ТЕКСТ ФРАЗЫ ей соответствует (агрессивный текст +
   злость; нейтральный текст + эмоция = вяло). В текст добавляй эмоциональную
   пунктуацию: «Тра́хай меня сильнее! Ещё! Ещё! Да-а-а!»
5. Пресеты: `--emotion angry|sad|happy|fast|slow|loud|soft|whisper`
6. Параметры семплирования — дефолты (`--top-p 0.5 --top-k 10 --tau-r 0.15
--cfg-rate 0.7 --flow-temp 0.8`) — официальные параметры модели
7. Пофразовые эмоции: `catalog/emotions.json` (разметка `emotion_tag.py`),
   приоритет: `--emotion` > emotions.json[uid] > без эмоции;
   `--no-emotion` (суффикс _plain), `--emotion-ru` (ревью)

## Ударения (проверено 2026-09-03)

Unicode-ударение **U+0301** (combining acute) после ударной гласной РАБОТАЕТ:
«Тра́хай» = `Тра\u0301хай` — модель произносит с ударением на «а».

- Заглавная буква («ТрАхай») и апостроф («Тра'хай») НЕ дают ударения
- U+0301 не ломает модель (падение в консоли cp1251 — починено
  `sys.stdout.reconfigure` в voice_batch)
- Ставить только в проблемных словах (омографы, редкие слова), не в каждом
- Пример: `--text "Тра\u0301хай меня сильнее! Ещё! Ещё! Да-а-а!"`

## Кастомный текст для демо

`voice_batch.py --text "..." [--arc Demo]` — одна фраза с произвольным
текстом (uid = md5(text), папка = --arc or Demo). Полезно для экспериментов
(склейки, длинные тексты, ударения), каталог не трогает.

## Добавление нового голоса

```bash
# 1. Положить кандидата: casts//{Имя}/*.mp3
#    ВАЖНО: qwen_*.mp3 игнорируются (это VoiceDesign — не рефы)
# 2. Собрать реф (нарезка+чистка+loudnorm, существующие скипаются):
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/add_candidate.py
# 3. Голос подключается сам: озвучен = есть реф {Имя}.wav в корне каста
#    (who-коды — who_codes в каст-yaml, заполняются из каталога)
# 4. Обновить отчёт заглушек:
python tools/voice_status.py
# 5. Сгенерировать реплики этого персонажа:
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/voice_batch.py --char "{Имя}" --limit 10
```

## Диагностика

- `voice_debug.log` (корень проекта) — каждая попытка резолва:
  `CALL tlid=... text=... lang=... pattern=... matches=... path=...`
- `output/voice/batch.log` — лог генерации
- Тишина в игре → проверить: (1) нет ли стейловых `.rpyc` рядом с `voice_config.rpy`,
  (2) matches>0 в debug-логе, (3) громкость Voice в настройках игры

## Известные проблемы

1. **Стресс в русском** — cross_lingual может ставить неверное ударение. Решение: пробовать zero_shot / instruct2.
2. **Хвостовые артефакты** — вздохи у конца фразы → `trim_tail_burst.py` (автоматически в батче).
3. **Забытый .rpyc** — Ren'Py грузит `.rpyc` даже без `.rpy`; старые кэши затирают конфиг (случай 2026-08-31: voice_test.rpyc переопределял auto_voice).
