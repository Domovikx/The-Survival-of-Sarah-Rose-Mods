# [2026-10-21] Перевод пайплайна озвучки на TS: python остаётся только инференс-шимом

Статус: DOING (2026-10-22: инференс-шим + клиент + оркестратор ГОТОВЫ и протестированы, см. «Прогресс» внизу)

## Задача от пользователя

«желательно перейти с питона на TS» (2026-10-21, на фоне перенастройки пайплайна под новую
видеокарту RTX 5070 Ti). Ранее тем же днём: «оформи задачу и давай выпиливать. хочется уже
плавно избавляться от легаси» — в рамках этой же задачи закрывается port catalog/ и остатки
python-тулов.

## Цель

Когда хочется: держать весь оркестрейшен пайплайна озвучки на TypeScript
(`.mts` + `node --test`, прецедент: potgen/prefill/add_candidate/clean_refs/cast_contract уже
на TS), а python оставить ТОЛЬКО как тонкий инференс-шим вокруг CosyVoice/Qwen (torch в node
не существует — это граница, а не выбор). Критерий «стало лучше»: одна команда
`npm run voice:...` ведёт от каталога до opus, python-файлов вне одного шима не остаётся,
легаси-тулы (convert-цепочка уже удалена 2026-10-21) больше не плодятся.

## Контекст (что есть сейчас)

Проверено 2026-10-21:

- python-тулы в `patches/ai-voice-pack/tools/generate/scripts/`:
  `voice_batch.py` (генерация: каталог → CosyVoice → ffmpeg opus; ~500 строк),
  `voice_catalog.py` (tl+script.rpy → voices.jsonl/label_arc.json),
  `voice_sync.py` (актуализация/отчёты), `voice_status.py` (статус/прогноз),
  `voice_manage.py` (список/выбор варианта рефа), `emotion_tag.py` (разметка тона →
  emotions.json через LLM), `voice_design.py` (VoiceDesign-генерация кандидатов),
  `voice_ctl.py` (пульт очередями, Windows stdlib, пауза = NtSuspendProcess через ctypes),
  `levelnorm.py` (LOUD_ARGS импортируют beastify и voice_batch — не легаси!),
  `trim_tail_burst.py`, `voice_preview.py`, `beastify.py`, `voice_queue.sh` (bash).
- Уже на TS (`.opencode/skills/renpy-po/` + `tools/generate/scripts/`): potgen, po_core,
  po_update, prefill, add_candidate, clean_refs, cast_contract, config (voice_presets.mts).
- Инференс: CosyVoice3 (`C:\tools\cosyvoice3\.venv`, python 3.10) и Qwen3-TTS VoiceDesign
  (pinokio-venv) — оба чисто python, torch 2.3.1+cpu → для RTX 5070 Ti (Blackwell sm_120)
  ставится torch 2.7.0+cu128 (первая версия с официальной поддержкой Blackwell,
  pytorch.org/blog/pytorch-2-7; драйвер локально 621.01/CUDA 13.5 — требование 570+ закрыто).
- `CosyVoice/cosyvoice/cli/model.py:36` device выбирается АВТОМАТИЧЕСКИ
  (`cuda if torch.cuda.is_available()`) — шиму не нужен флаг устройства, нужен только torch
  с CUDA.
- `voice_batch.py` уже получил промежуточный `--device cuda` (2026-10-21) — как мост для
  проверки GPU до порта.
- Инцидент-защита: e2e potgen байт-в-байт требует `catalog/emotions.json`; каталог
  НЕ удалять до порта источника тона (см. «Связи»).
- `voice_ctl.py` паузит воркеры через `NtSuspendProcess` (ctypes) — у TS нет встроенного
  suspend; нужен выбор механизма (см. ресёрч).

## Что сделать (ресёрч, по протоколу `tasks/AGENT.md`)

1. Протокол шима (вопрос): stdin/stdout JSON-lines процесс vs локальный HTTP-сервер на
   127.0.0.1 vs импорт python-модуля из TS. Критерии: модель грузится ОДИН раз на батч
   (68k фраз, reload на каждый вызов = +40 с × 68k — reject), надёжность при обрыве,
   простота дебага, возможность держать 2 процесса (ru/en) параллельно.
