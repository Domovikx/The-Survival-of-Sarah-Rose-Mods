# The Survival of Sarah Rose — AI Voice Pack + Russian Localization / Русификатор + AI-озвучка

[![Русский перевод](https://img.shields.io/badge/перевод-100%25-blue?style=flat-square)](patches/ai-voice-pack/tl/ru/)
[![Russian translation](https://img.shields.io/badge/translation-100%25-blue?style=flat-square)](patches/ai-voice-pack/tl/ru/)
[![Озвучка / Voice](https://img.shields.io/badge/voice-RU%2BEN-green?style=flat-square)](patches/ai-voice-pack/audio/)
[![Ren'Py](https://img.shields.io/badge/engine-Ren'Py%207.4.11-ff69b4?style=flat-square)](https://www.renpy.org/)
[![Steam](https://img.shields.io/badge/platform-Steam-1b2838?style=flat-square)](https://store.steampowered.com/)
[![License CC BY-NC 4.0](https://img.shields.io/badge/license-CC%20BY--NC%204.0-lightgrey?style=flat-square)](LICENSE)
[![18+](https://img.shields.io/badge/age-18%2B-red?style=flat-square)](#faq)
[![GitHub stars](https://img.shields.io/github/stars/Domovikx/The-Survival-of-Sarah-Rose-Mods?style=flat-square)](https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/Domovikx/The-Survival-of-Sarah-Rose-Mods?style=flat-square)](https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/commits/main)

**English · [Русский](#русская-версия)**

Full Russian fan translation + AI voice acting for the visual novel **The Survival of Sarah Rose** (Ren'Py, Steam).
Полный русский перевод + AI-озвучка визуальной новеллы **The Survival of Sarah Rose** (Ren'Py, Steam).

- 68 254 lines translated / 68 254 строки переведено
- AI voice pack in two languages (RU + EN) / AI-озвучка на двух языках (RU + EN)
- 75+ characters with cloned voices / 75+ персонажей с клонированными голосами
- Emotion-aware delivery / эмоциональная озвучка каждой реплики
- Free, open source, CC BY-NC 4.0 / бесплатно, открытый код

---

# English

[Download](#download) • [Installation](#installation) • [Voice pack](#voice-pack) • [Screenshots](#screenshots) • [FAQ](#faq)

## Features

- 🌐 **11 languages** — full localization: English, Russian, German, Spanish, French, Italian, Japanese, Korean, Polish, Portuguese, Chinese
- 🎙 **AI voice acting** — cloned voices for every main character; **demo scope: the opening arcs**, in RU, EN, DE, ES, FR, IT, JA
- 🎭 **Emotion-aware delivery** — every line carries the speaker's emotional state (anger, desire, whisper, sarcasm, ...)
- 🗣 **77 voices** — Sarah, Narrator, King Orwell, Kate, Thomas and dozens more
- 🔊 **Voice follows the language** — switch language in-game, the matching voice pack plays
- ⚙️ **Ren'Py 7.4.11** — works with the Steam version of the game

## Download

[**⬇ Releases**](https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases) — ready-to-install zips: `main.zip` (core) + per-language voice packs.

> **Files:** `TSSR-AI-Voice-Pack-main.zip` — core **without audio**: texts of 11 languages + all fonts (Literata + Noto CJK), ~47 MB. Voice packs `voice-{ru,en,de,es,fr,it,ja}.zip` are **separate downloads** (~17–23 MB each, demo scope). Without a voice pack the game is fully translated, just unvoiced.

## Installation

1. **Close the game.** Unpack `main.zip` anywhere and run **its** `install.cmd` — it finds the Steam game folder and installs the core (texts, fonts, menu).
2. **Voices — only the languages you want.** Unpack a voice zip anywhere and run **its own** `install.cmd` — it installs that one language; repeat for each pack. Without the core the voice installer asks you to install main first.
3. Manual alternative: unpack the zips into the game root (the folder with `TheSurvivalofSarahRose.exe`).
4. Launch the game → **Sarah Rose — AI voice & localization** button in the main menu → pick the language, toggle voice, adjust font sizes.

> First launch after installation may be slower (Ren'Py cache rebuild).

## Voice pack

The voice pack is generated with **CosyVoice3** (voice cloning) and covers both languages.
Lines are stored as **Opus 24 kbps mono** — ~16× smaller than the intermediate WAV
(24 kHz/16-bit mono, 384 kbps; measured: 20 914 MB of WAV → 1 307 MB of Opus):

- **7 languages voiced (demo scope)** — opening arcs, 1 195 lines each:
  RU, EN, DE, ES, FR, IT, JA — `ai_voice/<lang>/...`
- **Korean** in progress; **Polish / Portuguese / Chinese** — only the site demo phrases for now

- Voice lookup is automatic: `uid = md5(text)` → `ai_voice/{lang}/{arc}/{uid}__{speaker}.opus`
  (`.wav` remains a code-level fallback, but since 2026-10-14 `ai_voice/` is
  Opus-only — no `.wav` files ship)
- Every line has an emotion instruction (state of the narrator/speaker)
- Fallback: if a file is missing, the game plays silently (no crashes)

> ⚠ Voice packs are small (~17–23 MB each) — the demo scope, not the whole game yet.

## Contents

### Translated arcs (all 19)

Prologue, StoryBeginnings, WarriorPath, MagePath, UnionKingdom, HollowWorld, BlackMonolith, HassarPath, SailorPath, SailorArc, LifeInRahayal, VargaMarionPath, Training, PrisonArc, AlfredArc, DemonArc, WarArc, HyralArc, Other — **68 254 lines total**.

### Voiced characters (77)

Sarah, Narrator, King Orwell Rose, Kate, Thomas, Varga, Captain Belmont, Alaric, Carolyn, Marion, Kravel, Barion, Basilisk and many more — every character has a unique cloned voice with emotional delivery (demo arcs).

## Screenshots

![Main menu](site/public/shots/main_menu_english.jpg)
![Patch settings page](site/public/shots/language_settings_english.jpg)
![Dialogue with voice acting](site/public/shots/dialogue_1_english.jpg)
![Narration over the royal capital](site/public/shots/dialogue_4_english.jpg)

## FAQ

### What is this?

An unofficial fan **Russian localization** (русификатор) for the visual novel **The Survival of Sarah Rose**, plus an **AI voice pack** that fully voices the game in Russian and English.

### How do I install the Russian translation / русификатор?

Unpack the zips into the game folder (see Installation), select Language → Russian in settings, clear Ren'Py cache if text is not showing.

### How does the voice acting work?

Voices are cloned from custom reference recordings with CosyVoice3 and generated for every line in both languages. The game loads `ai_voice/{lang}/{arc}/{uid}__{voice}.opus` automatically (Opus-only since 2026-10-14; `.wav` is still a code fallback but ships no files).

### Is the translation official?

No — this is an unofficial fan project, not affiliated with the developers or publishers.

### Does it contain adult content?

**Yes — 18+.** The game contains explicit adult material. Download and play only if you are **18 or older**. Keep it away from minors; you are responsible for complying with your local laws (see [LICENSE](LICENSE)).

### License?

**CC BY-NC 4.0** — free to share and adapt with attribution, non-commercial only.

### How to help?

Open an issue or submit a pull request on GitHub.

---

# Русская версия

[Скачать](#скачать) • [Установка](#установка) • [Озвучка](#озвучка) • [Скриншоты](#скриншоты) • [FAQ](#faq-1)

## Возможности

- 🌐 **11 языков** — полная локализация: английский, русский, немецкий, испанский, французский, итальянский, японский, корейский, польский, португальский, китайский
- 🎙 **AI-озвучка** — клонированные голоса всех главных героев; **демо-скоуп: стартовые арки**, на RU, EN, DE, ES, FR, IT, JA
- 🎭 **Эмоциональная подача** — каждая реплика несёт состояние диктора (гнев, страсть, шёпот, сарказм...)
- 🗣 **77 голосов** — Сара, Рассказчик, Король Орвелл, Кейт, Томас и десятки других
- 🔊 **Озвучка следует за языком** — переключай язык в игре, играет пак этого языка
- ⚙️ **Ren'Py 7.4.11** — работает со Steam-версией игры

## Скачать

[**⬇ Релизы**](https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases) — готовые zip'ы: `main.zip` (ядро) + пакеты озвучки по языкам.

> **Файлы:** `TSSR-AI-Voice-Pack-main.zip` — ядро **без аудио**: тексты 11 языков + все шрифты (Literata + Noto CJK), ~47 МБ. Паки `voice-{ru,en,de,es,fr,it,ja}.zip` — **отдельные скачивания** (~17–23 МБ каждый, демо-скоуп). Без voice-пака игра работает полностью переведённой, просто без озвучки.

## Установка

1. **Закрой игру.** Распакуй `main.zip` куда угодно и запусти **его** `install.cmd` — он найдёт папку игры (Steam) и поставит ядро (тексты, шрифты, меню).
2. **Голоса — только нужных языков.** Распакуй voice-zip куда угодно и запусти **его собственный** `install.cmd` — поставится один этот язык; повтори для каждого пака. Если ядра нет, установщик голосов попросит поставить main первым.
3. Вручную: распакуй zip'ы в корень игры (папка с `TheSurvivalofSarahRose.exe`).
4. Запусти игру → кнопка **«Sarah Rose — AI-озвучка и перевод»** в главном меню → выбери язык, включи озвучку, настрой размеры шрифтов.

> Первый запуск после установки может быть медленнее (пересборка кэша Ren'Py).

## Озвучка

Озвучка создана на **CosyVoice3** (клонирование голоса) и покрывает оба языка.
Реплики хранятся в формате **Opus 24 кбит/с моно** — примерно в 16 раз меньше
промежуточного WAV (24 кГц/16 бит моно, 384 кбит/с; замер: 20 914 МБ WAV →
1 307 МБ Opus):

- **Озвучено 7 языков (демо-скоуп)** — стартовые арки, по 1 195 реплик:
  RU, EN, DE, ES, FR, IT, JA — `ai_voice/<lang>/...`
- **Корейский** — в процессе; **польский / португальский / китайский** — пока только витринные фразы на сайте

- Поиск голоса автоматический: `uid = md5(текста)` → `ai_voice/{lang}/{arc}/{uid}__{speaker}.opus`
  (`.wav` играет как фолбэк в коде, но с 2026-10-14 `ai_voice/` — только Opus)
- У каждой реплики есть эмоция — состояние диктора/рассказчика
- Если файла нет — игра просто играет без звука (без ошибок)

> ⚠ Паки озвучки небольшие (~17–23 МБ каждый) — это демо-скоуп, пока не вся игра.

## Содержание

### Переведённые арки (все 19)

Prologue, StoryBeginnings, WarriorPath, MagePath, UnionKingdom, HollowWorld, BlackMonolith, HassarPath, SailorPath, SailorArc, LifeInRahayal, VargaMarionPath, Training, PrisonArc, AlfredArc, DemonArc, WarArc, HyralArc, Other — **68 254 строки**.

### Озвученные персонажи (75+)

Сара, Рассказчик, Король Орвелл, Кейт, Томас, Варга, Капитан Бельмонт, Аларик, Кэролин, Марион, Кравэл, Барион, Базилиск и многие другие — у каждого уникальный клонированный голос с эмоциональной подачей.

## Скриншоты

![Главное меню](site/public/shots/main_menu_russian.jpg)
![Страница патча](site/public/shots/language_settings_russian.jpg)
![Диалог с озвучкой](site/public/shots/dialogue_1_russian.jpg)
![Наррация на фоне королевского города](site/public/shots/dialogue_4_russian.jpg)

## FAQ

### Что это?

Неофициальный фанатский **русификатор** визуальной новеллы **The Survival of Sarah Rose**, плюс **AI-озвучка**, которая полностью озвучивает игру на русском и английском.

### Как установить русификатор?

Распакуйте зипы в папку с игрой (см. Установка), выберите в настройках русский язык, при необходимости очистите кэш Ren'Py.

### Как работает озвучка?

Голоса клонированы с референсных записей через CosyVoice3 и сгенерированы для каждой реплики на обоих языках. Игра автоматически подгружает `ai_voice/{lang}/{arc}/{uid}__{voice}.opus` (с 2026-10-14 пак только Opus; `.wav` — фолбэк в коде без файлов).

### Это официальный перевод?

Нет — неофициальный фанатский проект, не связанный с разработчиками и издателями.

### В игре есть взрослый контент?

**Да — 18+.** Игра содержит откровенные взрослые материалы. Скачивайте и играйте, только если вам **18 лет и больше**. Не допускайте к материалу несовершеннолетних; вы несёте ответственность за соблюдение законов вашей страны (см. [LICENSE](LICENSE)).

### Лицензия?

**CC BY-NC 4.0** — свободное распространение и адаптация с указанием авторства, только некоммерческое использование.

### Как помочь проекту?

Откройте issue или сделайте pull request на GitHub.

---

## О проекте / Project

- **Репозиторий / Repository:** [github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods](https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods)
- **Сайт проекта / Project site:** [domovikx.github.io/The-Survival-of-Sarah-Rose-Mods](https://domovikx.github.io/The-Survival-of-Sarah-Rose-Mods/)
- **Игра в Steam / Game on Steam:** [The Survival of Sarah Rose](https://store.steampowered.com/app/2166470/The_Survival_of_Sarah_Rose/)
- **Issues:** [github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/issues](https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/issues)

---

## Для разработчиков / For developers

- Структура репы: `patches/ai-voice-pack/{mod, tl, audio, tools}` (патч), `site/` (лендинг, vite + GitHub Pages), `tasks/` (журналы задач), `docs/`.
- Конвейер патча: `extract → generate → build → deploy` (см. `AGENTS.md` — архитектура озвучки, uid = md5(old)).
- Сборка дистрибутива: `npm run build:pack` → `dist/*.zip` (раскладка zip = раскладка установки).
- Линты: `npm run lint:md` (markdownlint), `npm run format` (prettier), `npm run spell` (cSpell). Pre-commit — lint-staged (husky).
- Лендинг: `cd site && npm install && npm run build` → деплой в ветку `gh-pages` (GitHub Pages).

---

## SEO / Ключевые слова (для поиска)

**Also known as / Также известен как:** TSSR · Сара Роуз · Sarah Rose русификатор ·
The Survival of Sarah Rose russian · The Survival of Sarah Rose translation ·
The Survival of Sarah Rose voice acting · озвучка Сара Роуз.

**Keywords (RU):** русификатор The Survival of Sarah Rose · перевод на русский ·
русская озвучка · голосовое озвучивание · AI-озвучка · клонирование голоса ·
визуальная новелла · Ren'Py · мод для игры · фанатский перевод · полностью
озвученная игра · 18+ новелла · Steam визуальная новелла русский.

**Keywords (EN):** The Survival of Sarah Rose russian localization · russian patch ·
fan translation · AI voice acting · fully voiced · voice pack · CosyVoice ·
visual novel · Ren'Py mod · Steam visual novel · TSSR.

---

## Лицензия и отказ от ответственности / License & Disclaimer

**Файлы перевода** (`patches/ai-voice-pack/tl/ru/`) и **озвучка** (`patches/ai-voice-pack/audio/`) распространяются под лицензией [Creative Commons BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — свободное использование и распространение с указанием авторства, только некоммерческое. / Translation files and the voice pack are distributed under the [Creative Commons BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) license.

**18+:** Игра содержит откровенный взрослый контент — используя проект, вы подтверждаете, что вам 18+. / The game contains explicit adult content — by using this project you confirm you are 18+.

**Отказ от ответственности:** неофициальная фанатская работа. Все права на оригинальную игру принадлежат её правообладателям. Используйте на свой страх и риск. / This is an unofficial fan work. All rights to the original game belong to its rights holders. Use at your own risk.
