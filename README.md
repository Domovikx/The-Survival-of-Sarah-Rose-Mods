# The Survival of Sarah Rose — AI Voice Pack & Localization (unofficial patch)

Fan-made **localization into 11 languages** and an **AI voice-over** (demo scope) for
**The Survival of Sarah Rose** (Ren'Py, Steam). The patch adds only its own folder to
the game — no game files are touched or redistributed.

|                            |                                                               |
| -------------------------- | ------------------------------------------------------------- |
| **Landing (presentation)** | <https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/> |
| **Downloads (only here)**  | <https://www.nexusmods.com/mods/1?game_id=11043>              |
| **Vortex game extension**  | <https://www.nexusmods.com/site/mods/2600>                    |
| **License**                | [CC BY-NC 4.0](LICENSE) — non-commercial, attribution, 18+    |

## What you get

- **Text** — 11 languages: `en zh ru es pt de ja fr pl ko it`. Russian — the whole story; the other 10 — the demo scope (intro up to the first choice).
- **Voice** — AI voice acting (synthetic, cloned voices) for the demo scope — **all 11 languages**, 1 195 lines each (Russian 1 397). 77 distinct voices, emotion matched to the scene.
- **Fonts** — Literata + Noto CJK subsets (SIL OFL), shipped with the core pack so the translated text renders correctly.
- **Format** — Opus 24 kbps mono — a voice pack is 15–21 MB per language.

Everything lives in `mods/tssr-ai-voice-pack/` plus one service file
`environment.txt` in the game root (the engine's search-path contract), so other
mods keep working. Uninstall = delete that folder and the file.

## Install

Downloads are on **Nexus Mods** — pick `main` (required) and any voice packs.

### Manual (no mod manager)

1. Unpack `TSSR-AI-Voice-Pack-main.7z` into the game folder (the one with
   `TheSurvivalofSarahRose.exe`). You should get `mods/tssr-ai-voice-pack/` and
   `environment.txt`.
2. Unpack the voice packs the same way (each adds `ai_voice/<lang>/`).
3. Launch the game → main menu → **Sarah Rose — AI voice & localization** → choose
   the language, toggle the voice.

### Vortex

1. Install the game extension once — [Modding Tools → Vortex Extensions](https://www.nexusmods.com/site/mods/2600)
   (Vortex picks it up automatically; it is not in the game catalogue).
2. Vortex → Mods → **Install from file** → `main` first, then the voice packs.
   The archives ship a FOMOD installer, so files land in the right place.

Close the game before installing — it locks mod files.

## Requirements

- A **purchased copy** of The Survival of Sarah Rose (Steam, Ren'Py 7.4.11).
- Windows (the patch targets the Steam build).
- **Back up your saves** — the game has no Steam Cloud for this title.

## Legal notice

- **Unofficial fan work.** Not affiliated with, endorsed by, or connected to the
  developers or publishers. All rights to the game and its assets belong to their
  holders.
- **AI-generated content.** Every voice line is synthetic; quality and emotional
  accuracy may vary, any resemblance to real voices is coincidental. Translations are
  machine-aided and human-reviewed.
- **Adult content (18+).** The game and the patch contain explicit adult material.
- **"As is", no warranty.** Use at your own risk.
- **Free mods.** The patch is and stays free; donations never gate access to files or
  updates.

Full text, the 18+ notice and disclaimers (English + Русский) — in [`LICENSE`](LICENSE).

## For developers

This repository is the source of truth for the patch (the site is a landing, the
downloads live on Nexus).

- **patches/ai-voice-pack/** — The patch itself (mirror of the installed folder): mod menu, fonts, translations.
- **patches/ai-voice-pack/po/** — Translation sources: `template.pot` (extracted from the game) + one `.po` per language.
- **patches/ai-voice-pack/audio/** — Generated voice lines per language (`<uid>__<voice>.opus`).
- **patches/ai-voice-pack/casts/** — Voice contracts (character descriptions) and reference clips.
- **patches/ai-voice-pack/tools/** — Pipeline: extract → generate → build → deploy (TypeScript).
- **patches/ai-voice-pack/vortex-extension/** — Vortex game extension sources (game detection, FOMOD deployment).
- **site/** — Landing (Vite + React), deployed to GitHub Pages.
- **.opencode/skills/** — Project tooling: translation, CDP browser automation, Nexus publishing.
- **docs/** — Vortex/Nexus model, distribution ledger, decisions.

Pipeline in short: text is extracted from the game into `template.pot`, translated
into `po/<lang>.po`, voiced per line (uid = md5 of the English line) by VoxCPM2, then
packed into `.7z` with a FOMOD installer (`npm run build:pack`). Everything is
TypeScript except the model inference itself.

```bash
npm run build:pack        # build dist/*.7z (main + voice packs)
npm run potgen            # regenerate po/template.pot from the game
npm run po:update         # sync po/<lang>.po with the new template
npm run po:check          # integrity check of the po files
npm run typecheck         # TypeScript across the repo and the site
node --test $(find .opencode/skills patches/ai-voice-pack/tools -name "*.test.mts")
```

Contributor/maintainer notes: [`AGENTS.md`](AGENTS.md).

---

# Русская версия (кратко)

Фанатский патч: **перевод на 11 языков** и **AI-озвучка** (демо-скоуп — вступление
до первого выбора) для **The Survival of Sarah Rose**.

|                           |                                                               |
| ------------------------- | ------------------------------------------------------------- |
| Лендинг                   | <https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/> |
| Скачать                   | <https://www.nexusmods.com/mods/1?game_id=11043>              |
| **Расширение для Vortex** | <https://www.nexusmods.com/site/mods/2600>                    |

- **Текст:** русский — полностью; остальные 10 языков — демо-скоуп.
- **Озвучка:** все 11 языков, по 1 195 реплик (в русском — 1 397), 77 голосов,
  эмоция под сцену, Opus 24 кбит/с (15–21 МБ на язык).
- **Установка:** скачать на Nexus → распаковать `main.7z` в папку игры (где
  `TheSurvivalofSarahRose.exe`) → так же распаковать голосовые пакеты → в игре
  открыть меню мода (бейдж справа сверху) и выбрать язык. Через Vortex: один раз
  поставить расширение игры, затем «Install from file».
- **Нужна купленная игра.** Патч добавляет только `mods/tssr-ai-voice-pack/` и
  `environment.txt`; удаление = удалить их. Сделайте резервную копию сохранений.
- **18+**, неофициальная работа, «как есть», бесплатно (CC BY-NC 4.0).
