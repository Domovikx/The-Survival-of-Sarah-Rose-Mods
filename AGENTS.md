# The Survival of Sarah Rose — AI Voice

## Где что лежит (ЭТА репозиторий)

Это репозиторий ПАТЧЕЙ; описанные ниже пути — это РАНТАЙМ/раскладка УСТАНОВКИ
(корень папки игры), НЕ дерево репы. Мод устанавливается атомарной папкой
`mods/tssr-ai-voice-pack/` (решение 2026-10-19): установка = распаковка zip,
удаление = удалить эту папку (+ `environment.txt`, если других модов нет).
В `game/` мод НИЧЕГО не пишет. Соответствие «репа → установка»:

- `patches/ai-voice-pack/` (корень патча) → `mods/tssr-ai-voice-pack/` —
  ЗЕРКАЛО установки (2026-10-19): `zzz_ui.rpy`, `zzz_update_check.rpy`,
  `voice_config.rpy`, `fonts/`, `images/`, `tl/`, `catalog/` копируются как
  есть (arcname = относительный путь, тесты не дают вернуться «карте путей»)
- `patches/ai-voice-pack/audio/vo_<lang>/` → `mods/tssr-ai-voice-pack/ai_voice/<lang>/` (установка)
- `catalog/` (корень патча) → `mods/tssr-ai-voice-pack/catalog/` (в дистрибутив: только
  label_arc.json + voice_list.json; остальное — рантайм-пайплайна)
- `environment.txt` (корень игры, служебный) → `RENPY_SEARCHPATH = "mods"` —
  относительный путь, работает при любой локации установки; другие моды
  кладутся в `mods/<своя-папка>/` и подхватываются автоматически
  (обход searchpath рекурсивный; несколько путей — через `::`)
- `patches/ai-voice-pack/tools/{extract,generate,build,deploy}/` — пайплайн (extract →
  generate → build → deploy)
- `site/` — лендинг (GitHub Pages, vite), `tasks/` — журналы задач, `docs/` — доки,
  `patches/ai-voice-pack/tools/generate/scripts/voice_presets.mts` — единая карта
  конфигов озвучки (бывший `config/voice_presets.yaml`; yaml удалён 2026-10-21)
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
mods/tssr-ai-voice-pack/          # АТОМАРНАЯ папка мода (корень игры)
  ai_voice/
    ru/{Arc}/{uid}__{variant}.opus # русская озвучка, постфикс = имя рефа (СТАНДАРТ)
    en/{Arc}/{uid}__{variant}.opus # английская озвучка, постфикс = имя рефа (СТАНДАРТ)
                                  #   wav в ai_voice НЕТ (удалены 2026-10-14,
                                  #   финальная миграция; wav живут только в
                                  #   voice_candidates — рефы)
  catalog/
    label_arc.json              # label -> Arc (рантайм-мапа, грузится конфигом)
    voice_list.json             # голоса: имя -> variant (генерится из кастов)
  voice_config.rpy              # config.auto_voice = static_auto_voice
  tl/<lang>/                    # переводы (работают из searchpath: язык берётся
                                #   из блока translate, а не из пути файла)
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

`ai_voice/` и `catalog/` лежат внутри папки мода, поэтому voice_config.rpy
(init -999 — раньше любых других init-блоков) добавляет свою папку в
`config.searchpath`: загрузчик находит и озвучку, и каталог по относительным
путям `ai_voice/...`, `catalog/...`, ничего не зная про `mods/`.

**`__file__` в python-блоках НЕ использовать** (2026-10-19, найдено линтом
приёмочной установки): блоки исполняются в словаре `store`, чей `__file__`
указывает на движковой `renpy/minstore.py`, а не на наш .rpy — `dirname()`
давал `<корень>/renpy/`, диагностика писалась в папку движка, а в searchpath
уходил неверный корень (каталог и голоса не находились бы в игре, молча).
Старая раскладка работала случайно: `dirname(__file__)/..` из `renpy/` =
корень игры = правильный путь. Корень папки мода вычисляет только
`voice_config.rpy` (канонический `mods/tssr-ai-voice-pack` + скан `mods/`
на свои маркеры — переименованная папка работает); `zzz_ui.rpy` и
`zzz_update_check.rpy` читают готовое `_MOD_ROOT` из store (с фолбэком).
Страж: `tests/test_build_layout.py::test_rpy_sources_never_use_dunder_file`.

