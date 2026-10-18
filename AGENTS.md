# The Survival of Sarah Rose — AI Voice

## Где что лежит (ЭТА репозиторий)

Это репозиторий ПАТЧЕЙ; описанные ниже пути (`ai_voice/`, `game/voice_config.rpy`,
`catalog/` и т.д.) — это РАНТАЙМ/раскладка УСТАНОВКИ (корень папки игры), НЕ дерево репы.
Соответствие «репа → установка»:

- `patches/ai-voice-pack/mod/` → `mod/` (установка)
- `patches/ai-voice-pack/tl/<lang>/` → `game/tl/<lang>/` (установка)
- `patches/ai-voice-pack/audio/vo_<lang>/` → `ai_voice/<lang>/` (установка)
- `patches/ai-voice-pack/voice_config.rpy` → `game/voice_config.rpy` (установка)
- `patches/ai-voice-pack/tools/generate/catalog/` → `catalog/` (установка: только
  label_arc.json + voice_list.json; остальное — рантайм-пайплайна)
- `patches/ai-voice-pack/tools/{extract,generate,build,deploy}/` — пайплайн (extract →
  generate → build → deploy)
- `site/` — лендинг (GitHub Pages, vite), `tasks/` — журналы задач, `docs/` — доки,
  `config/voice_presets.yaml` — пресеты кастов
