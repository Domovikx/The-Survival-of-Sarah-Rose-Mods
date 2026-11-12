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
