# The Survival of Sarah Rose — AI Voice

## Где что лежит (ЭТА репозиторий)

Это репозиторий ПАТЧЕЙ; описанные ниже пути — это РАНТАЙМ/раскладка УСТАНОВКИ
(корень папки игры), НЕ дерево репы. Мод устанавливается атомарной папкой
`mods/tssr-ai-voice-pack/` (решение 2026-10-19): установка = распаковка zip,
удаление = удалить эту папку (+ `environment.txt`, если других модов нет).
В `game/` мод НИЧЕГО не пишет. Соответствие «репа → установка»:

- `patches/ai-voice-pack/` (корень патча) → `mods/tssr-ai-voice-pack/` —
  ЗЕРКАЛО установки (2026-10-19): `zzz_ui.rpy`, `zzz_update_check.rpy`,
  `voice_config.rpy`, `fonts/`, `images/`, `tl/` копируются как
  есть (arcname = относительный путь, тесты не дают вернуться «карте путей»).
  **2026-10-23: `tl/ru` DEPRECATED** (легаси-корпус, правки не принимаются;
  источник истины русского — `po/ru.po`; выпилка — фаза 2 задачи
  `tasks/2026-10-23-tl-ru-deprecation.md` под гейтом владельца)
- `patches/ai-voice-pack/audio/vo_<lang>/` → `mods/tssr-ai-voice-pack/ai_voice/<lang>/` (установка)
- `catalog/` (в установке: `mods/tssr-ai-voice-pack/catalog/`) — АРТЕФАКТ СБОРКИ
  (2026-10-22: в репе каталог/ не живёт): `label_arc.json` + `voice_list.json`
  генерит `tools/generate/scripts/catalog_gen.mts` из POT-инвентаря и
  casts/voices.mts, в zip кладёт build_pack.py
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

- **БАЗОВЫЕ ИНЖЕНЕРНЫЕ ПРИНЦИПЫ — на весь проект, код и доки, без исключений:**
  - **KISS** — выбирается самое простое решение, которое покрывает реальную
    задачу. Сложность обязана оправдываться конкретной проблемой, а не
    «правильной архитектурой на вырост».
  - **DRY** — одно знание живёт в одном месте. Дублирование факта, команды
    или инструкции (в коде, в доках, между ними) — дефект: выноси общее
    или ссылайся на источник, а не пересказывай.
  - **YAGNI** — не строить «на случай, когда понадобится». Абстракция,
    флаг или слой появляются ПОСЛЕ второго реального случая, не раньше.
  - **SOLID** — рекомендуется (одна ответственность, открытость/замена,
    изоляция зависимостей). Это ориентир, а не догма: если SOLID конфликтует
    с KISS — выигрывает KISS, потому что принципы служат простоте чтения
    и изменения, а не наоборот.
  - Проверка перед правкой: «что из этого станет проще/короче/единственным
    источником?» Если ответа нет — правка лишняя, значит YAGNI: не делай её.
- **НИКОГДА не коммитить без явного разрешения пользователя.**
- **ДЛИНА НЕ ЯВЛЯЕТСЯ И НИКОГДА НЕ БУДЕТ КРИТЕРИЕМ КАЧЕСТВА ПЕРЕВОДА**
  (приказ владельца 2026-10-26, после двух рецидивов: ratio-лимит выпилен
  24.10, класс D «короткий msgid → длинный» выпилен 26.10). Переводы не
  проверяются на длину: запрещены сравнения msgstr с msgid, ratio, пороги
  «слишком длинно/коротко». Строка любой длины нормальна, если перевод верный.
  Единственная сверка «соответствует ли» (в т.ч. `Save` → `Guardar`) —
  **LLM-судья**: смотрит смысл и семантику, а не арифметику. Гарды — тесты
  `po_translate.test.mts` «ЗАПРЕТ длины как критерия» и «длина вообще не
  проверяется»; любая новая проверка длины = падение CI.
  Запрет только о ПЕРЕВОДАХ: форма непереводных артефактов (заголовок
  git-коммита ≤72 — `scripts/commit_style.mts`, переносы строк, лимиты
  буферов) под него не попадает, а `commit_style.mts` архитектурно отрезан от
  po-инструментов (тест в `commit_style.test.mts`).