- Сборка дистрибутива: `npm run build:pack` → `dist/*.zip` (раскладка zip = раскладка
  установки; zip'ы в git не коммитятся)
- Рабочая установка игры для пайплайна: Steam-папка (см. «Ребут ПК» ниже); путь зашит
  в скрипты/доки этого файла как исторический.

## Правила для AI-агента

- **НИКОГДА не коммитить без явного разрешения пользователя.**

## Архитектура озвучки

### Ключ: uid = md5(old)

`uid = md5(old-текст реплики в UTF-8)` — полный 32-hex, язык-независимый.
`old` — оригинальный английский текст (ключ из `translate ru strings:`), он же
`_last_say_what` в рантайме. Один uid = одна реплика; одинаковые тексты дедупятся
автоматически.

### Рантайм-раскладка (наш мод-контент, не пересекается с файлами игры)

```text
ai_voice/                       # КОРЕНЬ ПРОЕКТА, рядом с game/ (не внутри!)
  ru/{Arc}/{uid}__{variant}.opus # русская озвучка, постфикс = имя рефа (СТАНДАРТ)
  en/{Arc}/{uid}__{variant}.opus # английская озвучка, постфикс = имя рефа (СТАНДАРТ)
                                #   wav в ai_voice НЕТ (удалены 2026-10-14,
                                #   финальная миграция; wav живут только в
                                #   voice_candidates — рефы)
game/
  catalog/
    label_arc.json              # label -> Arc (рантайм-мапа, грузится конфигом)
    voice_list.json             # голоса: имя -> variant (генерится из кастов)
  voice_config.rpy              # config.auto_voice = static_auto_voice
```

**Поиск в игре:** `voice_config.rpy` читает `catalog/voice_list.json`
(генерится из кастов: озвучен = есть реф `{Name}.wav`; variant = имя
персонажа). Кто говорит → `_last_say_who.name` → variant из voice_list.json,
затем фолбэк glob `{uid}*.opus`, `{uid}*.wav` (первый совпавший по алфавиту).
**Формат: opus приоритетен, wav — фолбэк в КОДЕ рантайма** (2026-10-13,
проверено в игре 7.4.11), однако wav-файлов в `ai_voice/` больше НЕТ —
2026-10-14 генерация сразу в opus (voice_batch.py, pipe loudnorm+libopus,
wav не пишется; `--keep-wav` = старая цепочка), легаси-wav удалены с диска
(финальная миграция). `convert_all_opus.py` — deprecated, конвертировать
нечего.

`ai_voice/` лежит ВНЕ game/, поэтому voice_config.rpy добавляет корень
проекта в `config.searchpath` — без этого Ren'Py ищет файлы только в game/.

`Arc` в рантайме берётся из label-части translation ID
(`OpeningScene_92a05bc0` → `OpeningScene`) через `catalog/label_arc.json`.
Неизвестный label → папка `_unknown`. Язык: `preferences.language or "en"`.

### Dev-сторона

```text
catalog/
  voices.json                  # 68 254 записей: uid, old, new, who, arc, scene, category
  label_arc.json               # label -> Arc (рантайм-мапа для voice_config.rpy)
  missing_voices.md            # ЗАГЛУШКИ: кто без голоса (генерится voice_sync.py report)
  voice_sync_report.md         # расхождения слоёв: NEW/BROKEN/ORPHAN
  voice_list.json              # РАНТАЙМ-мапа (имя -> variant, who -> имя);
                               #   генерится из кастов, читается voice_config.rpy
                               #   voices.yaml НЕ существует: озвучен = есть реф
                               #   {Имя}.wav; who-коды — в каст-yaml (who_codes)
config/
  voice_presets.yaml           # ЕДИНАЯ карта конфигов: audio/refs/design/batch/beastify
                               #   (читается через tools/voicekit/config.py; в коде только
                               #   фолбэк-дефолты)
voice_candidates/
  {Имя}/
    {Имя}.yaml                 # КОНТРАКТ (+ отчёт-поля скриптов, extra allowed;
                               #   instruct_en — типаж для генерации, instruct_ru — его
                               #   русский перевод для быстрого ревью)
    generated/                 # СЫРЬЁ: voice_design.py пишет сюда 01.mp3..NN.mp3
    gen_selected/              # ОТБОР: вручную лучшие клипы, ОДИН файл
                               #   (любое имя mp3) -> станет {Имя}.wav;
                               #   несколько файлов: 1-й -> {Имя}.wav,
                               #   остальные -> {Имя}_2.wav, {Имя}_3.wav...
    {Имя}.wav                 # АКТИВНЫЙ реф в корне каста (озвучен = есть реф);
                               #   варианты A/B рядом: {Имя}_{v}.wav
tools/
  voicekit/                    # ЯДРО: paths (раскладка), catalog, contract (pydantic),
                               #   fs (безопасные операции), tts_env (пути моделей)
  voice_sync.py                # АКТУАЛИЗАТОР: status/update/migrate/report
                               #   (создаёт структуру новым, чинит пути, отчёты)
  voice_catalog.py             # tl/ru + script.rpy -> voices.json + label_arc.json
  voice_design.py              # VoiceDesign-генерация кандидатов -> generated/
  add_candidate.py             # gen_selected/*.mp3 -> корень каста: {Имя}[_{v}].wav
                               #   (нарезка + чистка одномерным прогоном)
  clean_refs.py                # лечение рефов: highpass+денойз+deesser+EQ+LOUDNORM+фейды
  beastify.py                  # нелюдские голоса: пресеты orc/demon/monster
                               #   (pitch+formant вниз, тёмный EQ, acrusher, гроул-субтон,
                               #   модуляция/реверб) + loudnorm -16 LUFS/TP -1.5
  voice_batch.py               # батч-генерация: каталог -> ai_voice/{lang}/{arc}/{uid}__{variant}.opus
                               #   (СРАЗУ opus: тензор -> pipe f32le -> ffmpeg loudnorm+libopus
                               #   за один проход, wav НЕ пишется; --keep-wav = старая цепочка
                               #   wav->levelnorm->opus; при сбое pipe — wav-фолбэк;
                               #   реф = voice_candidates/{Имя}/{Имя}.wav по
                               #   правилу; --ref перезаписывает;
                               #    --emotion — стилевая инструкция в промпт, суффикс _em;
                               #    write_manifest() определён, но НЕ вызывается —
                               #    манифесты {wav}.txt фактически не пишутся)
  trim_tail_burst.py           # паттерн-трим хвостовых артефактов (импортится батчем)
  voice_manage.py              # list/status/select (select: {Имя}_{v}.wav -> {Имя}.wav +
                               #   voice_list.json)
  levelnorm.py                 # выравнивание: -16 LUFS / TP -1.5 (CLI по *.wav —
                               #   только рефы/легаси; в генерации его LOUD_ARGS
                               #   применяются внутри опус-прохода voice_batch)
  voice_preview.py             # 3 самых длинных фразы × каждый реф -> ревью-таблица
  emotion_tag.py               # разметка эмоций: catalog/emotions.json
                               #   (эвристика по тексту или --llm-url локальная LLM)
  voice_status.py              # СТАТУС И ПРОГНОЗ генерации: готово (стем opus/wav)
                               #   по языкам/аркам, %, размер, воркеры, скорость,
                               #   прогноз (--fast без замера). ВСЕГДА для «статус?»
  voice_queue.sh               # ОЧЕРЕДЬ генерации: bash tools/voice_queue.sh {ru|en}
                               #   (все арки, resumable, НИЗКИЙ приоритет
                               #   BelowNormal + OMP_NUM_THREADS=6 — не мешает
                               #   интерактиву; лог output/voice/gen_all_{lang}.log)
                               #   СТАРТ ТОЛЬКО ЧЕРЕЗ ПУЛЬТ (voice_ctl/voice-start.cmd),
                               #   голый запуск запрещён (теряется приоритет/детач)
  voice_ctl.py                 # ПУЛЬТ очередями (Windows, только stdlib, системный python):
                               #   status/start/stop/pause/resume/watch/logs [ru|en|all]
                               #   (процессы ищет по cmdline voice_batch.py/voice_queue.sh;
                               #   пауза = NtSuspendProcess, метка — output/voice/ctl_paused_{lang}.json)
                               #   Двойной клик: voice-start/stop/pause/resume/status/watch.cmd
  convert_all_opus.py          # УСТАРЕЛ (с 2026-10-14: wav в ai_voice удалены,
                               #   конвертировать нечего; код оставлен для
                               #   рефов/истории) — ПОЛНАЯ КОНВЕРТАЦИЯ wav -> opus
                               #   24k (резумабельная, маркеры pause/stop,
                               #   атомарная .part-запись)
  convert_opus_ctl.py          # УСТАРЕЛ (см. convert_all_opus) — ПУЛЬТ конвертером:
                               #   start/pause/resume/stop/status
                               #   Двойной клик: convert-opus-start/pause/resume/stop/status.cmd
                               #   Ночная цепочка: convert-opus-night.cmd (TSSR-ConvertOpus 23:00:
                               #   докрутка -> voice_ctl start all; на пустом wav выходит 0)
```

### Ребут ПК: порядок запуска (двойной клик, без админа)

1. `tools/start-ollama-vulkan.cmd` — Vulkan-сервер LLM (если нужен)
2. `tools/voice-start.cmd` — обе очереди озвучки (resumable, низкий приоритет)

Контроль: `tools/voice-status.cmd` (сводка), `tools/voice-watch.cmd` (живой
мониторинг), пауза — `tools/voice-pause.cmd` (снять — `voice-resume.cmd`),
остановка — `tools/voice-stop.cmd`. Агентам: статус смотреть пультом
(`python tools/voice_ctl.py status`), не ручным подсчётом файлов.

## Инкапсуляция тулов (для агентов — ОБЯЗАТЕЛЬНО)

НЕ импортировать и НЕ вызывать код извне нашего репозитория
(W40K-тулзы `cosyvoice3_demo.py` и пр. в `tts_env.W40K_TOOLS`, чужие
скрипты, site-packages). Внешний код — только чтение референсов/моделей.
Если нужна функция из внешнего тула — КОПИРУЙ её в `tools/voicekit/`
(адаптируя под нашу раскладку) и используй СВОЮ. Пример: `make_tuned_model_dir`
и `link_tree` раньше брались из W40K `cosyvoice3_demo.py` — теперь это
наш `tools/voicekit/model_dir.py` (атомарная запись yaml + автохилка,
2026-09-16, причина: неатомарный `open('w')` во внешнем коде обнулил
`cosyvoice3.yaml` при kill и навсегда ломал загрузку модели). Следовать
этому правилу всегда: наш код = единственный источник правды, внешний —
не трогаем (править чужие файлы запрещено).

ВАЖНО: рабочие рефы ВСЕГДА из корня каста `voice_candidates/{Имя}/{Имя}.wav`
(вылеченные).
Правила лечения (решение 2026-09-01, актуализировано):

1. «Подшипливание» источника клонируется CV3 — рефы чистятся ДО генерации:
   `highpass=f=60, afftdn=nr=15, deesser=i=0.5, highshelf=f=8000:g=-6`
2. Громкость всех рефов выровнена EBU R128 loudnorm: -16 LUFS, TP -1.5
3. Фейды 30мс по краям — защита от кликов
   Всё — в tools/clean_refs.py, применяется автоматически add_candidate.py
   (одним прогоном: mp3 -> ПЕРВЫЕ 10с -> чистка -> loudnorm -16/TP -1.5 ->
   корень каста: {Имя}.wav). Единый уровень громкости для ВСЕХ рефов.

Категории (voices.json): dialogue 22 326, narration 44 941, menu 491, ui 496.
Озвучиваются только dialogue + narration, и только касты с активным рефом
{Имя}.wav (остальные — пропуск, видны в missing_voices.md).

## Актуализация (voice_sync)

```bash
python tools/voice_sync.py status    # сводка слоёв + расхождения (console)
python tools/voice_sync.py update --apply   # структура+заглушки новым, сводка
python tools/voice_sync.py report   # missing_voices.md + voice_sync_report.md
python tools/voice_sync.py migrate  # переезд refs/ -> папки (одноразовый, сделан)
```

Безопасность: ничего не удаляет и не перетирает; `--apply` = реальные изменения,
по умолчанию — только план.

## Пересборка каталога

```bash
python tools/voice_catalog.py    # ТОЛЬКО при апдейте игры (тексты поменялись)
python tools/voice_sync.py report  # обновить отчёты (заглушки + расхождения)
```

## Добавление нового голоса (инкрементально, ничего не пересобирается)

```bash
# 1. Положить отобранный клип: voice_candidates/{Имя}/gen_selected/{Имя}.mp3
# 2. Собрать рабочий реф (существующие скипаются):
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/add_candidate.py --only "{Имя}"
#    -> корень каста {Имя}.wav; голос ПОДКЛЮЧАЕТСЯ сам (озвучен = есть реф)
# 3. (who-коды в каст-yaml: who_codes — заполняются из каталога, руками
#    обычно не трогаются)
# 4. Зафиксировать финальный реф (копия {Имя}.wav в корне — он и есть активный):
python tools/voice_manage.py select {Имя} ""    # вариант без номера = базовый
#    (или просто переименуй {Имя}_{v}.wav -> {Имя}.wav)
# 5. Обновить отчёты:
python tools/voice_sync.py report
# 6. Сгенерировать реплики только этого персонажа (только отсутствующие файлы):
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/voice_batch.py \
  --char "{Имя}" --limit 10
```

## Генерация кандидатов по промту (VoiceDesign)

Голоса-кандидаты можно не искать, а ГЕНЕРИРОВАТЬ: Qwen3-TTS-12Hz-1.7B-VoiceDesign
создаёт речь по текстовому описанию тембра (пол/возраст/характер).

```bash
PY="C:\pinokio\api\Qwen3-TTS-Pinokio.git\app\venv\Scripts\python.exe"
"$PY" tools/voice_design.py --list                # каст
"$PY" tools/voice_design.py --char Carolyn --n 6  # 6 кандидатов -> generated/01..06.mp3
python tools/voice_sync.py report                 # сводка -> voice_candidates.yaml
```

Правила: каст в `voice_candidates/{Имя}/{Имя}.yaml` (instruct_en — ФИЗИОГНОМИКА + СОЦИАЛЬНАЯ РОЛЬ для генерации:
пол, возраст с «лет», кто это (вор/генерал/король/трактирщик...),
телосложение/лицо/осанка/поступь — БЕЗ описания голоса (типаж
вырисовывается из тела), instruct_ru — русский перевод для ревью,
texts — рус. фразы с ЯВНЫМ признаком пола; файл = контракт);
**texts: каждая фраза 150–250 символов (≈10–20с речи)** — короче даёт клип
<10с (не годится в реф), длиннее — риск дрейфа голоса внутри клипа
(voice_design.py печатает WARN для коротких); клип должен быть ≥10с — тул сам добирает длину (slow-инструкция →
+вторая фраза); резюмабелен (существующие файлы пропускает). Итоги прогона и
сводка каста — в `voice_candidates/voice_candidates.yaml`
(summary/cast/generation; --char принимает ОДНО имя — повторяй флаг; параллельно
можно гнать 2 процесса по OMP_NUM_THREADS=8, ~8 ГБ RAM на процесс).
Подробнее: .opencode/skills/tssr-voice-design/SKILL.md.
Заглушки без texts (созданы voice_sync update) видны в --list с WARN — заполни
контракт перед генерацией.

## Тримминг хвостов (паттерн)

`trim_tail_burst.py`: тишина ≥80мс → короткий звук ≤500мс, упирающийся в конец
файла = артефакт → режем. Запуск: `--dry-run` (отчёт), `--in-place` (применение),
`--dir` (батч).

## A/B-тестирование голосов

### Цикл: сравнение → выбор → генерация

```text
1. Кандидаты: voice_design.py → voice_candidates/{Name}/generated/*.mp3
2. Отбор: слушаешь generated/, копируешь лучшие вручную в gen_selected/
   ({Name}.mp3 — один топ-файл; A/B — {Name}_1.mp3, {Name}_2.mp3)
3. Рабочие рефы: add_candidate.py → корень каста: {Name}[_{variant}].wav
4. Генерация ПО КАЖДОМУ варианту (файлы лежат рядом, постфикс = реф):
   voice_batch.py --char Sarah --ref voice_candidates/Sarah/Sarah_1.wav --limit 5
   voice_batch.py --char Sarah --ref voice_candidates/Sarah/Sarah_3.wav --limit 5
   → ai_voice/ru/{arc}/{uid}__Sarah_1.opus и {uid}__Sarah_3.opus
5. Выбор: слушаешь пары в ai_voice/ru/{arc}/ (одинаковые uid рядом)
6. Фиксация: voice_manage.py select {Name} {variant}
   → копирует {Name}_{variant}.wav → {Name}.wav (в корне каста)
   → обновляет catalog/voice_list.json
   → перегенерирует catalog/voice_list.json
7. Генерация: voice_batch.py --char {Name} — использует активный реф
   (проигравшие варианты сохраняются рядом — {Name}_{v}.wav, для истории)
```

### Переключение варианта в рантайме (yaml рулит звучанием)

Кто говорит, игра знает (`_last_say_who.name`). Приоритет резолва:
`{uid}__{имя}.wav` → любой `{uid}*.wav`. Поэтому сделал
`voice_manage.py select {Имя} {вариант}` (копирует {Имя}_{v}.wav → {Имя}.wav
и перегенерит voice_list.json) → в игре зазвучал новый вариант, старые
файлы удалять НЕ обязательно
(они просто перестают выигрывать приоритет).

### Инструменты

```bash
# Добавление кандидата → реф
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/add_candidate.py --only {Name}

# A/B-сравнение: генерация каждым вариантом
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/voice_batch.py \
  --char Sarah --ref voice_candidates/Sarah/Sarah_1.wav --limit 5
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/voice_batch.py \
  --char Sarah --ref voice_candidates/Sarah/Sarah_3.wav --limit 5

# Управление голосами
python tools/voice_manage.py list      # все голоса, активный реф, варианты
python tools/voice_manage.py status    # кто озвучен
python tools/voice_manage.py select Sarah 3  # выбрать вариант → Sarah.wav (корень)

# Генерация (только отсутствующие файлы)
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/voice_batch.py \
  --char Sarah --limit 10

# Перегенерация (все файлы, --force)
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/voice_batch.py \
  --char Sarah --limit 5 --force
```

### Структура рефов

```text
voice_candidates/{Name}/
  {Name}_{variant}.wav               # A/B-варианты (сохраняются для истории)
  {Name}.wav                        # АКТИВНЫЙ реф (озвучен = этот файл существует)
```

Альтернативный реф без правки yaml: `voice_batch.py --ref`
`voice_candidates/{Name}/{Name}_{variant}.wav`
(постфикс файла генерации = имя рефа: `{uid}__{variant}.wav`).

### Эмоции в генерации (рецепт, проверено 2026-09-02)

`voice_batch.py --emotion "..." --emotion-tag <тег>` — instruct2-режим
(эмоция + клонированный голос). ПРАВИЛА:

1. **Писать ТОЛЬКО на английском** — русские и китайские инструкции дают
   акцент (проверено).
2. **Формат — описание состояния, а не приказ**: «In a burst of passion,
   crying out with joy and ecstasy» работает идеально; «говори злобно»
   / «Speak angrily» — хуже.
3. **Эмоция работает, когда текст ей соответствует**: агрессивный текст
   - агрессивная эмоция = результат; нейтральный текст + эмоция = вяло
     (модель берёт тон из текста, инструкция вторична).
4. Пресеты: `--emotion angry|sad|happy|fast|slow|loud|soft|whisper` —
   англ. описания состояний (китайские шаблоны убраны).
5. Конфиг генерации — ОФИЦИАЛЬНЫЕ параметры модели (FunAudioLLM):
   `--flow-temp 0.8 --cfg-rate 0.7 --top-p 0.8 --top-k 25 --tau-r 0.1`
   (flow-temp 1.2/cfg 0.9 давали звуковые артефакты — заменено 2026-09-03).
6. Пофразовые эмоции: `catalog/emotions.json` (uid -> emotion_en),
   разметка `tools/emotion_tag.py` (эвристика или --llm-url phi4-mini);
   приоритет: `--emotion` (CLI) > emotions.json[uid] > без эмоции.
   `--no-emotion` отключает пофразовую (суффикс_plain);
   `--emotion-ru` — русский перевод для манифеста/ревью.
7. Манифест {wav}.txt фиксирует ref/emotion/конфиг — всегда рядом с wav.
8. Эмоция = состояние ДИКТОРА (кто произносит), не содержание текста:
   диалог участника — «In a burst of passion, crying out with joy and ecstasy»;
   наррация-наблюдение — «Erotically and sensually»; кульминация —
   «Crying out with joy, gasping through the spasms of orgasm».
   В текст добавляй эмоциональную пунктуацию («Ещё! Ещё! Да-а-а!»).

ВЫВОД (2026-09-03): конфиг + эмоция решают всё — официальные параметры
модели (batch в voice_presets.yaml) + пофразовая эмоция из emotions.json
дают чистую генерацию без артефактов. Эмоция автоматически берётся из
catalog/emotions.json при генерации каждой фразы.

ВАЖНО (2026-09-04): эмоция есть у КАЖДОЙ фразы — состояния «без эмоции»
НЕ бывает. Даже наррация-наблюдение («Он хлопнул себя по бёдрам») несёт
отношение диктора: «Curiously observing», «Warily, watching closely»,
«Amused» и т.п. Промпт разметки (LLM_PROMPT в emotion_tag.py) требует
всегда возвращать инструкцию диктора; `none` запрещён; пустой ответ →
DEFAULT_EMO. emotions.json покрывает 100% фраз (67 254).

```bash
... voice_batch.py --char Sarah --emotion "In a burst of passion, crying out with joy and ecstasy" --emotion-tag passion --limit 10
```

## Вариативность vs стабильность (проверено 2026-09-03)

Требование: один голос = один стиль. ВНУТРИ клипа голос не должен
«прыгать» (в начале ≠ в конце).

- Генерация кандидатов (voice_design): ОДНА конфигурация семплирования
  на всех — `temperature 0.9`, `top_p 0.9` (честное сравнение голосов;
  в yaml можно переопределить числами `temperature:` / `top_p:`).
- Кандидаты отличаются ТОЛЬКО инструкцией: `variations` (через `{style}`
  или «; ») — разные манеры, один тембр-ядро.
- Риск дрейфа голоса ВНУТРИ клипа создают:
  - длина текста > 20-30с (архитектурный дрейф CV3) — реплики игры 5-15с
    безопасны;
  - слишком высокие температура (>1.1) и top_p (1.0);
  - flow-temp (voice_batch) — выше 1.0 тембр «гуляет» на длинных фразах.
- RAS (штраф повторов) держим — он создан для стабильности LLM.

## Ударения (проверено 2026-09-03)

Unicode-ударение **U+0301** после ударной гласной РАБОТАЕТ:
«Тра́хай» = `Тра\u0301хай`. Заглавные буквы и апостроф ударения НЕ дают.
Ставить только в проблемных словах (омографы/редкие), не в каждом.
`--text "..."` — произвольный текст для демо (uid = md5(text), arc = --arc or Demo).

### Тесты

```bash
python -m pytest tests/ -v  # 37 тестов: voicekit, voice_sync, manage, batch, pipeline
```

## Локальные LLM (проверено 2026-09-04)

Железо: Ryzen 7 7800X3D, 32 ГБ RAM, AMD RX 6600 XT 8 ГБ (Vulkan), Windows 11.

### Драйвер AMD — ОБЯЗАТЕЛЬНО свежий

Vulkan-инференс упирается в драйвер: со старым Adrenalin (2024) ollama пишет
«AMD driver is too old» и скорость падает до 2.6 tok/s (медленнее CPU!).
Обновлено до **Adrenalin 26.8.1** (авг 2026) → **39 tok/s, 100% GPU**.
Минимальный установщик (818 МБ), права админа нужны (UAC).
Ссылки: https://www.amd.com/en/support/downloads/drivers.html/graphics/radeon-rx/radeon-rx-6000-series/amd-radeon-rx-6600-xt.html
(прямая: drivers.amd.com/drivers/installer/26.10/whql/amd-software-adrenalin-edition-26.8.1-minimalsetup-260818_web.exe)

### Запуск Vulkan-сервера (НЕ системный CPU-сервер!)

ВНИМАНИЕ: Ollama app в трее держит СВОЙ сервер на 0.0.0.0:11434 (CPU).
Если запрос идёт через `localhost`, IPv6-резолв (`::1`) может попасть на
CPU-сервер (5.5 tok/s вместо 39!). ВСЕГДА используй `127.0.0.1:11434`.

```bash
export OLLAMA_VULKAN=1
OLLAMA_VULKAN=1 nohup ollama serve > output/voice/ollama_vk.log 2>&1 &
# проверка: ollama ps → PROCESSOR 100% GPU; лог: "inference compute ... RX 6600 XT"
```

ПРОСТОЙ СПОСОБ НЕ ЗАБЫТЬ: `tools/start-ollama-vulkan.cmd` — двойной клик
после каждого ребута ПК (без админа), сам запускает Vulkan-сервер
и показывает `ollama ps`. Автозагрузка (если хочется совсем без рук):
`Win+R → shell:startup` → ярлык на этот .cmd.

### Модели (ollama, уже скачаны) и скорости

| Модель               | Q4     | Скорость (Vulkan 26.8.1) | Назначение                          |
| -------------------- | ------ | ------------------------ | ----------------------------------- |
| `qwen3.5:9b`         | 5.5 ГБ | **39 tok/s, 100% GPU**   | ОСНОВНАЯ: чат, разметка эмоций, всё |
| `qwen3.6:27b-q4_K_M` | 17 ГБ  | 3.5 tok/s (67% CPU)      | только ночные/оффлайн задачи        |
| `qwen2.5:14b`        | 9 ГБ   | ~10 tok/s                | запасная                            |
| `qwen2.5-coder:7b`   | 4.7 ГБ | ~35 tok/s                | код                                 |

Qwen 3.5 9B: Apache 2.0, 262K контекст, мультимодальная, 119 языков (русский
отличный), thinking-режим (для скорости в API: `"think": false`).
LM Studio (headless `lms server start --port 1234`) НЕ рекомендуется —
тормозит (~2 tok/s) и зависает; оставлен GUI для ручных тестов.

### Подключение к opencode

`~/.config/opencode/opencode.json` — провайдер `ollama-local`
(openai-compatible, baseURL **http://127.0.0.1:11434/v1** — именно 127.0.0.1,
не localhost!). Модели: qwen3.5-9b, qwen3.6-27b, qwen2.5-coder-7b, qwen2.5-14b.
Выбор в TUI: `/models` (или Shift+Tab) → Ollama Local → qwen3.5-9b.

ВАЖНО (грабли 2026-09-04): если провайдера НЕТ в списке моделей — проверь
`~/.config/opencode/opencode.jsonc` (грузится поверх opencode.json и
ПЕРЕКРЫВАЕТ его): там может быть `disabled_providers: ["ollama-local", ...]`
и мусорные провайдеры с битым baseURL — удали их. Правка конфига требует
ПЕРЕЗАПУСКА opencode (конфиг читается один раз при старте).

Ярлык на рабочий стол «Ollama Vulkan Start» → `tools/start-ollama-vulkan.cmd`
(создан 2026-09-04; если пропал — пересоздать через PowerShell:
`WScript.Shell.CreateShortcut($env:USERPROFILE\Desktop\...)`).

### GPU для CosyVoice (DirectML) — НЕ ВЫШЛО (2026-09-04)

Пробовали ускорить генерацию аудио на RX 6600 XT через torch-directml:
`pip install torch-directml` (0.2.5.dev240914, старый PyPI-релиз) + torch 2.4.1.
РЕЗУЛЬТАТ: модель грузится на GPU, но:

- **OOM**: «Could not allocate tensor with 61MB» в середине генерации, даже при
  свободной VRAM (directml не умеет читать память RDNA2: gpu_memory=[0,0,0,0]);
- CPU-fallback для части операций (`aten::mish.out` → CPU, первый токен 40 с);
- 3D `torch.concat` с пустым тензором `[1,0,dim]` падает (баг бэкенда).
  ВЫВОД: DirectML-путь не даёт ускорения, остаёмся на CPU (~30 с на фразу,
  rtf ~8). GPU-инференс CosyVoice на AMD возможен только через WSL2+ROCm
  (6600 XT неофициально, gfx1032 + HSA_OVERRIDE_GFX_VERSION) — отдельный
  проект, не делали. NVIDIA CUDA — единственный простой GPU-путь.
  Откат выполнен: `pip install torch==2.3.1 torchaudio==2.3.1
--index-url https://download.pytorch.org/whl/cpu` (torch-directml, torchvision
  удалены).

В коде CosyVoice остались БЕЗВРЕДНЫЕ патчи с env-гейтом `TSSR_DML=1`
(активны ТОЛЬКО при `--device dml` в voice_batch.py):

- model.py/frontend.py: device=dml + map_location='cpu' при TSSR_DML;
- llm.py: one-hot вместо weight[idx]; concat без пустых тензоров;
- inference_mode-декораторы → identity при TSSR_DML (11 шт);
- cosyvoice.py: fp16 разрешён при TSSR_DML.
  CPU-режим (по умолчанию) — не затронут. `voice_batch.py --device dml`
  существует, но НЕ РАБОТАЕТ до конца (OOM) — не использовать.

## План работ

1. ~~Пилот: Prologue~~ ✓ → все основные пути ✓ → все 19 арок ✓ → EN-озвучка ✓
2. **ИТОГ 2026-10-18: озвучка 100% — 134 534 / 134 534** (RU + EN, все арки;
   очереди завершены штатно, воркеров нет).
3. Осталось: ушная выборка качества (несколько случайных реплик на язык по
   аркам) и финальный релиз/анонс.

## Открытые вопросы

- ~~EN-рефы голосов~~ → **СНЯТО 2026-10-18**: EN-озвучка 100% готова (те же
  рефы voice_candidates)
- ~~Формат аудио: WAV vs OGG~~ → **РЕШЕНО 2026-10-13: Opus 24k mono** (вердикт ресёрча,
  проверено в игре; см. tasks/2026-10-12-audio-compression-research.md и
  tasks/2026-10-13-opus-migration.md)
- ~~Fallback при отсутствии файла~~ → **РЕШЕНО: молчание** (без крашей;
  задокументировано в README FAQ и строке voice.missing)