**Границы приёмочной установки** (правило владельца, 2026-10-19): в папку
игры не пишется НИЧЕГО вне `mods/` (плюс служебные `INSTALL.txt` и
`environment.txt` в корне — контракт движка для searchpath). Любые
артефакты тестов и съёмок — только в репу (`tmp/shots/`, в .gitignore).
Съёмка UI: драйвер `patches/ai-voice-pack/tools/generate/scripts/shots_capture.ps1 -GameDir <игра>`
везёт харнесс `zz_capture.rpy` во временную `<игра>/mods/_tssr-test/`,
пишет скриншоты в `<репа>/tmp/shots/` и убирает харнесс в `finally`.
Изображения на странице: `shots_for_site.py` конвертирует в
`site/public/shots/*.jpg` (ffmpeg, 1920x1080).

`Arc` в рантайме берётся из label-части translation ID
(`OpeningScene_92a05bc0` → `OpeningScene`) через `catalog/label_arc.json`.
Неизвестный label → папка `_unknown`. Язык: `preferences.language or "en"`.

### Dev-сторона

**База путей ниже** — корень патча `patches/ai-voice-pack/` (исключение:
`config/` — он в корне репы). Плоское `tools/` из game-репы неактуально:
скрипты живут в `tools/generate/scripts/`, каталоги пайплайна —
`catalog/` (корень патча, зеркало установки) и `tools/generate/{voice_candidates,output}`.

```text
catalog/   (КОРЕНЬ ПАТЧА; источник фраз — po/template.pot + po/ru.po,
            ниже — рантайм-мапы дистрибутива и источник тона)
  label_arc.json               # label -> Arc (рантайм-мапа для voice_config.rpy)
  voice_list.json              # РАНТАЙМ-мапа (имя -> variant, who -> имя);
                               #   генерится из кастов, читается voice_config.rpy
                               #   voices.yaml НЕ существует: озвучен = есть реф
                               #   {Имя}.wav; who-коды — в каст-yaml (who_codes)
  emotions.json                # источник тона: md5(msgid) -> тон; читают potgen
                               #   (--emotions) и voice_batch; НЕ легаси, не удалять
                               #   (голосовые отчёты missing_voices.md /
                               #   voice_sync_report.md выпищены 2026-10-22)
tools/generate/voice_candidates/
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
tools/generate/scripts/
  voicekit/                    # ЯДРО: paths (раскладка), catalog, contract (pydantic),
                               #   fs (безопасные операции), tts_env (пути моделей)
  voice_sync.py                # АКТУАЛИЗАТОР: status/update/migrate/report
                               #   (создаёт структуру новым, чинит пути, отчёты)
  voice_catalog.py             # ЛЕГАСИ: тл мода + script.rpy -> voices.jsonl +
                               #   label_arc.json (jsonl выпищен 2026-10-22,
                               #   источник фраз — POT; см. po/)
  voice_design.py              # VoiceDesign-генерация кандидатов -> generated/
  voice_presets.mts            # ЕДИНАЯ карта конфигов: audio/refs/design/batch/beastify
                               #   (был config/voice_presets.yaml; python читает json-дамп
                               #   `node voice_presets.mts`)
  config.mts                   # типизированный доступ к карте конфигов (load/section/get)
  cast_contract.mts            # дамп контрактов кастов casts/voices/{Имя}/{Имя}.mts
                               #   в JSON (мост для voice_design.py)
  add_candidate.mts            # gen_selected/*.mp3 -> корень каста: {Имя}[_{v}].wav
                               #   (нарезка + чистка одномерным прогоном + подключение
                               #   голоса: VOICES в casts/voices.mts null -> путь рефа)
  clean_refs.mts               # лечение рефов: highpass+денойз+deesser+EQ+LOUDNORM+фейды
                               #   (add_candidate.test.mts / clean_refs.test.mts — node --test)
  beastify.py                  # нелюдские голоса: пресеты orc/demon/monster
                               #   (pitch+formant вниз, тёмный EQ, acrusher, гроул-субтон,
                               #   модуляция/реверб) + loudnorm -16 LUFS/TP -1.5
  voice_batch.py               # батч-генерация: каталог -> audio/vo_{lang}/{arc}/{uid}__{variant}.opus
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
  voice_queue.sh               # ОЧЕРЕДЬ генерации: bash tools/generate/scripts/voice_queue.sh {ru|en}
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
```

