# [2026-10-24] Ресёрч: инвентаризация python — список миграции на TS vs выпиливание протухшего

Статус: DONE (2026-11-01: ресёрч проведён, вердикты применены владельцем)

## Задача от пользователя

«отдельной задачей надо проверит возможно что задача уже есть это миграция с питона на TS ,
можно сделать ресерч по репозиторию и подготовить список дла миграции или же полного
выпиливания протухшего. возможно уже чтото похожее в тасках было ранее.»

## Цель

Когда питон-легаси мигрировал порциями, я хочу полную инвентаризацию всех `.py` репозитория
с вердиктом по каждому (мигрировать на TS / выпилить как протухшее / оставить python осознанно),
чтобы не держать в дереве мёртвые дубликаты уже портированных тулов и чтобы следующий шаг
миграции был списком, а не пересчётом файлов. Критерий «стало лучше»: в файле задачи лежит
закрытый список по каждому файлу с причиной и ссылкой-подтверждением; протухшее удалено
(или явно помечено «оставить» с причиной); повторного «а что тут осталось?» не возникает.

## Контекст (что есть сейчас)

Проверено 2026-10-24:

- **Похожая задача УЖЕ ЕСТЬ**: `tasks/2026-10-21-voice-pipeline-ts-migration.md` (DOING) —
  основная миграция пайплайна. Уже сделано: портированы и python удалены `voice_batch`,
  `voice_catalog`, `voice_manage`, `voice_sync`, `voice_status`, `voice_preview`,
  `emotion_tag`, `voice_design_watch` (коммиты `d38220194`, `e96eeab19`). Её «Осталось»:
  порт `voice_ctl.mts` + очереди (bash `voice_queue.sh`). Эта задача — НЕ дубликат: она
  закрывает инвентаризацию всего остального (категории «выпилить» и «осознанно оставить»),
  которую 2026-10-21 не закрывала.
- **Pриказ владельца на миграцию** — AGENTS.md «Миграция python → TypeScript»: новый код
  только `.mts`, python живёт только там, где физически не обойтись (torch/CV3-инференс);
  оставшиеся python-утилиты в таблице помечены «CLI-легаси (на вымирание)».

