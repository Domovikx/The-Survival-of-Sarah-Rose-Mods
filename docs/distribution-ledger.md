# Учёт дистрибуции (Nexus Mods + GitHub Releases)

**Правило (кайдзен, 2026-11-12):** каждая заливка/правка на Nexus или релизе —
**строка сюда В МОМЕНТ операции**. Это источник истины «что и когда залито»:
НЕ проверять память и UI, а сверяться с этим файлом. Кто залил — тот записал.

- Nexus: мод «AI Voice Pack and Localization» (game_id 11043, modId 1),
  страница `https://www.nexusmods.com/games/11043/mods/1/edit/files`
- GitHub Release: `v1.0.0` (`Domovikx/The-Survival-of-Sarah-Rose-Mods`)
- Статус мода: **Awaiting approval** (держит апрув ИГРЫ), видимость **Hidden**
  (переключение — по команде владельца), DP opt-in — НЕ включён (руками владельца)

## Файлы Nexus (18 версий: 11 текущих + 7 архивных)

| Файл                  | Версия | Размер   | Залит            | AV-скан     | Примечание                                        |
| --------------------- | ------ | -------- | ---------------- | ----------- | ------------------------------------------------- |
| Main pack (required)  | 1.0.0  | 197.0 MB | 2026-11-11 20:42 | QUARANTINED | архив (первая сборка, 206MB — лишнее содержимое!) |
| Voice RU (Russian)    | 1.0.0  | 17.2 MB  | 2026-11-11 21:03 | VERIFIED    | архив                                             |
| Voice EN (English)    | 1.0.0  | 15.8 MB  | 2026-11-11 21:06 | VERIFIED    | архив                                             |
| Voice DE (German)     | 1.0.0  | 17.7 MB  | 2026-11-11 21:08 | VERIFIED    | архив                                             |
| Voice ES (Spanish)    | 1.0.0  | 16.6 MB  | 2026-11-11 21:11 | VERIFIED    | архив                                             |
| Voice FR (French)     | 1.0.0  | 16.1 MB  | 2026-11-11 21:13 | VERIFIED    | архив                                             |
| Voice IT (Italian)    | 1.0.0  | 17.9 MB  | 2026-11-11 21:15 | VERIFIED    | архив                                             |
| Voice IT (Italian)    | 1.0.1  | 18.1 MB  | 2026-11-12 08:54 | QUARANTINED | текущая                                           |
| Voice FR (French)     | 1.0.1  | 16.2 MB  | 2026-11-12 08:55 | QUARANTINED | текущая                                           |
| Voice ES (Spanish)    | 1.0.1  | 16.7 MB  | 2026-11-12 08:57 | QUARANTINED | текущая                                           |
| Voice DE (German)     | 1.0.1  | 17.8 MB  | 2026-11-12 17:39 | QUARANTINED | текущая                                           |
| Voice EN (English)    | 1.0.1  | 16.0 MB  | 2026-11-12 17:40 | QUARANTINED | текущая                                           |
| Voice RU (Russian)    | 1.0.1  | 17.3 MB  | 2026-11-12 17:41 | QUARANTINED | текущая                                           |
| Main pack (required)  | 1.0.1  | 44.9 MB  | 2026-11-12 17:44 | QUARANTINED | текущая                                           |
| Voice JA (Japanese)   | 1.0.0  | 22.3 MB  | 2026-11-12 17:49 | QUARANTINED | текущая                                           |
| Voice KO (Korean)     | 1.0.0  | 18.7 MB  | 2026-11-12 19:40 | QUARANTINED | текущая                                           |
| Voice PL (Polish)     | 1.0.0  | 17.7 MB  | 2026-11-12 19:41 | QUARANTINED | текущая                                           |
| Voice PT (Portuguese) | 1.0.0  | 18.0 MB  | 2026-11-12 19:42 | QUARANTINED | текущая                                           |

⚠ **AV-карантин**: все текущие версии (1.0.1 + новые паки) — QUARANTINED;
зелёные только архивные 1.0.0 от 11-11. Лечение — апелляция/репак (открытая задача).
Подозрение: install.cmd/ps1 (ExecutionPolicy Bypass + chcp) + старый Main 206MB
с лишним содержимым.

## Локальная сборка 2026-11-13 — .7z (НЕ залита, ждёт команды владельца)

Переход zip → 7z (`-mx=9`, solid) + сабсет CJK-шрифтов по набору символов из
`tl/`, `po/` и инлайн-переводов `zzz_ui.rpy`: main **45.1 → 4.3 MiB** (−90%),
голосовые паки −1.3%. Каждый архив проверен `7z t` (полная распаковка + CRC),
проверка встроена в сборку.