2. Тонкий `cosyworker.py` (единственный оставшийся python): загрузка AutoModel
   (`--device cuda`, fp16), приём заданий {text, ref_wav, emotion, seed, out_path},
   генерация, ffmpeg-opus pipe (или отдаёт wav-TS'у — финальный opus собирает TS?).
3. Порты оркестраторов `.mts` (порядок по возрастанию риска): `voice_status` →
   `voice_manage` → `voice_sync` (+ отчёты в tmp, см. задачу catalog-removal) →
   `emotion_tag` (LLM-вызовы через ollama HTTP — в TS это fetch) → `voice_design`
   (второй шим Qwen или тот же процесс) → `voice_batch`-оркестратор поверх шима.
4. `voice_ctl`/`voice-start.cmd`: очереди/приоритет/детач на TS (node) вместо python stdlib;
   пауза — кооперативные маркеры (файлы pause/stop, как сейчас) вместо NtSuspendProcess,
   либо powershell Suspend-Process — сравнить в ресёрче.
5. ffmpeg-цепочки (opus 24k mono, loudnorm -16/TP -1.5, trim_tail): порт через child_process
   (прецедент: clean_refs.mts уже гоняет ffmpeg).
6. Тесты: `node --test` на каждый новый .mts; кросс-проверка чисел статуса TS vs python на
   одних данных (один раз, на этапе переключения).

## Приёмка

- [ ] Генерация на GPU через TS-команду: `npm run voice:generate -- --char <Имя> --limit 3`
      пишет opus 24k mono, длительность > 0, loudness -16 LUFS ±1 (замер ffmpeg), лог содержит
      имя GPU (CUDA) и «model loaded» ровно один раз на прогон.
- [ ] В `tools/generate/` вне шима не осталось ни одного рабочего `.py` (grep-список в
      «Файлы» вычеркнут); `voice_queue.sh` заменён.
- [ ] `npm run voice:status -- ru` выводит те же сводные числа, что
      `python voice_status.py ru` на том же дереве (сверка одним прогоном, результат в задачу).
- [ ] Пауза/стоп/возобновление через пульт работают без python (кооперативные маркеры);
      потерянные воркеры не остаются (проверка: старт → пауза → резюме → стоп, процессов нет).
- [ ] `node --test` по новым .mts зелёные; pytest по заменённым python-тестам удалён вместе
      с кодом; ни одного коммита без разрешения владельца.

## Вне рамок

- Перенос самого инференса CosyVoice/Qwen в TS (невозможно без torch) — шим остаётся python.
- Правка внешнего кода моделей (правило инкапсуляции: чужой код не трогаем).
- Смена форматов/параметров звука (opus 24k, -16 LUFS — контракт не меняется).
- Удаление catalog/ (отдельная задача, зависимость: источник тона).

## Файлы (ожидаемые)

- `patches/ai-voice-pack/tools/generate/inference/cosyworker.py` — единственный python (шим).
- `patches/ai-voice-pack/tools/generate/scripts/voicekit/` — ядро TS: paths/catalog(fs)/worker-клиент.
- `patches/ai-voice-pack/tools/generate/scripts/voice_{batch,status,sync,manage,design}.mts` + npm-скрипты.
- `patches/ai-voice-pack/tools/generate/scripts/voice_ctl.mts` (+ новые voice-*.cmd → node).
- `tests/` (python) — сокращаются до shim-тестов или удаляются; появляются `*.test.mts`.

## Связи

- `tasks/2026-10-21-catalog-legacy-removal.md` — port catalog/ (источник тона в po/,
  рантайм-файлы, отчёты в tmp); порядок: сначала TS-порт (эта задача), потом выпиливание каталога.
- GPU-миграция 2026-10-21: torch 2.7.0+cu128 для sm_120 (RTX 5070 Ti), `--device cuda`
  в voice_batch.py как мост. Первый GPU-прогон замерен 2026-10-21: model load 12.7s,
  rtf 3.16 (6.6с речи / ~21с; CPU-й был ~8) — шим должен держать модель загруженной
  один раз на весь батч, это главный источник выигрыша.
- AGENTS.md («Новый код — только .mts») — эта задача закрепляет его для озвучки.