- **При любой проблеме, тупике или неожиданном поведении — СНАЧАЛА делать
  веб-поиск (websearch), а не гадать и не сдаваться:** часто решение уже
  найдено кем-то другим (баги ffmpeg/форматов, поведение библиотек, версии
  тулов). Гипотезу из веб-поиска — проверять локально, потом править код.
- **Сохранил .mts/.ts файл — СРАЗУ проверяй его, не копя до коммита:**
  `npx oxlint --fix <файл>` + `npx prettier --write <файл>` (питон —
  `python -m py_compile <файл>`); сомневаешься в типах — `npm run typecheck`.
  oxlint зови по директории или голым `npm run lint` — glob-путь `**/*.mts`
  он молча не находит (0 файлов, без ошибки).
  `npm run typecheck` проверяет ВЕСЬ проект (корень `.mts` + `site/`) и
  дополнительно сверяет покрытие файлов — `scripts/check_ts_coverage.mts`
  падает, если какой-то .mts выпал из проверки.

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
                                  #   только opus; wav в ai_voice НЕТ (см. ниже)
  catalog/
    label_arc.json              # label -> Arc (артефакт СБОРКИ: генерит
                                #   catalog_gen.mts из POT label-map, в zip
                                #   кладёт build_pack.py; в репе не живёт)
    voice_list.json             # КТО озвучен: {имя: имя} — мапа ТОЖДЕСТВЕННАЯ
                                #   (вариант рефа там НЕ хранится), + narrator.
                                #   АРТЕФАКТ СБОРКИ: генерит catalog_gen.mts из
                                #   casts/voices.mts (VOICES), руками не трогать;
                                #   в репе файла НЕТ.
  voice_config.rpy              # config.auto_voice = static_auto_voice
  tl/<lang>/                    # переводы (работают из searchpath: язык берётся
                                #   из блока translate, а не из пути файла)
```

**Поиск в игре:** `voice_config.rpy` читает `catalog/voice_list.json`
(генерится из кастов: озвучен = есть реф `{Name}.wav`; variant = имя
персонажа). Кто говорит → `_last_say_who.name` → variant из voice_list.json,
затем фолбэк glob `{uid}*.opus`, `{uid}*.wav` (первый совпавший по алфавиту).
**Формат — только opus** (миграция завершена 2026-10-14): `voice_batch.mts`
пишет opus сразу (pipe loudnorm → libopus за один проход, wav не пишется),
легаси-wav удалены с диска, `convert_all_opus.py` удалён — конвертировать
нечего. В КОДЕ рантайма wav остаётся фолбэком (проверено в игре 7.4.11) для
старых установок, но в `ai_voice/` его нет.

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
`catalog/` (корень патча, зеркало установки), `casts/voices/` (рефы и
кандидаты) и `tools/generate/output`.

```text
catalog/   (УДАЛЁН из репы 2026-10-22: каталог-легаси выпищен. Источник фраз —
            po/template.pot + po/ru.po; рантайм-мапы дистрибутива — АРТЕФАКТЫ
            СБОРКИ, генерит tools/generate/scripts/catalog_gen.mts, в zip кладёт
            build_pack.py; тон — метаданные `#. emotion:` шаблона)
  label_arc.json               # label -> Arc ИЗ POT label-map (инвентарь
                               #   сюжетных лейблов, 247 шт.; правила — potgen.mts)
  voice_list.json              # имена озвученных -> variant ИЗ casts/voices.mts
                               #   (VOICES: озвучен = активный реф {Имя}.wav;
                               #   narrator = реф Narrator; who-коды — в
                               #   casts/casts.mts who_codes)
casts/voices/
  {Имя}/
    {Имя}.mts                 # КОНТРАКТ (типизированный CastContract, отчёт-поля
                              #   скриптов; instruct_en — типаж для генерации,
                              #   instruct_ru — его русский перевод для ревью)
    generated/                # СЫРЬЁ: voice_design.py пишет сюда 01.mp3..NN.mp3
    gen_selected/             # ОТБОР: вручную лучшие клипы, ОДИН файл
                              #   (любое имя mp3) -> станет {Имя}.wav;
                              #   несколько файлов: 1-й -> {Имя}.wav,
                              #   остальные -> {Имя}_2.wav, {Имя}_3.wav...
    {Имя}.wav                 # АКТИВНЫЙ реф в корне каста (озвучен = есть реф);
                              #   варианты A/B рядом: {Имя}_{v}.wav