| Файл                           | Байт     | sha256                                                             |
| ------------------------------ | -------- | ------------------------------------------------------------------ |
| TSSR-AI-Voice-Pack-main.7z     | 4547450  | `5fc29a86e81445010ced14e2ee8fabe4a2d6dc05e2ad0a9352b06e132f01165d` |
| TSSR-AI-Voice-Pack-voice-de.7z | 18225563 | `c273280f74f3ee73ff69e4d79d22139702cbdc6d7e6eb8dfae58a9ba13fb2e3e` |
| TSSR-AI-Voice-Pack-voice-en.7z | 16129211 | `b8888037b0210bb355e82e3c38fbb3eacb0d1149b7232d90758db9c999659988` |
| TSSR-AI-Voice-Pack-voice-es.7z | 16987675 | `03a7ab3bb83e5799aa2a62933766c30105ec9f9214b6b13bdb5af7e56e5257a7` |
| TSSR-AI-Voice-Pack-voice-fr.7z | 16473417 | `18c7a8c916a2b79a294d324e315651ef1c3294818da24402a2a10090637e7402` |
| TSSR-AI-Voice-Pack-voice-it.7z | 18439329 | `d3143536c5e7149edfd57f928dfdbb0495c523e445e00ae84ad91ee026087f3e` |
| TSSR-AI-Voice-Pack-voice-ja.7z | 22397070 | `1f901b01b189fa0546d4f049e781f27a8767d7a51f7a60844f32238b07c3b7f2` |
| TSSR-AI-Voice-Pack-voice-ko.7z | 19088697 | `2ef99ffd87d8dfc62f80cd8543fd40c4b48e92cf3b7cea71d709143e100c4914` |
| TSSR-AI-Voice-Pack-voice-pl.7z | 18086761 | `aec6e7eebbcaeaf2f7075d543b7f8d079efb1f4ee7168e639fa1c0837772d01b` |
| TSSR-AI-Voice-Pack-voice-pt.7z | 18398870 | `ebe0f11f8b6df2e793d0e174385236f12a5c7aa578aab67fffd8c2991c43f8c7` |
| TSSR-AI-Voice-Pack-voice-ru.7z | 17658092 | `a842b9023eefdf030908adec0ab5145d289fade8ab7a2a85339def6228c0ce5c` |
| TSSR-AI-Voice-Pack-voice-zh.7z | 17365396 | `15b7848900ed2a85a2d8c994e9c71d2bdd993e842e22f30d2367fb0fcf4aeacc` |

Визуальная приёмка 2026-11-13: ja/ko/zh — меню, панель настроек и диалоги
сняты на установке из `main.7z`, «тофу» нет.

## GitHub Release v1.0.0 — 11 ассетов (sha256 в описании релиза)

- main.zip (47.0 MB) + voice-{ru,en,de,es,fr,it,ja,ko,pl,pt}.zip
- payload идентичен текущим файлам Nexus (те же сборки dist/)
- voice-zh.zip — НЕТ (см. «К заливке»)

## Галерея Nexus (9 кадров; порядок выставлен владельцем 2026-11-12)

1. [PRIMARY/thumbnail] "Language switcher: 11 languages"
2. "German localization - narration"
3. "Russian localization - narration"
4. "Polish localization - narration"
5. "In-game choice - Russian UI"
6. "Morning after - Russian narration"
7. "A rough night - Russian narration"
8. "Choose your mentor - Russian UI"
9. "Unholy creation - Russian narration"

## Тексты мода (summary/описание/теги)

- Последняя правка: 2026-11-12 (факты: демо-скоуп, 7 языков озвучено, per-pack
  установщики; теги: Sexualised, Pornographic, AI-Generated Content, AI Media, Translation)
- Описание/summary обновлено 2026-11-12 (вечер): «All 11 languages are voiced»,
  per-pack установщики, старых заявлений (full AI voice / 1 188) больше нет

## К заливке (незакрытое)

- [ ] **Voice ZH** — после готовности генерации zh (демо 1188+7): собрать
      `voice-zh.zip` → Nexus (Add as new file, Optional, "Voice ZH (Chinese)", 1.0.0)
  - GitHub Release (новый ассет + sha256 в заметки)
