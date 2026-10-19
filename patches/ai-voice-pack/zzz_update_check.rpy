################################################################################
## Детект апдейта игры (шаг 6 задачи tasks/2026-10-14-mod-overlay-migration.md)
##
## Сравнивает sha256 официальных файлов, с которыми пересекается наш слой
## (gui-патч накладывается на gui.rpy; мод-файл конкурирует со screens.rpy
## по стилям/экранам; options.rpy — контроль версии), с зашитым манифестом.
##
## Результат — <папка мода>/update_check.txt:
##   STATUS: OK    — апдейта не было, всё тихо;
##   STATUS: АПДЕЙТ — изменились официальные файлы: отревьюить расхождения
##                    (новые значения официала vs наш слой), при необходимости
##                    обновить мод и хэши в TSSR_MANIFEST.
##
## После обновления игры обновить манифест:
##   sha256sum game/gui.rpy game/options.rpy game/screens.rpy
################################################################################

init 999 python:

    import os
    import hashlib

    # Папку мода вычисляет voice_config.rpy (init -999 — раньше этого блока);
    # __file__ в python-блоках врёт (store-неймспейс, см. voice_config.rpy).
    # Фолбэк — на случай частичной установки без voice_config.rpy.
    _TSSR_MOD_DIR = globals().get("_MOD_ROOT") or os.path.join(
        config.basedir, "mods", "tssr-ai-voice-pack")

    # Хэши официальных файлов V0.79, снятые 2026-10-14 — эталон сборки мода.
    TSSR_MANIFEST = {
        "gui.rpy": "c1ba66bcddb2d505f8a8b2c784062bcdc31d381aa927cc53dc729032a4f08fff",
        "options.rpy": "badc7db2e5722c57e1fab5522f15757d42a775ee1c4aa77241f090fbb5f0d12b",
        "screens.rpy": "1f73a3eb303859b235376d117ff604a6125bdd99f6b3c01a66498c75ba473455",
    }

    def tssr_update_check():
        try:
            changed = []
            for name, expected in sorted(TSSR_MANIFEST.items()):
                path = os.path.join(config.gamedir, name)
                try:
                    f = open(path, "rb")
                    data = f.read()
                    f.close()
                    if hashlib.sha256(data).hexdigest() != expected:
                        changed.append(name)
                except Exception:
                    changed.append(name + " (нечитаем/отсутствует)")

            out = os.path.join(_TSSR_MOD_DIR, "update_check.txt")
            lines = ["TSSR mod — детект апдейта игры (zzz_update_check.rpy)"]
            if changed:
                lines.append("STATUS: АПДЕЙТ — изменились официальные файлы: "
                    + ", ".join(changed))
                lines.append("Действие: отревьюить расхождения (новые значения "
                    "официала vs наш слой), при необходимости обновить мод и "
                    "хэши TSSR_MANIFEST.")
            else:
                lines.append("STATUS: OK (официальные файлы совпадают с манифестом мода)")
            f = open(out, "w")
            f.write("\n".join(lines) + "\n")
            f.close()
        except Exception:
            pass

    tssr_update_check()