tools/generate/scripts/
  voicekit/                    # ЯДРО: python-шимы (paths, contract, fs, tts_env,
                               #   model_dir) + TS-контур генерации:
                               #   worker.mts     # клиент шима: протокол v2 (PCM),
                               #                 #   ретрай TextEncodeInput, trim, кодирование
                               #   trim.mts       # паттерн-трим (порт trim_tail_burst.py)
                               #   audio.mts      # f32le pipe -> loudnorm -> libopus -ar sr
                               #                 #   -> .part -> rename; wav-фолбэк (saveWavChain)
                               #   fake_worker.mts # фейковый шим для тестов worker'а
                               #   (*.test.mts    # node --test)
  voice_design.py              # ИНФЕРЕНС VoiceDesign (python): кандидаты -> generated/
                               #   (мост контрактов — cast_contract.mts JSON)
  voice_presets.mts            # ЕДИНАЯ карта конфигов: audio/refs/design/batch/beastify
                               #   (был config/voice_presets.yaml; python читает json-дамп
                               #   `node voice_presets.mts`)
  config.mts                   # типизированный доступ к карте конфигов (load/section/get)
  cast_contract.mts            # дамп контрактов casts/voices/{Имя}/{Имя}.mts -> JSON
                               #   (мост для инференса voice_design.py)
  add_candidate.mts            # gen_selected/*.mp3 -> корень каста: {Имя}[_{v}].wav
                               #   (нарезка + чистка одномерным прогоном + подключение
                               #   голоса: VOICES в casts/voices.mts null -> путь рефа)
  clean_refs.mts               # лечение рефов: highpass+денойз+deesser+EQ+LOUDNORM+фейды
                               #   (add_candidate.test.mts / clean_refs.test.mts — node --test)
  voice_manage.mts             # УПРАВЛЕНИЕ ГОЛОСАМИ: list / status / select
                               #   (A/B: {Имя}_{v}.wav -> {Имя}.wav; в мапу
                               #   пишется имя -> имя, см. раскладку выше)
  voice_sync.mts               # АКТУАЛИЗАТОР: status (слои/расхождения кастов),
                               #   update --apply (папка+gen_selected/+generated/
                               #   контракт-заглушка новым кастам из SPEAKERS)
  emotion_tag.mts              # разметка эмоций: tmp/emotions_tagged.json (черновик
                               #   тона; в шаблон — npm run potgen -- --emotions <файл>
                               #   overlay'ем; эвристика RULES или --llm-url
                               #   OpenAI-compatible LLM — LM Studio/ollama)
  voice_batch.mts              # БАТЧ-ОРКЕСТРАТОР: каталог POT -> audio/vo_{lang}/{arc}/
                               #   {uid}__{variant}.opus (эмоция из `#. emotion:` POT;
                               #   --ref/--uid/--force/--emotion/--device cuda; wav НЕ
                               #   пишется: PCM из шима -> trim -> pipe f32le -> ffmpeg
                               #   loudnorm+libopus (TS, voicekit/audio.mts);
                               #   ИНФЕРЕНС шеллит в python cosyworker.py)
  cosyworker.py                # ИНФЕРЕНС CosyVoice — ЕДИНСТВЕННЫЙ python генерации
                               #   (венв C:/tools/cosyvoice3): модель один раз на
                               #   процесс; протокол v2 — отдаёт СЫРОЙ PCM
                               #   (pcm_b64 + sr), НЕ пишет файлов (trim/opus/wav
                               #   на TS); torch в node невозможен
  beastify.py                  # нелюдские голоса: пресеты orc/demon/monster
                               #   (pitch+formant вниз, тёмный EQ, acrusher, гроул-субтон,
                               #   модуляция/реверб) + loudnorm -16 LUFS/TP -1.5
  trim_tail_burst.py           # паттерн-трим хвостовых артефактов (CLI по wav;
                               #   в генерации алгоритм живёт в voicekit/trim.mts)
  levelnorm.py                 # выравнивание: -16 LUFS / TP -1.5 (CLI по *.wav —
                               #   только рефы/легаси; в генерации те же LOUD_ARGS
                               #   применяет voicekit/audio.mts)
  voice_status.mts             # СТАТУС И ПРОГНОЗ генерации: готово (стем opus/wav)
                               #   по языкам/аркам, %, размер, воркеры, скорость,
                               #   прогноз (--fast без замера). ВСЕГДА для «статус?»
  voice_role_audit.mts         # РОЛЕВОЙ АУДИТ корпуса (скилл tssr-voice-audit):
                               #   роли PO ↔ касты ↔ файлы, классы OK/WRONG_ROLE/
                               #   VOICELESS/NON_SPEECH/STALE/ARC/WEIRD; --delete
                               #   (мёртвые классы), --fix-arc (перенос ARC в
                               #   POT-арку), --verify (сверка с сырьём game/:
                               #   POT-дрейф + STALE жив/мёртв), --dry (план без
                               #   правок ФС); отчёт tmp/role_audit.json
  voice_queue.sh               # ОЧЕРЕДЬ генерации: bash tools/generate/scripts/voice_queue.sh {ru|en}
                               #   (все арки, resumable, НИЗКИЙ приоритет
                               #   BelowNormal + OMP_NUM_THREADS=6 — не мешает
                               #   интерактиву; лог output/voice/gen_all_{lang}.log)
                               #   СТАРТ ТОЛЬКО ЧЕРЕЗ ПУЛЬТ (voice_ctl/voice-start.cmd),
                               #   голый запуск запрещён (теряется приоритет/детач)
  voice_ctl.py                 # ПУЛЬТ очередями (Windows, только stdlib, системный python):
                               #   status/start/stop/pause/resume/watch/logs [ru|en|all]
                               #   (процессы ищет по cmdline voice_batch.mts/voice_queue.sh;
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