### Ребут ПК: порядок запуска (двойной клик, без админа)

1. LLM — действий НЕ требует: LM Studio стартует автозагрузкой
   (Startup → `start-lmstudio.cmd`: сервер + qwen3.5-9b на GPU);
   контроль: `lms server status`. Освободить VRAM под озвучку —
   `tools/generate/scripts/stop-lmstudio.cmd`
2. `tools/generate/scripts/voice-start.cmd` — обе очереди озвучки (resumable, низкий приоритет)

Контроль: `tools/generate/scripts/voice-status.cmd` (сводка), `tools/generate/scripts/voice-watch.cmd` (живой
мониторинг), пауза — `tools/generate/scripts/voice-pause.cmd` (снять — `voice-resume.cmd`),
остановка — `tools/generate/scripts/voice-stop.cmd`. Агентам: статус смотреть пультом
(`python tools/generate/scripts/voice_ctl.py status`), не ручным подсчётом файлов.

## Инкапсуляция тулов (для агентов — ОБЯЗАТЕЛЬНО)

НЕ импортировать и НЕ вызывать код извне нашего репозитория
(W40K-тулзы `cosyvoice3_demo.py` и пр. в `tts_env.W40K_TOOLS`, чужие
скрипты, site-packages). Внешний код — только чтение референсов/моделей.
Если нужна функция из внешнего тула — КОПИРУЙ её в `tools/generate/scripts/voicekit/`
(адаптируя под нашу раскладку) и используй СВОЮ. Пример: `make_tuned_model_dir`
и `link_tree` раньше брались из W40K `cosyvoice3_demo.py` — теперь это
наш `tools/generate/scripts/voicekit/model_dir.py` (атомарная запись yaml + автохилка,
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
   Всё — в tools/generate/scripts/clean_refs.mts, применяется автоматически add_candidate.mts
   (одним прогоном: mp3 -> ПЕРВЫЕ 10с -> чистка -> loudnorm -16/TP -1.5 ->
   корень каста: {Имя}.wav). Единый уровень громкости для ВСЕХ рефов.

Категории (POT-каталог, msgctxt): dialogue 25 121, narration 43 236 (голосуется),
menu 525, ui 238. Озвучиваются только dialogue + narration, и только касты с
активным рефом {Имя}.wav (остальные — пропуск); непереведённые ru-строки
(пустой msgstr) тоже пропускаются.

## Актуализация (voice_sync)

```bash
python tools/generate/scripts/voice_sync.py status    # сводка слоёв + расхождения (console)
python tools/generate/scripts/voice_sync.py update --apply   # структура+заглушки новым, сводка
python tools/generate/scripts/voice_sync.py report   # ЛЕГАСИ: пишет .md-отчёты в catalog/
                                                    #   (в git не идут; заменит TS-порт)
```

Безопасность: ничего не удаляет и не перетирает; `--apply` = реальные изменения,
по умолчанию — только план.

## Мапа «спикер → голос» (актуализация после апдейта игры)

`casts/casts.mts` — типизированный модуль (2026-10-21, заменил реестры
who_map.jsonl/overrides.jsonl):

- `CAST_NAMES` — юнион имён кастов (сверяется с папками casts/ в обе стороны);
- `SPEAKERS` — КАЖДЫЙ спикер `po/template.pot` → каст | null (null = осознанно
  без голоса);
- `LINE_OVERRIDES` — uid → спикер (реплики под маской чужого спикера; 23
  записи перенесены из старого overrides.jsonl).

```bash
npm run speakers:audit        # рапорт: шаринг голосов, null-спикеры, протухшие ключи
npm run speakers:audit:emit   # + блок новых спикеров для вставки (после апдейта)
npm run speakers:check        # тихий CI-гейт
npm run test:speakers         # 20 тестов (включая живые гарды POT/кастов)
```

## Пересборка каталога

```bash
# ТОЛЬКО при апдейте игры (тексты поменялись). Источник фраз — POT:
npm run potgen        # template.pot перезаписан (e2e-гард байт-в-байт)
npm run po:update     # ru.po досинхронизирован (точный перенос / ретаргет / новые пустые)
# Дельта added/changed/dropped видна как git diff template.pot: added —
# генерировать (voice_batch ru+en), changed переозвучить (--force --uid),
# dropped (если были озвучены) — кандидаты на чистку audio/vo_*.
python tools/generate/scripts/voice_sync.py status  # заглушки без рефов/контрактов (консоль)
```

## Добавление нового голоса (инкрементально, ничего не пересобирается)

```bash
# 1. Положить отобранный клип: voice_candidates/{Имя}/gen_selected/{Имя}.mp3
# 2. Собрать рабочий реф (существующие скипаются; voice не требует python):
node tools/generate/scripts/add_candidate.mts --only "{Имя}"   # или: npm run refs:add -- --only "{Имя}"
#    -> корень каста {Имя}.wav; голос ПОДКЛЮЧАЕТСЯ сам (озвучен = есть реф)
# 3. (who-коды в каст-yaml: who_codes — заполняются из каталога, руками
#    обычно не трогаются)
# 4. Зафиксировать финальный реф (копия {Имя}.wav в корне — он и есть активный):
python tools/generate/scripts/voice_manage.py select {Имя} ""    # вариант без номера = базовый
#    (или просто переименуй {Имя}_{v}.wav -> {Имя}.wav)
# 5. Обновить отчёты:
python tools/generate/scripts/voice_sync.py report
# 6. Сгенерировать реплики только этого персонажа (только отсутствующие файлы):
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/generate/scripts/voice_batch.py \
  --char "{Имя}" --limit 10
```

## Генерация кандидатов по промту (VoiceDesign)

Голоса-кандидаты можно не искать, а ГЕНЕРИРОВАТЬ: Qwen3-TTS-12Hz-1.7B-VoiceDesign
создаёт речь по текстовому описанию тембра (пол/возраст/характер).

```bash
PY="C:\pinokio\api\Qwen3-TTS-Pinokio.git\app\venv\Scripts\python.exe"
"$PY" tools/generate/scripts/voice_design.py --list                # каст
"$PY" tools/generate/scripts/voice_design.py --char Carolyn --n 6  # 6 кандидатов -> generated/01..06.mp3
python tools/generate/scripts/voice_sync.py status                # сводка: кто без голоса (консоль)
```

Правила: каст в `voice_candidates/{Имя}/{Имя}.yaml` (instruct_en — ФИЗИОГНОМИКА + СОЦИАЛЬНАЯ РОЛЬ для генерации:
пол, возраст с «лет», кто это (вор/генерал/король/трактирщик...),
телосложение/лицо/осанка/поступь — БЕЗ описания голоса (типаж
вырисовывается из тела), instruct_ru — русский перевод для ревью,
texts — рус. фразы с ЯВНЫМ признаком пола; файл = контракт);
**texts: каждая фраза 150–250 символов (≈10–20с речи)** — короче даёт клип
<10с (не годится в реф), длиннее — риск дрейфа голоса внутри клипа
(voice_design.py печатает WARN для коротких); клип должен быть ≥10с — тул сам добирает длину (slow-инструкция →
+вторая фраза); резюмабелен (существующие файлы пропускает). Итог прогона —
в stdout и `output/voice/design.log`
(--char принимает ОДНО имя — повторяй флаг; параллельно
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
3. Рабочие рефы: add_candidate.mts → корень каста: {Name}[_{variant}].wav
4. Генерация ПО КАЖДОМУ варианту (файлы лежат рядом, постфикс = реф):
   voice_batch.py --char Sarah --ref voice_candidates/Sarah/Sarah_1.wav --limit 5
   voice_batch.py --char Sarah --ref voice_candidates/Sarah/Sarah_3.wav --limit 5
   → audio/vo_ru/{arc}/{uid}__Sarah_1.opus и {uid}__Sarah_3.opus
5. Выбор: слушаешь пары в audio/vo_ru/{arc}/ (одинаковые uid рядом)
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
node tools/generate/scripts/add_candidate.mts --only {Name}

# A/B-сравнение: генерация каждым вариантом
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/generate/scripts/voice_batch.py \
  --char Sarah --ref voice_candidates/Sarah/Sarah_1.wav --limit 5
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/generate/scripts/voice_batch.py \
  --char Sarah --ref voice_candidates/Sarah/Sarah_3.wav --limit 5

# Управление голосами
python tools/generate/scripts/voice_manage.py list      # все голоса, активный реф, варианты
python tools/generate/scripts/voice_manage.py status    # кто озвучен
python tools/generate/scripts/voice_manage.py select Sarah 3  # выбрать вариант → Sarah.wav (корень)

# Генерация (только отсутствующие файлы)
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/generate/scripts/voice_batch.py \
  --char Sarah --limit 10

# Перегенерация (все файлы, --force)
C:\tools\cosyvoice3\.venv\Scripts\python.exe tools/generate/scripts/voice_batch.py \
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
   разметка `tools/generate/scripts/emotion_tag.py` (эвристика или --llm-url phi4-mini);
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
модели (batch в voice_presets.mts) + пофразовая эмоция из emotions.json
дают чистую генерацию без артефактов. Эмоция автоматически берётся из
catalog/emotions.json при генерации каждой фразы.

ВАЖНО (2026-09-04): эмоция есть у КАЖДОЙ фразы — состояния «без эмоции»
НЕ бывает. Даже наррация-наблюдение («Он хлопнул себя по бёдрам») несёт
отношение диктора: «Curiously observing», «Warily, watching closely»,
«Amused» и т.п. Промпт разметки (LLM_PROMPT в emotion_tag.py) требует
всегда возвращать инструкцию диктора; `none` запрещён; пустой ответ →
DEFAULT_EMO. emotions.json покрывает 100% фраз (67 254).

ВАЖНО (2026-10-21, инцидент): `catalog/emotions.json` — НЕ легаси, удалять
запрещено: коммит a16e21ef9 вынес каталог как «легаси» → POT остался
без `#. emotion:` и 68 181 запись потеряла тон — восстановлено из истории.
Эмоции живут на записях `po/template.pot` с привязкой по uid (md5 текста):
обновление игры — тон переживает, пока текст не менялся; фраза изменилась →
новый uid → тон сброшен, навешивать заново ВРУЧНУЮ по семантике фразы и её
эмоциональному контексту. Эмоция ВСЕГДА на английском. Полная памятка:
`.opencode/skills/renpy-po/SKILL.md`, раздел «Метаданные озвучки».

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
# Рефы (TS-порт; ffmpeg-кейсы скипаются без ffmpeg):
node --test tools/generate/scripts/add_candidate.test.mts tools/generate/scripts/clean_refs.test.mts
# Легаси-pytest оставшегося python (voicekit/voice_sync/manage/batch):
python -m pytest tests/ -v
```

## Локальные LLM (проверено 2026-10-22)

Железо: Ryzen 7 7800X3D, 32 ГБ RAM, **NVIDIA RTX 5070 Ti 16 ГБ (CUDA)**,
Windows 11.

### Запуск и остановка (скрипты в tools/generate/scripts/)

**LM Studio** (winget `ElementLabs.LMStudio`, v0.4.26) в headless-режиме:
CLI `~/.lmstudio/bin/lms.exe`, сервер на **127.0.0.1:1234**
(OpenAI-compatible `/v1`). ВСЕГДА используй `127.0.0.1:1234`, не localhost.

- `start-lmstudio.cmd` — `lms server start` + `lms load qwen/qwen3.5-9b
--gpu max` (загрузка модели ~5–9 с, 6.1 ГБ VRAM). После ребута сам:
  ярлык «LM Studio Server» в автозагрузке (shell:startup) гоняет этот
  скрипт свёрнутым.
- `stop-lmstudio.cmd` — выгружает модели (VRAM 7.5 → 1.0 ГБ) и гасит
  сервер: запускать, когда ПК нужен под озвучку (CUDA CosyVoice требует
  VRAM) или другую тяжёлую GPU-задачу.
- контроль: `lms server status`, `lms ls`; `curl 127.0.0.1:1234/v1/models`.

| Модель (LM Studio) | Размер | Скорость (CUDA 5070 Ti)  | Назначение                              |
| ------------------ | ------ | ------------------------ | --------------------------------------- |
| `qwen/qwen3.5-9b`  | 6.1 ГБ | **~100+ ток/с, GPU max** | ОСНОВНАЯ: чат, ресёрчи, разметка эмоций |

- 256K контекст, vision (Text+Image), thinking-режим (для скорости в API:
  `"think": false` — иначе thinking сжирает токены на простых запросах);
- модели лежат в `~/.lmstudio/models/` (есть также mimo-v2.6-distill-9b,
  deepseek-r1-qwen3-8b, nomic-embedding); новая — `lms get <имя>` + строка
  в `models` провайдера `~/.config/opencode/opencode.json`;
- `qwen3.5:27b` (17–20 ГБ) в 16 ГБ VRAM не влезает целиком — не ставить;
- **`emotion_tag.py --llm-url` зовёт ollama-API (`/api/generate`) — с LM
  Studio не работает**; повторная LLM-разметка эмоций будет на TS-порте
  (`/v1/chat/completions`).

### Подключение к opencode

`~/.config/opencode/opencode.json` — провайдер `lmstudio-local`
(openai-compatible, baseURL **http://127.0.0.1:1234/v1** — именно 127.0.0.1,
не localhost!). Модель: qwen/qwen3.5-9b. Выбор в TUI: `/models` (или
Shift+Tab) → LM Studio Local → qwen/qwen3.5-9b.

ВАЖНО (грабли 2026-09-04): если провайдера НЕТ в списке моделей — проверь
`~/.config/opencode/opencode.jsonc` (грузится поверх opencode.json и
ПЕРЕКРЫВАЕТ его): там может быть `disabled_providers: ["lmstudio-local", ...]`
и мусорные провайдеры с битым baseURL — удали их. Правка конфига требует
ПЕРЕЗАПУСКА opencode (конфиг читается один раз при старте).

### История смены стека (2026-09..2026-10)

1. AMD RX 6600 XT + ollama/Vulkan: 39 tok/s, после каждого ребута — двойной
   клик `start-ollama-vulkan.cmd`; старый Adrenalin → 2.6 tok/s.
2. 2026-10-22: машина на RTX 5070 Ti/CUDA; ollama v0.40.8 установлена и В
   ТОТ ЖЕ ДЕНЬ удалена (владелец выбрал LM Studio): пакет, автозагрузка,
   `~/.ollama`, env `OLLAMA_KEEP_ALIVE` — вычищены; скрипт
   `start-ollama-vulkan.cmd` удалён. Правило «127.0.0.1 вместо localhost» —
   из той же истории, оставлено.

### GPU для CosyVoice (DirectML) — НЕ ВЫШЛО (2026-09-04, история AMD)

АКТУАЛЬНО (2026-10): CosyVoice гоняется на CUDA RTX 5070 Ti —
`voice_batch.py --device cuda` (fp16, guard + загрузка на старте), rtf ~3
(было ~8 на CPU; замеры — задача GPU-миграции озвучки). Опыт DirectML ниже —
исторический; патчи в коде остаются безвредными (env-гейт `TSSR_DML=1`).

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
