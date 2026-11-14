# game-shots — снимки экрана игры для гайдов, сайта и стора

Скилл для двух разных задач, которые легко перепутать:

| Что нужно                                                           | Путь                                                                                        | Когда                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Снять **живую сцену** (то, что сейчас открыто у игрока/владельца)   | `cap_window.ps1` из этого скилла                                                            | «сними, что у меня открыто», скрин для Steam-гайда/багрепорта |
| Снять **воспроизводимый набор** (меню, настройки, N кадров пролога) | `patches/ai-voice-pack/tools/generate/scripts/shots_capture.ps1` (харнесс `zz_capture.rpy`) | лендинг, Nexus-галерея, регресс UI                            |

## 1. Живая сцена: cap_window.ps1

```powershell
# окно игры -> PNG «как есть»
powershell -ExecutionPolicy Bypass -File .opencode/skills/game-shots/cap_window.ps1 `
  -Process TheSurvivalofSarahRose -Out tmp/shots/game_window.png

# сразу чистый кадр 1920x1080 без заголовка окна (для Steam/Nexus)
powershell -ExecutionPolicy Bypass -File .opencode/skills/game-shots/cap_window.ps1 `
  -Process TheSurvivalofSarahRose -Out tmp/steam_upload/04_scene.jpg -Width 1920 -Height 1080 -Jpeg
```

Что делает: находит окно по имени процесса → поднимает на передний план
(`SwitchToThisWindow` + Alt-трюк, иначе Windows блокирует фокус) → берёт
**клиентскую** область окна (`GetClientRect`+`ClientToScreen`, без заголовка) →
снимает пиксели → при `-Width/-Height` масштабирует HighQualityBicubic.

Ограничения: окно должно быть не перекрыто другим поверх него (принудительный
подъём работает не всегда, скрипт предупреждает); DirectX-окна иногда снимаются
чёрными — тогда используй путь 2 (снимок внутри движка).

## 2. Воспроизводимый набор: харнесс Ren'Py

```powershell
powershell -ExecutionPolicy Bypass -File patches/ai-voice-pack/tools/generate/scripts/shots_capture.ps1 `
  -GameDir "<папка игры>" -Mode menu|game|langswitch|all -Lang ru|en|all
node patches/ai-voice-pack/tools/generate/scripts/shots_for_site.mts   # -> site/public/shots/*.jpg
```

Харнесс сам ставит окно так, чтобы снимок был нативный 1920×1080 (см. MAP:
DPI-фактор), пишет в `tmp/shots/`, в игру ничего не оставляет.

## Требования к файлам для Steam-гайда и Nexus

- 1920×1080 (16:9), JPEG q≈2 или PNG; **лимит превью Steam — 2 МБ**;
- без заголовка окна и без посторонних панелей;
- на кадре должен быть виден бейдж языка (`RUS`/`ENG`) — он объясняет, что это
  локализация, а не оригинал.

Грабли, из-за которых снимки получались не такими, — в `MAP.md`.
