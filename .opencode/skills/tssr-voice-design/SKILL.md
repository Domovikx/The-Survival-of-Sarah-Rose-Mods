---
name: tssr-voice-design
description: Генерация голосов-кандидатов для TSSR по текстовому описанию (Qwen3-TTS VoiceDesign) — промт-дизайн тембра, генерация реплик-рефов ≥10с с автодобором длины, постобработка. Используй, когда нужно создать/дополнить голос персонажа, добавить новых кандидатов в casts/ или найти голос по типажу.
---

# Skill: tssr-voice-design — Генерация голосов по промту

Генерация кандидатов-голосов для The Survival of Sarah Rose через
**Qwen3-TTS-12Hz-1.7B-VoiceDesign** (модель дизайна голоса по текстовому
описанию). Архитектура озвучки проекта — в `AGENTS.md` (читать обязательно).

## Где что лежит

```text
tools/
  voice_design.py          # тул генерации (резюмабельный), читает YAML-каст
casts/{Имя}/      # сюда падают кандидаты (+ {Имя}.yaml — каст)
  {Имя}.yaml               # ОПИСАНИЕ голоса: контракт для voice_design.py
                               #   (instruct_en — ФИЗИОГНОМИКА тела, напр. "Male, 55-70 years
                               #   old, tall and broad-shouldered..."; instruct_ru — перевод)
  generated/NN.mp3         # кандидаты: 01.mp3, 02.mp3, ... (сырьё)
  gen_selected/            # отобранные вручную (add_candidate делает рефы)
tools/generate/output/
  voice_candidates.jsonl   # СВОДНАЯ СТАТИСТИКА каста (журнал, дерииват)
casts/cast.md     # обзорный документ «кто озвучивает» (справка)
```

**Каст живёт в YAML** (`casts/{Имя}/{Имя}.yaml`), а не в python.
Добавил/поправил yaml → персонаж сразу появился в `--list` и генерации.
Старый `voice_design_cast.py` удалён при миграции (2026-09-02).

**Статистика** — `tools/generate/output/voice_candidates.jsonl`:

- `summary`: всего / с голосом / с кандидатами / без ничего
- `cast`: по каждому персонажу статус (voice_ready/candidates/need_generation)
- `generation`: результаты прогонов (дата, ok/skip/give_up/fail) — дописывает
  сам `voice_design.py`; сводка пересобирается: `python tools/voice_sync.py report`

## Запуск

**Важно:** нужен python с пакетом `qwen_tts` — это venv pinokio-приложения
Qwen3-TTS (`C:\pinokio\api\Qwen3-TTS-Pinokio.git\app\venv`). В cosyvoice-venv
пакета нет (там transformers 4.51, а qwen-tts требует 4.57+).

```bash
PY="C:\pinokio\api\Qwen3-TTS-Pinokio.git\app\venv\Scripts\python.exe"
"$PY" tools/voice_design.py --list                    # каст
"$PY" tools/voice_design.py --char Carolyn --n 6      # один персонаж, 6 шт
"$PY" tools/voice_design.py --n 3                     # весь каст по 3 шт
"$PY" tools/voice_design.py --char Narrator --n 5 --force  # перегенерить
python tools/voice_sync.py report                  # обновить сводку + отчёты
```

Модель VoiceDesign (~4.3 ГБ) должна лежать в HF-кэше
`~/.cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-1.7B-VoiceDesign`.

CPU (torch+cpu): ~1-2 мин/клип (с двумя параллельными процессами — быстрее
суммарно). Весь каст — часы: запускай частями, тул пропускает существующие
файлы (резюм).

**Параллельная генерация** (несколько процессов = несколько загрузок модели
~8 ГБ RAM каждая; Ryzen 7800X3D + 32 ГБ = 2 процесса по OMP_NUM_THREADS=8):

```bash
OMP_NUM_THREADS=8 "$PY" tools/voice_design.py \
  --char Alaric --char Atilla --char Carolyn --n 6 > /tmp/gen1.log 2>&1 &
OMP_NUM_THREADS=8 "$PY" tools/voice_design.py \
  --char Metis --char Samayra --n 6 > /tmp/gen2.log 2>&1 &
```

Внимание: `--char` принимает ОДНО имя — повторяй флаг для нескольких
персонажей. Итоги прогона (ok/skip/give_up/fail по каждому) — в
`tools/generate/output/voice_candidates.jsonl` → `generation`.

## Формат каста (casts/{Имя}/{Имя}.yaml)

Файл = контракт для `voice_design.py`. Схема:

```yaml
name: Alaric # = имя папки (обязательно)
gender: M # M/F — метаданные для человека/агента
age: "25-30" # или "ageless"; строкой (иначе 25-30 станет датой)
who: >- # роль в игре, контекст для агента
  low life из свободного города, обаятельный жулик,
  спутник/любовник Сары в MagePath
instruct_en: >- # АНГЛ. описание голоса для Qwen3-TTS VoiceDesign
  Male, 25-30 years old, medium-low velvet baritone, charming rogue,
  cynical and sarcastic, smooth delivery with slight smirk in voice
texts: # рус. фразы 100+ символов, с гендерным маркером
  - Я пошёл через весь город, только чтобы добраться до тебя...
  - ...
```

`instruct_en` писать по разделу «Бест-практисы для instruct_en» (минимум
4 измерения, физика голоса). `voice_design.py` берёт `instruct_en` как есть
(legacy `base`/`vars` больше не используются, можно удалять из yaml).

## Бест-практисы для instruct_en (Qwen3-TTS VoiceDesign)

Основано на официальной документации Qwen3-TTS (mintlify guides, Alibaba
Cloud docs feb-2026, HF Space) и практических гайдах.

### Официальные 5 принципов (Alibaba Cloud)

1. **Конкретность** — "deep / crisp / fast-paced", а не "nice / pleasant"
2. **Несколько измерений одновременно** — пол + возраст + тембр + эмоция + темп
3. **Объективность** — описывай ФИЗИКУ голоса (как звучит), не личность
   (кто персонаж). Слабо: "A wise philosopher who quotes Aristotle" →
   сильно: "A calm, measured male voice with a deep, resonant tone and slow,
   contemplative pacing"
4. **Оригинальность** — имитация знаменитостей явно блокируется моделью
5. **Лаконичность** — каждое слово по делу; 1-3 предложения, 15-80 слов
   (максимум 2048 символов)

### 7 измерений описания

| Измерение                  | Что работает                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| Gender                     | male, female, neutral                                               |
| Age                        | конкретика: "25-30 years old", "teenager", "elderly 55+"            |
| Pitch / register           | high, mid-range, low, deep bass, "tenor range"                      |
| Pace / cadence             | fast, medium, slow, "speaks slowly and deliberately"                |
| Emotion                    | cheerful, calm, gentle, serious, lively, composed, weary, sarcastic |
| Characteristics (текстура) | magnetic, crisp, hoarse, mellow, sweet, raspy, velvet, husky        |
| Use case / scenario        | news broadcast, audiobook, documentary narration, court speech      |

Порядок в промте: Identity → Pitch → Texture → Emotion → Pacing →
Detail (манеры, образность).

### Слабые vs сильные примеры

```text
Слабо:  "An old man's voice"
Сильно: "An elderly man in his 80s with a reedy, quavering voice that
         wavers with age, slow and breathless, with a warm scratchy quality"

Слабо:  "A wise philosopher who quotes Aristotle"      (личность, не звук)
Сильно: "A calm, measured male voice with a deep, resonant tone and slow,
         contemplative pacing"                        (акустика)

Слабо:  "мужской голос"                               (общее, русский)
Сильно: "Male, 30s, professional and friendly tone, clear articulation"
```

### Чего НЕ делать

- **Конфликтующие атрибуты** — "high-pitched deep bass" (модель выбирает одно,
  результат непредсказуем)
- **Абстрактные ярлыки** — "nice voice", "beautiful", "мужской голос"
- **Личность вместо звука** — "charming rogue who tells jokes" → вместо этого
  "smooth lazy delivery with a perpetual smirk in the voice"
- **Русский в instruct** — только английский (или китайский), НЕЗАВИСИМО от
  языка генерируемой речи (это два независимых поля)
- **Списки без связки** — "male, 30, deep, calm" (без глаголов) хуже, чем
  связные предложения

### Официальные примеры (Alibaba Cloud, 3 шт)

```text
1. "A young, lively female voice, with a fast pace and a noticeable upward
    inflection, suitable for introducing fashion products."
2. "A calm, middle-aged male voice, with a slow pace and a deep, magnetic
    tone, suitable for reading news or narrating documentaries."
3. "A cute child's voice, around 8 years old, speaking with a slightly
    childish tone, suitable for animation character voice-overs."
```

### Официальные примеры (mintlify guides)

```text
"Male, 25 years old, friendly and professional tone"
"Female, 70 years old, warm and grandmotherly voice with slight raspiness"
"Male, 17 years old, tenor range, gaining confidence - deeper breath
 support now, though vowels still tighten when nervous"
"Middle-aged male voice, worried and anxious tone, slightly breathless
 and speaking faster than normal"
"Female, Southern US accent, warm and hospitable tone"
"Male, professional news anchor voice, clear articulation, authoritative
 but approachable, medium paced"
```

### Готовые образцы под типажи TSSR (проверенные на прогонах)