## Миграция python → TypeScript (приказ владельца 2026-10-23)

**Мы мигрируем с питона на ТС: это экспериментальный проект, который в
идеале должен максимально использовать именно ТС без питона.** python
живёт только там, где физически не обойтись (torch/CV3-инференс); всё,
что выражается на TS, пишется на `.mts`.

**Мотивация (владелец, 2026-10-24): это ещё и ПРЕЗЕНТАЦИОННЫЙ/УЧЕБНЫЙ проект —
образец для студентов, что TS в реальном мире умеет многое. Поэтому максимум
всего делаем через `.ts`/`.mts` ДАЖЕ там, где python был бы «проще»: учебная
ценность TS-решения — часть требований, а не побочный бонус. При равной цене
выбор всегда в пользу TS; при большей цене на TS — предлагать владельцу с числами,
потому что показать «TS смог» тоже ценность.

Приказ владельца (дословно): «`cosyworker.py` перепиши на ТС. напиши в
`AGENTS.md` что мы мигрируем с питона на ТС, это экспереминтальный проект
который в идеале должен максимально использовать именно ТС без питона.»

### Граница (шаг «cosyworker → TS», 2026-10-23)

| Слой                                                                   | Язык   | Файлы                                                                                                |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Оркестрация батча: каталог, фильтры, эмоции, логи, ETA                 | TS     | `voice_batch.mts`                                                                                    |
| Клиент шима: протокол v2, ретрай TextEncodeInput, trim, ffmpeg-цепочка | TS     | `voicekit/worker.mts`, `voicekit/trim.mts`, `voicekit/audio.mts`                                     |
| Инференс (модель CV3, torch)                                           | python | `cosyworker.py` — ЕДИНСТВЕННЫЙ python контура генерации                                              |
| Рефы/голоса/статус/разметка                                            | TS     | `add_candidate`, `voice_manage`, `voice_status`, `emotion_tag` и пр.                                 |
| CLI-легаси (на вымирание)                                              | python | `voice_ctl.py`, `beastify.py`, `levelnorm.py`, `trim_tail_burst.py`, `voice_design.py`, `voicekit/*` |

