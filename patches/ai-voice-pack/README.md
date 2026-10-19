# AI Voice Pack — карта каталогов патча

Патч озвучки TSSR: рантайм-мод для игры + пайплайн генерации голосов.
Глубокие правила — в `AGENTS.md` в корне репы (разделы «Структура»,
«Границы приёмочной установки», «Dev-сторона»).

## Что уезжает в дистрибутив

Установочная папка `mods/tssr-ai-voice-pack/` собирается build'ом как КОПИЯ
ДЕРЕВА этого каталога — зеркало установки (2026-10-19: корень патча = корень
папки мода, arcname = относительный путь; тесты не дают вернуться «карте
путей» — новый файл в репе попадает в дистрибутив сам):

- `zzz_ui.rpy`, `zzz_update_check.rpy`, `voice_config.rpy`, `fonts/`, `images/`,
  `tl/` → такие же пути в папке мода (`.rpyc` не шиппится — см. ниже);
- `catalog/` → `catalog/` (в дистрибутив уезжают ТОЛЬКО runtime-мапы
  `voice_list.json`, `label_arc.json` — allowlist в build_pack);
- `audio/vo_<lang>/` → `ai_voice/<lang>/` (массив озвучки, отдельный voice-zip).

Сборка: `python patches/ai-voice-pack/tools/build/build_pack.py` →
`dist/*.zip` (main + voice-ru + voice-en). Раскладка zip = раскладка
установки: распаковка в корень игры, удаление мода = удалить одну папку.

## Что dev-only (в зип не уезжает)

- `tools/build/` — сборка дистрибутива (`build_pack.py`);
- `tools/generate/scripts/` — весь пайплайн:
  - `voicekit/` — ядро: `paths.py` (ЕДИНСТВЕННОЕ место с путями),
    `catalog.py`, `contract.py`, `config.py`, `fs.py`;
  - `voice_ctl.py` + `voice-*.cmd` — пульт очередями (статус/старт/пауза);
  - `voice_batch.py`, `voice_queue.sh` — генерация (resumable, низкий
    приоритет, старт только через пульт);
  - `voice_status/sync/manage/preview/...` — статус, каталог, отчёты;
  - `shots_capture.ps1` + `zz_capture.rpy` — съёмка UI для лендинга;
- `tools/generate/voice_candidates/` — касты рефов (yaml + wav + сырьё);
- `tools/generate/output/` — логи и стейты пайплайна (не коммитятся);
- `tests/` — pytest: `python -m pytest patches/ai-voice-pack/tests/ -q`.

## Правила

- Пути в скриптах — только через `voicekit/paths.py` (хардкод запрещён);
  в `.rpy` запрещён `__file__` — охраняют страж-тесты.
- `.rpyc` не коммитятся и не шиппятся: двойной источник правды
  (rpy + rpyc) = тихая рассинхронизация; движок компилирует при первом
  запуске.
- Артефакты тестов и съёмок — только в репу (`tmp/` в `.gitignore`);
  в папку игры не пишется ничего вне `mods/` (см. AGENTS, «Границы
  приёмочной установки»).