```text
# Молодая женщина-авторитет (Сара/Кейт-рег.2)
Female, 17-19 years old, clear youthful voice, composed and intelligent,
dry humor, formal court speech with warm undertone, unhurried pace

# Тёплый нарратор (25-35, женский)
Female, 25-35 years old, warm mezzo-soprano, intimate and unhurried,
soft breath support, speaks with quiet confidence as if telling a story
by the fire

# Радушный трактирщик (Альфред)
Male, 45-60 years old, hearty baritone with warm rasp, jolly and
boisterous innkeeper, speaks loudly with enthusiasm, slightly gravelly
from years of laughter and ale

# Суровый воин (Калеб/Варга-рег.2)
Male, 30-40 years old, deep gruff baritone, military bearing, speaks
with clipped precision, tired but determined, slight edge of controlled
anger

# Молодой жулик (Аларик/Зигмунд)
Male, 25-30 years old, medium-low velvet baritone, smooth lazy delivery
with a perpetual smirk, cynical and sarcastic, stretches vowels playfully

# Древний маг (Ксан/Разафель)
Male, ageless, deep resonant bass with dry menace, measured and
deliberate, each word precisely placed, slight echo of centuries

# Старый морской капитан (Бельмонт)
Male, 40-55 years old, low raspy smoker's voice, weathered and direct,
gruff speech with rolling intonations, worn but strong

# Могучий воин-орк (Атилла)
Male, 30-40 years old, powerful mid-low booming voice, proud and warm,
deliberate weight in every word, friendly rumble

# Демон (Дэймон)
Male, deep booming bass with otherworldly resonance, slow and hypnotic,
speaks as if echoing through a vast marble temple, velvet menace

# Старый король (Орвелл)
Male, 50-60 years old, low velvet baritone, wise and stern but gentle
with his children, regal measured speech, warmth beneath authority
```

### Чек-лист перед генерацией

- [ ] instruct на английском, 1-3 предложения (15-80 слов)
- [ ] Пол + возраст + тембр + эмоция + темп (минимум 4 измерения)
- [ ] Акустика, а не личность ("velvet baritone", "slight rasp"),
      эмоция через манеру ("smirk in the voice"), а не биографию
- [ ] Нет конфликтов ("deep" и "high-pitched" одновременно)
- [ ] Нет имён реальных людей/знаменитостей
- [ ] texts с гендерным маркером, 100+ символов

## Длина текста для ≥10с аудио

Русская речь на среднем темпе: ~120-150 слов/мин = ~600-900 символов/мин =
**~100-150 символов на 10 секунд**.

- **Минимум:** 80 символов (короткая фраза, модель может не потянуть 10с)
- **Рекомендация:** 100-120 символов (оптимально для 10с)
- **Максимум:** 150+ символов (длинная фраза, может быть обрезана)

voice_design.py имеет 3 попытки:

1. Обычный instruct + текст
2. "Говори медленно" + текст
3. "Говори медленно" + текст + следующая фраза (конкатенация)

Если после 3 попыток <10с — GIVE UP в логе.

**Важно:** тексты с гендерными маркерами ("я пошёл/пошла") должны быть
достаточной длины. Короткие фразы (7-20 символов) — только для меню/ UI,
не для речевых кандидатов.

## Правила каста

1. **Явный пол в тексте** — каждая фраза первого лица с маркером рода:
   «я пошёл/пошла», «я делал/делала». Иначе TTS путает пол.
2. **instruct_en** — всегда на английском, 1-3 предложения с акустическими
   деталями (тембр, эмоция, темп). Писать по БП ниже
   («Бест-практисы для instruct_en»): минимум 4 измерения (пол, возраст,
   тембр, эмоция), физика голоса, а не личность.
3. **texts** — 100+ символов каждая; один текст = один кандидат.
4. **≥10с** — рефы CosyVoice3 режутся до 10с (`add_candidate.py` берёт
   min(10, dur)), поэтому тул сам добирает длину.
5. Постобработка: срез ведущей тишины (silenceremove), mp3 24 kHz mono 96k.

## Как добавить новый голос

1. Если персонаж в `catalog/missing_voices.md` — проверь пол/возраст по игре.
2. Создай `casts/{Имя}/{Имя}.yaml` с описанием и instruct_en
   (по чек-листу из раздела «Бест-практисы для instruct_en»).
3. Пользователь проверяет `.yaml`.
4. Сгенерируй: `"$PY" tools/voice_design.py --char "{Имя}" --n 6`.
5. Отдай пользователю слушать; он сам отберёт и переименует победителя в
   `{Имя}.mp3`.
6. Готовый голос — дальше обычный пайплайн: `add_candidate.py` → реф {Имя}.wav
   → `voice_status.py` → `voice_batch.py`.

## Папки-заглушки

`casts/{Имя}/{Имя}.yaml` — описание типажа: кто, пол, возраст,
характер, реплики, instruct_en (по чек-листу из «Бест-практисы»).
Папка без .mp3 не участвует в add_candidate.py. После генерации
кандидатов .yaml можно оставить как справку.