Протокол v2 (2026-10-23): шим отдаёт СЫРОЙ PCM (`pcm_b64` = float32 LE mono,
плюс поле `sr`), файлов не пишет. Дальше всё на TS: ретрай холодного фронтенда
(TextEncodeInput, «повтор через 3с») — `worker.mts`; паттерн-трим
«пауза+всплеск» — `voicekit/trim.mts` (порт `trim_tail_burst.py`);
кодирование — `voicekit/audio.mts` (pipe f32le → loudnorm -16 LUFS/TP -1.5 →
libopus 24k с ОБЯЗАТЕЛЬНЫМ выходным `-ar sr` → `.part` → rename; wav-фолбэк
`saveWavChain` там же).

Правила миграции:

- **Новый код — только `.mts`.** python-файлы не растут: правки = багфиксы
  по необходимости; новые фичи — на TS.
- Оставшиеся python-утилиты — легаси: при равной цене делать на TS;
  перенос алгоритма = порт + тест-паритет (пример: `trim.test.mts`).
- Внешний код не импортируется (см. «Инкапсуляция тулов»).
- Гарды: `voice_batch.test.mts` (блок «миграция python → TS», UTF-8,
  OpusHead-текстовый) и `voicekit/audio.test.mts` (behavioral: OpusHead
  original-rate == 24000 через ПАРСЕР заголовка — **ffprobe
  `stream.sample_rate` для opus ВСЕГДА 48000 и контракт НЕ проверяет**,
  проверено на корпусе 2026-10-23).

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

ВАЖНО: рабочие рефы ВСЕГДА из корня каста `casts/voices/{Имя}/{Имя}.wav`
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
node tools/generate/scripts/voice_sync.mts status    # слои/расхождения кастов (консоль)
node tools/generate/scripts/voice_sync.mts update --apply   # папка+контракт-заглушка
                                                            #   новым кастам из SPEAKERS
```

Безопасность: ничего не удаляет и не перетирает; без `--apply` — только план.
Рефы НЕ создаются автоматически — только структура. (python voice_sync.py
удалён 2026-10-22: migrate — одноразовый переезд уже сделан, report — *.md
выпищены, jsonl — источник фраз теперь POT.)

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
node tools/generate/scripts/voice_batch.mts --lang ru --dry-run  # план фраз (консоль)
#   (заглушки кастов без рефов — npm run speakers:audit; voice_sync status
#    сломан до TS-порта)
```

## Переводы (po)

Источник фраз — `po/template.pot` (ключ uid = md5 текста), переводы —
`po/<lang>.po`, 10 языков. Сам пайплайн НЕ пересказывается здесь: правила
качества, шлюзы и пороги — в скиллах `.opencode/skills/renpy-po/SKILL.md`
(перевод) и `.opencode/skills/po-audit/SKILL.md` (поиск проблем в готовом).

```bash
npm run po:translate -- --lang es   # построчный перевод: LM Studio + LLM-судья
npm run po:translate:status         # стоп / пустых / скорость по всем языкам
npm run po:translate:stop           # чистая остановка (чекпоинт)
npm run po:audit                    # «в чём лажа» в уже переведённом
npm run po:check                    # целостность po (обнуление/усечение/остатки .part)
npm run po:commit                   # валидация -> git add -> коммит (текст пишет локальная LLM)
```

Две памятки, каждая из-за реального инцидента:

- **длина не критерий** — см. «Правила для AI-агента» выше;
- **запись po атомарная** (`<файл>.part` → rename): убийство процесса посреди
  `writeFileSync` обнуляло `de.po` (2026-10-26). Новый код пишет po только
  через `writePoAtomic` из `po_core.mts`.

## Добавление нового голоса (инкрементально, ничего не пересобирается)

```bash
# 1. Положить отобранный клип: casts/voices/{Имя}/gen_selected/{Имя}.mp3
# 2. Собрать рабочий реф (существующие скипаются; voice не требует python):
node tools/generate/scripts/add_candidate.mts --only "{Имя}"   # или: npm run refs:add -- --only "{Имя}"
#    -> корень каста {Имя}.wav; голос ПОДКЛЮЧАЕТСЯ сам (озвучен = есть реф)
# 3. (who-коды в каст-yaml: who_codes — заполняются из каталога, руками
#    обычно не трогаются)
# 4. Зафиксировать финальный реф (копия {Имя}.wav в корне — он и есть активный):
node tools/generate/scripts/voice_manage.mts select {Имя} ""    # вариант без номера = базовый
#    (или просто переименуй {Имя}_{v}.wav -> {Имя}.wav)
# 5. Сгенерировать реплики только этого персонажа (только отсутствующие файлы):
node tools/generate/scripts/voice_batch.mts --char "{Имя}" --limit 10
```