- [ ] **Цифры на сайте site/** (11 локалей): «7 languages / Korean in progress» →
      «11 languages voiced»; после — деплой
- [ ] После залития — строки в ЭТОТ файл!

## История заливок (коротко)

- 2026-11-11 20:42–21:15 — первая заливка: Main 206MB (⚠ лишнее содержимое) + 6 паков
- 2026-11-12 08:54–08:57 — обновления IT/FR/ES (1.0.1, новые установщики)
- 2026-11-12 17:39–17:49 — обновления DE/EN/RU + Main 47MB (чистый) + JA
- 2026-11-12 19:40–19:42 — KO, PL, PT
- 2026-11-12 (день) — галерея пересобрана владельцем до 9 кадров; описания
  обновлены под факты; скриншоты: тёмный/дубли удалены, добавлены крючки

## 2026-11-13 — переход на Nexus как единственную витрину

**Решение владельца:** все скачивания — только Nexus Mods; GitHub остаётся
портфолио/исходниками (релизы удалены, ссылки на них сняты с сайта и README).

### Nexus: 12 файлов → версия 1.0.2 (FOMOD, без исполняемых)

Пакеты `dist/*.7z` (main + 11 голосов), раскладка установки, `fomod/` внутри.
Старые версии 1.0.0/1.0.1 ушли в архив групп (`archive_existing_file`).

| Файл                  | Версия | Размер  | Залит            | Примечание                         |
| --------------------- | ------ | ------- | ---------------- | ---------------------------------- |
| Main pack (required)  | 1.0.2  | 4.3 MB  | 2026-11-13 21:56 | 1495 файлов, Primary               |
| Voice RU (Russian)    | 1.0.2  | 20.4 MB | 2026-11-13 22:02 | 1399 файлов                        |
| Voice EN (English)    | 1.0.2  | 15.4 MB | 2026-11-13 22:06 | API                                |
| Voice DE (German)     | 1.0.2  | 17.4 MB | 2026-11-13 22:06 | API                                |
| Voice ES (Spanish)    | 1.0.2  | 16.2 MB | 2026-11-13 22:06 | API                                |
| Voice FR (French)     | 1.0.2  | 15.7 MB | 2026-11-13 22:06 | API                                |
| Voice IT (Italian)    | 1.0.2  | 17.6 MB | 2026-11-13 22:06 | API                                |
| Voice JA (Japanese)   | 1.0.2  | 21.4 MB | 2026-11-13 22:06 | API                                |
| Voice KO (Korean)     | 1.0.2  | 18.2 MB | 2026-11-13 22:06 | API                                |
| Voice PL (Polish)     | 1.0.2  | 17.3 MB | 2026-11-13 22:06 | API                                |
| Voice PT (Portuguese) | 1.0.2  | 17.5 MB | 2026-11-13 22:06 | API (дважды: дубль 1.0.2 в архиве) |
| Voice ZH (Chinese)    | 1.0.2  | 16.5 MB | 2026-11-13 22:01 | UI                                 |

Статус мода по-прежнему **Awaiting approval** (блокирует апрув игры): файлы
опубликуются только после одобрения игры. AV-скан новых файлов — «in progress».

### Nexus: расширение Vortex (новая страница)

- Страница: `https://www.nexusmods.com/games/site/mods/2600`
  (Game = Modding Tools, Category = Vortex Extensions).
- Файл: `TSSR-Vortex-Extension-1.0.0.zip` (3 файла в корне: `info.json`,
  `gameart.png`, `index.js`), Main, Primary, 1.0.0.
- `info.json`: `gameId: 11043`, версия 1.0.0 = версия файла.
- Vortex подхватывает такие расширения за ~2 часа после публикации
  (GitHub-PR канал закрыт: `vortex-games` заархивирован 20.05.2026).

### GitHub

- Релизы **v1.0.2 и v1.0.0 удалены** (вместе с тегами): релиз автоматически
  отдавал `Source code (zip/tar.gz)` — снапшот всего репозитория.
- Сайт: кнопка скачивания → Nexus (`site/src/shared/config/constants.ts`,
  `LINKS.nexus`), подпись CTA переведена на 11 языков; инструкция установки
  переписана под `.7z` + FOMOD (install.cmd больше не существует).

### Аудит видимого состояния (2026-11-13, ночь)

- Мод-страниц у аккаунта **ровно две** («My Content»): мод + расширение. Лишних
  черновиков/копий нет.
- Основной мод: публичный таб «FILES **12**», все текущие = 1.0.2. История
  версий: 1.0.0 → 1.0.1 → 1.0.2 в архиве групп. У **Voice PT** остался
  архивный дубль 1.0.2 (следствие двойного прогона API) — пользователю не
  виден, удалить нельзя: DELETE файла в UI и API v3 нет.
- Расширение: ровно **1 файл** (1.0.0, Main/Primary), 3 картинки в галерее,
  статус Unpublished. Дубля расширения в файлах мода НЕТ (загрузку отменили).
- GitHub: релизов и тегов нет (только код); живой сайт проверим на «Download on
  Nexus Mods» — ссылок на releases/latest нет.
- Публикация страницы расширения невозможна из браузера: `Publish` = `disabled`
  при заполненных шагах; проверены тулбар, `?publish=true`, legacy-панель
  «Publish this mod», GraphQL (мутации publish нет). Вероятен гейт модерации
  категории Vortex Extensions.