Инвентарь (только дерево `patches/`, `tmp/` не считаем; скобки — строки; ссылки проверены
grep'ом по package.json/.cmd/.mts/скиллам/докам):

Группа А — python-инференс (контракт AGENTS, трогать только отдельным решением):

- `cosyworker.py` (245) — инференс CosyVoice, единственный; импортирует
  `voicekit {config, tts_env, cv3}`; на него ссылается весь TS-контур генерации
  (`voice_batch.mts`, `voicekit/worker|audio|trim|fake_worker`, e2e-тесты).
- `voice_design.py` (292) — инференс Qwen3-TTS VoiceDesign (pinokio-venv);
  ссылки: скилл `tssr-voice-design`, `cast_contract.mts`, AGENTS.
- `voicekit/` python-шимы: `paths` (импортят `voice_ctl`, `voice_autocommit`,
  `gen_ui_round`, `voice_design`), `config` (`cosyworker`, `beastify`, `levelnorm`,
  `voice_design`), `tts_env` (`cosyworker`, `model_dir`, `voice_design`), `cv3`
  (`cosyworker`), `model_dir` (упомянут в AGENTS), `__init__` (13).
  НО: у `voicekit/contract.py` (94) и `voicekit/fs.py` (63) импортёров НЕ найдено —
  возможно протухли (вопрос ресёрча).

Группа Б — живое вне инференса, кандидаты на миграцию/решение:

- `voice_ctl.py` (653) — пульт: на него ссылаются 9 `.cmd` (voice-start/stop/pause/
  resume/status/watch/soft-stop/sched-start) + `thermal_guard.py`; уже в «Осталось»
  задачи 2026-10-21 (порт voice_ctl.mts).
- `build_pack.py` (232) — сборка дистрибутива: `npm run build:pack`, ссылки
  `catalog_gen.mts`, AGENTS, задачи 2026-10-22/23.
- `thermal_guard.py` (379) — `thermal-guard.cmd` (единственная ссылка).
- `voice_push_chunked.py` (334) — чанкованный пуш истории в origin (гигабайты wav,
  таймауты): `voice-push-night.cmd`, `voice-push-sched.cmd`.
- `voice_autocommit.py` (198) — автокоммит untracked `audio/` пачками ~1000 («add voices»,
  без пуша): `voice-autocommit.cmd`. ⚠ ВНИМАНИЕ: это автоматический git-коммит, а в AGENTS.md
  жёсткое правило «коммитить только с явного разрешения» — выяснить, живо ли расписание и
  не конфликтует ли с правилом (см. вопросы).
- `shots_for_site.py` (96) — конвертация скриншотов в `site/public/shots`:
  `shots_capture.ps1`, AGENTS, скилл `tssr-update-pipeline`.
- `read_persistent.py` (73) — читает persistent-скриншоты: `shots_capture.ps1`.
- `gen_ui_round.py` (88) — stdlib-генератор 9-slice «пилюль» `images/ui/round*.png`
  (скругление кнопок для Ren'Py 7.4); нигде кроме pycache не упоминается — одноразовый?

Группа В — кандидаты на полное выпиливание (дубликаты уже портированного / мусор):

- `trim_tail_burst.py` (221) — алгоритм ПОРТИРОВАН в `voicekit/trim.mts`
  (+ `trim.test.mts`); в доках остался только как «CLI-легаси», ссылки — скиллы/AGENTS/tasks.
- `levelnorm.py` (123) — loudnorm-цепочка в генерации уже в `voicekit/audio.mts`
  (AGENTS: «в генерации те же LOUD_ARGS применяет voicekit/audio.mts»).
- `beastify.py` (149) — нелюдские пресеты; в `voice_presets.mts` есть секция `beastify` —
  выяснить, кто его ЗОВЕТ сейчас (если никто — протух).
- `gen_ui_round.py` (88) — если `round*.png` уже сгенерированы и не перегенерируются.
- `voicekit/contract.py` (94) — `cast_contract.mts` уже есть на TS.
- `output/voice/wake_at_23.py` (45) — артефакт в `output/` (не упоминается нигде).
- `__pycache__/` в дереве — мусор (проверить gitignore/почистить).
- 22 pytest-файла в `patches/ai-voice-pack/tests/` — судьба следует модулям
  (`conftest`, `test_build_layout`, `test_model_dir`, `test_thermal_guard`,
  `test_voice_ctl`, `test_voice_push_chunked`, `test_voice_autocommit`,
  `test_voice_config`, `test_cast_texts`...).

Примечания:

- `voice_queue.sh` — bash, не python, но та же повестка «что осталось» (вне рамок этой
  задачи, лежит в 2026-10-21).
- `tmp/head_baseline/` — снапшот HEAD для renpy-audit, не рабочее дерево; `tmp/*.py` —
  одноразовые болванки ресёрчей. Не трогаем.

## Что сделать (ресёрч, по протоколу `tasks/AGENT.md`)

1. Вопросы ресёрча (по каждому — вердикт «мигрировать / выпилить / оставить» + доказательство):
   - Группа В: `trim_tail_burst`, `levelnorm`, `voicekit/contract`, `voicekit/fs` —
     точно ли нет живых вызывателей (grep по репе + скиллам + `.cmd` + AGENTS)? Если только
     доки — выпилить и поправить доки. Порт нужен или дубликат просто удаляется?
   - `beastify.py`: кто запускает на текущем пайплайне (`voice_batch.mts` → ?); есть ли
     в корпусе озвученные нелюдские персонажи, которым пресет нужен. Выпил = отказ от фичи?
   - `gen_ui_round.py`: `images/ui/round*.png` реально лежат в репе и не менялись с
     генерации? Если да — выпилить (или оставить как арт-тул с пометкой).
   - `voice_autocommit.py` + `voice-push-*.cmd`: живы ли расписания (schtasks/autostart)?
     Как правило «коммит только с разрешения» соотносится с автокоммитом `audio/` —
     если конфликтует: решение владельца (оставить как осознанный例外 / выпилить).
   - Группа Б на миграцию: `voice_ctl` уже в плане 2026-10-21 — подтвердить, что эта
     инвентаризация НЕ раздувает тот объём; `build_pack.py` (232) — мигрировать на TS или
     оставить (zip-сборка, pytest-гарды)? `thermal_guard` (379, Win-специфика?) — есть ли
     TS-путь? `shots_for_site`/`read_persistent` — stdlib-конвертация, мигрировать?
   - pytest-файлы: какие тесты сопровождают удаляемые модули (сразу вместе), какие —
     остаются (`test_build_layout` — гард сборки, живёт после выпила python?).
2. Вебсёрч не требуется (внутренняя инвентаризация); прецедент — паттерн «CLI-легаси» из
   AGENTS.md и порядок портов 2026-10-22 (портировалось по возрастанию риска).
3. Применение (удаления/порты) — по вердиктам списка, каждый шаг отдельным коммитом и
   ТОЛЬКО после явного разрешения владельца; сначала список → решение → код.

## Приёмка

- [ ] В файле задачи «Журнал решения»: закрытый список КАЖДОГО `.py` из дерева `patches/`
      (кроме группы А, у неё вердикт «оставить») с одной из трёх пометок и причиной/ссылкой
      (`файл:строка` или «grep по X — вызывателей нет»).
- [ ] Проверено и записано: живы ли расписания `voice-push-*.cmd`/`voice-autocommit.cmd`
      (факт: schtasks/autostart или «не найдено») и вердикт владельца по автокоммиту.
- [ ] Выпиленное удалено, доки/скиллы, где оно упоминалось, поправлены (grep по имени
      удалённого файла даёт 0 пустых упоминаний, кроме истории задач).
- [ ] Регресс: `node --test` (вся матрица) зелёный; pytest — зелёный или уменьшен
      синхронно с удалёнными модулями (без «pre-existing failures»); `npm run build:pack`
      проходит.
- [ ] Edge-case: если выпилить `beastify`/`gen_ui_round` — явно записано, что теряется
      (фича/перегенерация) и как вернуть (git-история).
- [ ] Итог дописан в журнал, статус — DONE; строка в `tasks/README.md` обновлена.

## Вне рамок (out of scope)

- Группа А (`cosyworker`, `voice_design`, `voicekit/*` под инференс) — НЕ удаляется и не
  мигрируется в этой задаче (torch — граница по AGENTS; расширение = отдельная задача).
- `voice_ctl.mts` + `voice_queue.sh` — объём задачи 2026-10-21, здесь только инвентаризация.
- `tmp/` (head_baseline, болванки) — не трогаем.
- Коммиты и любые удаления без явного разрешения владельца — запрещены.
- Правила перевода UI (задача 2026-10-24-ui-menu-translation-quality) — не влезать.

## Файлы (ожидаемые)

- `tasks/2026-10-24-python-ts-inventory.md` — журнал решения (этот файл).
- Возможные удаления `.py`/тестов — по вердиктам (отдельные коммиты, с разрешения).
- `tasks/README.md` — статус → DONE в конце.

## Журнал решения (ресёрч выполнен 2026-11-01)

Вердикты по КАЖДОМУ `.py` дерева `patches/` (греп вызывателей по .mts/.cmd/.ps1/.sh/
package.json/скиллам; импортёры — по `grep "^from|^import"`):

**Группа A — оставить python (torch/инференс; граница AGENTS):**

- `cosyworker.py` — инференс CosyVoice; вызыватели: voicekit/worker.mts (шим).
- `voxcpmworker.py` — **НОВЫЙ с инвентаризации** (2026-10-30): инференс VoxCPM2,
  вызыватель voxcpm_bench.mts. Тот же класс, что cosyworker.
- `voice_design.py` — инференс Qwen3-TTS; импортит `voicekit {paths, tts_env}`.
- `asr_refs.py` — **НОВЫЙ с инвентаризации**: ASR-транскрипты рефов для
  `voxcpm_bench --hifi` (whisper-инференс). Тот же класс.
- `voicekit/{__init__,config,cv3,model_dir,paths,tts_env}` — шимы инференса
  (config: cosyworker/voice_design; cv3: cosyworker; tts_env: cosyworker/model_dir/
  voice_design; paths: voice_design/voice_autocommit; model_dir: гард test_model_dir).

**Группа В — удалить (мёртвое/дубликаты портированного), НУЖЕН ОДИН «да» владельца:**

- `trim_tail_burst.py` (221) — алгоритм портирован в `voicekit/trim.mts`
  (trim.test.mts — тест-паритет); живых вызовов НЕТ, только доки («CLI-легаси»).
- `levelnorm.py` (123) — паритет в `voicekit/audio.mts` (normalizeWav/LOUD_ARGS);
  живых вызовов НЕТ.
- `voicekit/contract.py` (94) — импортёров НЕТ; зеркало `cast.types.mts`/`cast_contract.mts`.
- `voicekit/fs.py` (63) — импортёров НЕТ (TS-контур использует node:fs).
- `output/voice/wake_at_23.py` (45) — 0 ссылок (артефакт; имя жило в
  schtasks-истории, сейчас планировщик зовёт installed voice-sched-start.cmd).
- `gen_ui_round.py` (88) — 0 ссылок; `images/ui/round*.png` (4 шт.) лежат в репе
  с 2026-10 (зеркальный коммит 7b57b65cd). Потеря: перегенерация 9-slice пилюль —
  вернуть из git-истории, если понадобится.

**Группа Б — живое, решение владельца (мигрировать/оставить):**

- `beastify.py` (149) — нелюдские пресеты; в КОДЕ живых вызовов НЕТ (греп
  beastify.py по .mts/.sh/.cmd пуст), пресет-конфиг живёт в `voice_presets.mts`
  (секция beastify). Озвученные beast-касты (King-On-The-Outside, Voidling)
  уже имеют рефы. Предложение: **удалить** (YAGNI; фича возвращается из
  git при новом нелюдском касте, тогда же — TS-порт).
- `voice_autocommit.py` (198) + `voice_push_chunked.py` (334) — расписания
  МЕРТВЫ: schtasks TSSR-VoicePush/TSSR-VoiceStart — One Time Only от 12.10,
  Next Run N/A. ⚠ **ЖИВОЙ НАХОД: TSSR-voice-23 (Daily 23:00, Enabled) падает**
  (Last Run 31.10, Last Result 1) — зовёт УСТАРЕВШУЮ установленную копию
  `<игра>/tools/voice-sched-start.cmd` (пульт с 30.10 перевешан на node,
  установленная копия не обновлялась). Решение владельцу: обновить installed
  .cmd переустановкой мода или удалить schtasks, если ночной автозапуск не нужен.
- `build_pack.py` (232) — `npm run build:pack`, pytest-гарды; работает.
  Порт на TS возможен (zip = node:zlib/archiver), но не срочен — предлагаю
  оставить до закрытия групп В и голосов.
- `thermal_guard.py` (379) — `thermal-guard.cmd` + `test_thermal_guard.py`;
  оставить (Win-специфика, живой защитник генерации) — кандидат на TS позже.
- `shots_for_site.py` (96) + `read_persistent.py` (73) — stdlib-конвертация
  скриншотов, зовутся из `shots_capture.ps1`; оставить (низкая ценность порта).

**pytest:** 7 файлов — судьба по модулям: `test_model_dir` (группа A — остаётся),
`test_build_layout` (гард сборки — остаётся), `test_voice_config` (рантайм-гард —
остаётся), `conftest` (остаётся); `test_thermal_guard`/`test_voice_autocommit`/
`test_voice_push_chunked` — по вердиктам владельца (вместе с модулями).

## Применение (2026-11-01, разрешение владельца получено)

- Удалены: `trim_tail_burst.py`, `levelnorm.py`, `voicekit/contract.py`,
  `voicekit/fs.py`, `wake_at_23.py`, `gen_ui_round.py`, `voice_autocommit.py`
  (+ `voice-autocommit.cmd`, `tests/test_voice_autocommit.py`).
- `beastify.py`: импорт `levelnorm` заменён встроенными константами
  (LOUD_I/TP/LRA из voicekit.config, дефолты -16/-1.5/11) — фича нелюдских
  голосов сохранена.
- `voicekit/__init__.py`: реэкспорт contract/fs убран.
- Новый гард `tests/test_python_leftovers.py`: удалённые не возвращаются,
  остаток .py компилируется, beastify-константы на месте, voicekit
  импортируется без contract/fs.
- Доки поправлены: AGENTS.md (дерево/таблица/тримминг/pytest-команда),
  tssr-voice SKILL.md, README.md, MOD.md, cast.types.mts.
- Schtasks владельца: TSSR-voice-23 (ночной, падал на несуществующем
  installed `.cmd`) + мёртвые TSSR-VoicePush/TSSR-VoiceStart — УДАЛЕНЫ
  (выбор владельца: старт озвучки вручную через пульт).
- Регресс: pytest **67 passed** (включая новый гард), node --test
  **546 pass / 0 fail / 5 skipped**, `npm run build:pack` — успешно.
- Оставлено осознанно: `beastify.py` (фича), `voice_push_chunked.py`
  (живой CLI, расписание мертво), `build_pack.py`/`thermal_guard.py`/
  `shots_for_site.py`/`read_persistent.py` (работают; TS-порт — низкий
  приоритет), вся группа A (torch-инференс + шимы).

## Связи

- `tasks/2026-10-21-voice-pipeline-ts-migration.md` — родительская задача миграции (DOING),
  её «Осталось» — voice_ctl/очереди; эта задача закрывает остальное.
- AGENTS.md, раздел «Миграция python → TypeScript» — приказ и границы.
- `tasks/archive/2026-10-22-catalog-legacy-removal.md` — прецедент выпила легаси-слоёв.