## Генерация кандидатов по промту (VoiceDesign)

Голоса-кандидаты можно не искать, а ГЕНЕРИРОВАТЬ: Qwen3-TTS-12Hz-1.7B-VoiceDesign
создаёт речь по текстовому описанию тембра (пол/возраст/характер).

```bash
PY="C:\pinokio\api\Qwen3-TTS-Pinokio.git\app\venv\Scripts\python.exe"
"$PY" tools/generate/scripts/voice_design.py --list                # каст
"$PY" tools/generate/scripts/voice_design.py --char Carolyn --n 6  # 6 кандидатов -> generated/01..06.mp3
node tools/generate/scripts/voice_sync.mts status             # сводка: слои/расхождения кастов
```

Правила: каст = контракт `casts/voices/{Имя}/{Имя}.mts` (instruct_en — ФИЗИОГНОМИКА + СОЦИАЛЬНАЯ РОЛЬ для генерации:
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
1. Кандидаты: voice_design.py → casts/voices/{Name}/generated/*.mp3
2. Отбор: слушаешь generated/, копируешь лучшие вручную в gen_selected/
   ({Name}.mp3 — один топ-файл; A/B — {Name}_1.mp3, {Name}_2.mp3)
3. Рабочие рефы: add_candidate.mts → корень каста: {Name}[_{variant}].wav
4. Генерация ПО КАЖДОМУ варианту (файлы лежат рядом, постфикс = реф):
   node voice_batch.mts --char Sarah --ref casts/voices/Sarah/Sarah_1.wav --limit 5
   node voice_batch.mts --char Sarah --ref casts/voices/Sarah/Sarah_3.wav --limit 5
   → audio/vo_ru/{arc}/{uid}__Sarah_1.opus и {uid}__Sarah_3.opus
5. Выбор: слушаешь пары в audio/vo_ru/{arc}/ (одинаковые uid рядом)
6. Фиксация: voice_manage.mts select {Name} {variant}
   → копирует {Name}_{variant}.wav → {Name}.wav (в корне каста)
7. Генерация: voice_batch.mts --char {Name} — использует активный реф
   (проигравшие варианты сохраняются рядом — {Name}_{v}.wav, для истории)
```

### Переключение варианта в рантайме

`voice_manage.mts select {Имя} {вариант}` меняет ТОЛЬКО активный реф
(копирует {Имя}_{v}.wav → {Имя}.wav) — это вход для клонирования.

⚠️ Мапа `voice_list.json` при этом НЕ меняется и варианта не хранит: она
тождественная (`имя → имя`, см. `catalog_gen.mts` — `names[name] = name`)
и отвечает лишь за список КТО озвучен.

Чтобы вариант реально прозвучал — перегенерируй этим рефом (шаг 7 выше):
файлы станут `{uid}__{Имя}.opus` и точный поиск их найдёт. Без перегенерации
остаётся только glob-фолбэк (`{uid}*.opus`, первый по алфавиту) — он способен
выбрать не тот вариант. Старые файлы удалять не обязательно.

### Инструменты

```bash
# Добавление кандидата → реф
node tools/generate/scripts/add_candidate.mts --only {Name}

# A/B-сравнение: генерация каждым вариантом
node tools/generate/scripts/voice_batch.mts \
  --char Sarah --ref casts/voices/Sarah/Sarah_1.wav --limit 5
node tools/generate/scripts/voice_batch.mts \
  --char Sarah --ref casts/voices/Sarah/Sarah_3.wav --limit 5

# Управление голосами
node tools/generate/scripts/voice_manage.mts list      # все голоса, активный реф, варианты
node tools/generate/scripts/voice_manage.mts status    # кто озвучен
node tools/generate/scripts/voice_manage.mts select Sarah 3  # выбрать вариант → Sarah.wav (корень)

# Генерация (только отсутствующие файлы)
node tools/generate/scripts/voice_batch.mts --char Sarah --limit 10

# Перегенерация (все файлы, --force)
node tools/generate/scripts/voice_batch.mts --char Sarah --limit 5 --force
```

### Структура рефов

```text
casts/voices/{Name}/
  {Name}_{variant}.wav               # A/B-варианты (сохраняются для истории)
  {Name}.wav                        # АКТИВНЫЙ реф (озвучен = этот файл существует)
```

Альтернативный реф без правки casts/voices.mts: `voice_batch.mts --ref`
`casts/voices/{Name}/{Name}_{variant}.wav`
(постфикс файла генерации = имя рефа: `{uid}__{variant}.wav`).

### Эмоции в генерации (рецепт, проверено 2026-09-02)

`voice_batch.mts --emotion "..." --emotion-tag <тег>` — instruct2-режим
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
6. Пофразовые эмоции — ЕДИНСТВЕННЫЙ источник тона: `#. emotion:` в
   `po/template.pot`, ключ uid = md5 текста. Вторых холдов НЕТ: из `po/*.po`
   тон убран (экономия 22.8 MB на 10 языках), `catalog/emotions.json`
   удалён 2026-10-22 (легаси-выпиленка). `npm run potgen` roundtrip'ит тон
   автоматически; изменился текст → новый uid → тон сброшен, навешивай
   заново вручную по смыслу фразы. Тон ВСЕГДА по-английски. Разметка:
   `emotion_tag.mts` пишет черновик в `tmp/emotions_tagged.json`, в шаблон —
   `npm run potgen -- --emotions <файл>` (overlay поверх roundtrip).
   Приоритет: `--emotion` (CLI) > POT[uid] > без эмоции; `--no-emotion`
   выключает пофразовую, `--emotion-ru` даёт перевод тона для манифеста.
   Обратный пайплайн «po → pot» — `renpy-po/pot_resolve.mts`. Полная
   памятка — `.opencode/skills/renpy-po/SKILL.md` → «Метаданные озвучки».
7. Манифест {wav}.txt фиксирует ref/emotion/конфиг — всегда рядом с wav.
8. Эмоция = состояние ДИКТОРА (кто произносит), не содержание текста:
   диалог участника — «In a burst of passion, crying out with joy and ecstasy»;
   наррация-наблюдение — «Erotically and sensually»; кульминация —
   «Crying out with joy, gasping through the spasms of orgasm».
   В текст добавляй эмоциональную пунктуацию («Ещё! Ещё! Да-а-а!»).

ВАЖНО: эмоция есть у КАЖДОЙ фразы — состояния «без эмоции» не бывает, даже
у наррации-наблюдения («Он хлопнул себя по бёдрам» → «Curiously observing»).
Промпт разметки требует инструкцию диктора всегда: `none` запрещён, пустой
ответ → DEFAULT_EMO; тон покрывает 100% фраз (68 181 запись POT).
Проверено 2026-09-03: официальные параметры модели + пофразовая эмоция из POT
дают чистую генерацию без артефактов.

```bash
node tools/generate/scripts/voice_batch.mts --char Sarah --emotion "In a burst of passion, crying out with joy and ecstasy" --emotion-tag passion --limit 10
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
# Вся TS-матрица (из корня репы; скиллы + пайплайн + scripts/):
node --test $(find .opencode/skills patches/ai-voice-pack/tools scripts -name "*.test.mts" -not -path "*/node_modules/*")
# Гард сборки — pytest только для остатка python (voicekit/voice_ctl/build):
cd patches/ai-voice-pack && python -m pytest tests/ -v
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

- 256K контекст, vision (Text+Image), thinking-режим. **ВЫКЛЮЧАТЬ thinking в
  API ТОЛЬКО полем `"reasoning_effort": "none"`** (проверено 2026-10-26:
  `think:false`, `enable_thinking:false` в top-level и в
  `chat_template_kwargs`, `reasoning:{effort}` — НЕ гасят, model копит
  reasoning и возвращает пустой `content` с `finish=length`);
- модели лежат в `~/.lmstudio/models/` (есть также mimo-v2.6-distill-9b,
  deepseek-r1-qwen3-8b, nomic-embedding); новая — `lms get <имя>` + строка
  в `models` провайдера `~/.config/opencode/opencode.json`;
- `qwen3.5:27b` (17–20 ГБ) в 16 ГБ VRAM не влезает целиком — не ставить;
- **`emotion_tag.mts --llm-url` зовёт OpenAI-compatible `/v1/chat/completions`
  (порт 2026-10-22, заменил ollama `/api/generate`) — работает и с LM Studio
  (`http://127.0.0.1:1234`), и с ollama (`http://127.0.0.1:11434`); модель —
  `--llm-model` (по умолчанию phi4-mini; для LM Studio — `qwen/qwen3.5-9b`).

### Подключение к opencode

`~/.config/opencode/opencode.json` — провайдер `lmstudio-local`
(openai-compatible, baseURL **http://127.0.0.1:1234/v1** — именно 127.0.0.1,
не localhost!). Модель: qwen/qwen3.5-9b. Выбор в TUI: `/models` (или
Shift+Tab) → LM Studio Local → qwen/qwen3.5-9b.

ВАЖНО (грабли 2026-09-04): если провайдера НЕТ в списке моделей — проверь
`~/.config/opencode/opencode.jsonc` (грузится поверх opencode.json и
ПЕРЕКРЫВАЕТ его): там может быть `disabled_providers: ["lmstudio-local", ...]`
и мусорные провайдеры с битым baseURL — удали их. Правка конфига применяется
БЕЗ перезапуска (OpenCode слушает файлы и перезагружает провайдеров/скиллы;
`cli.json` — так же). Если что-то «не подхватилось» — `/reload` (принудительная
перезагрузка), перезапуск не нужен.

### История смены стека (2026-09..2026-10)

1. AMD RX 6600 XT + ollama/Vulkan: 39 tok/s, после каждого ребута — двойной
   клик `start-ollama-vulkan.cmd`; старый Adrenalin → 2.6 tok/s.
2. 2026-10-22: машина на RTX 5070 Ti/CUDA; ollama v0.40.8 установлена и В
   ТОТ ЖЕ ДЕНЬ удалена (владелец выбрал LM Studio): пакет, автозагрузка,
   `~/.ollama`, env `OLLAMA_KEEP_ALIVE` — вычищены; скрипт
   `start-ollama-vulkan.cmd` удалён. Правило «127.0.0.1 вместо localhost» —
   из той же истории, оставлено.

### GPU для CosyVoice: DirectML НЕ работает (2026-09-04, опыт AMD)

**Актуально:** CosyVoice идёт на **CUDA** — `voice_batch.mts --device cuda`
(fp16, rtf ~3 против ~8 на CPU).

DirectML на AMD RX 6600 XT проверен и отклонён, причины:

- OOM посреди генерации, даже при свободной VRAM (DirectML не читает память RDNA2);
- CPU-fallback части операций → первый токен 40 с, ускорения нет;
- баг бэкенда: 3D-`concat` с пустым тензором падает.

**Итог: `voice_batch.mts --device dml` НЕ использовать** (не доделан, OOM).
Единственный простой GPU-путь — NVIDIA CUDA; для AMD был бы WSL2+ROCm
(не делали). Откат установлен: `torch==2.3.1` CPU-only, torch-directml удалён.

В коде CosyVoice остались безвредные патчи под env-гейтом `TSSR_DML=1`
(активны только при `--device dml`): `device`/`map_location`, one-hot вместо
`weight[idx]`, concat без пустых тензоров, identity-декораторы, fp16.
CPU-режим (по умолчанию) не затронут.

## Статус

- **Озвучка 100 % — 134 534 / 134 534** (RU + EN, все 19 арок; 2026-10-18,
  очереди завершены штатно). Пройдено: пилот → все основные пути → все арки → EN.
- Осталось: ушная выборка качества и финальный релиз/анонс.

## Решённые вопросы (архив решений)

- EN-рефы голосов — **не нужны**: EN-озвучка 100 % на тех же рефах (2026-10-18).
- WAV vs OGG — **Opus 24k mono** (2026-10-13; `tasks/archive/2026-10-12-audio-compression-research.md`, `tasks/archive/2026-10-13-opus-migration.md`).
- Нет файла озвучки — **молчание**, без крашей (README FAQ, строка `voice.missing`).
