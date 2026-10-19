# AI Voice — runtime config for The Survival of Sarah Rose
#
# Layout: mods/tssr-ai-voice-pack/ai_voice/{ru,en}/{Arc}/{uid}__{variant}.wav
#   uid = md5(old-текста реплики, UTF-8) — 32-hex, язык-независимый
#   variant = имя рефа из voices.yaml (Sarah_3, Narrator, Thomas, ...)
#   Arc  берётся из label-части translation ID + catalog/label_arc.json
#
# ПРИОРИТЕТ ПОИСКА (variant берётся из voices.yaml, who -> ref):
#   1. {uid}__{активный вариант из voices.yaml}.wav   (yaml управляет звучанием)
#   2. любой {uid}*.wav (первый по алфавиту)          (фолбэк)

# Приоритет -999: добавить свою папку в searchpath НАДО раньше любых других
# init-блоков (zzz_ui использует init offset = -2 -> -20), иначе ранние
# загрузки файлов (fonts/images) не найдут папку мода.
init -999 python:
    import codecs
    import glob
    import hashlib
    import json
    import os
    import re

    _VOICE_ROOT = "ai_voice"

    # Корень папки мода. __file__ НЕ использовать: python-блоки исполняются
    # в словаре store, чей __file__ указывает на движковой renpy/minstore.py,
    # а не на этот .rpy (проверено в установке 2026-10-19: dirname() давал
    # <корень>/renpy/, диагностика писалась в папку движка, searchpath
    # получал неверный корень — каталог и голоса не находились).
    # Старая раскладка жила случайно: dirname(__file__)/.. из renpy/ = корень
    # игры = правильный путь.
    #
    # Корень ищем детерминированно: каноничная папка из сборки (MOD_DIR
    # в build_pack.py), иначе — скан mods/ на свои два маркера (папка,
    # переименованная пользователем, продолжает работать).
    def _tssr_find_mod_root():
        basedir = renpy.config.basedir
        canon = os.path.join(basedir, "mods", "tssr-ai-voice-pack")
        if os.path.isdir(canon):
            return canon
        try:
            names = sorted(os.listdir(os.path.join(basedir, "mods")))
        except Exception:
            names = []
        for name in names:
            d = os.path.join(basedir, "mods", name)
            if (os.path.isfile(os.path.join(d, "voice_config.rpy"))
                    and os.path.isfile(os.path.join(d, "catalog", "label_arc.json"))):
                return d
        return canon

    _MOD_ROOT = _tssr_find_mod_root()
    # Его же относительный путь от корня игры — в config.searchpath,
    # чтобы загрузчик видел ai_voice/ и catalog/ ВНУТРИ папки мода.
    _MOD_REL = os.path.relpath(_MOD_ROOT, renpy.config.basedir).replace("\\", "/")
    if _MOD_REL not in renpy.config.searchpath:
        renpy.config.searchpath.append(_MOD_REL)

    # label -> Arc: читаем мапу, собранную tools/voice_catalog.py
    _label_arc = { }
    try:
        f = renpy.loader.load("catalog/label_arc.json")
        _label_arc = json.loads(f.read())
        f.close()
    except Exception:
        pass

    # Список голосов из catalog/voice_list.json (генерится из кастов:
    #   озвучен = есть реф {Name}.wav; variant = имя персонажа)
    _who_variant = { }
    _narrator_variant = ""
    try:
        _f = renpy.loader.load("catalog/voice_list.json")
        _vl = json.loads(_f.read())
        _f.close()
        _who_variant = _vl.get("names", { }) or { }
        _narrator_variant = _vl.get("narrator", "") or ""
    except Exception:
        pass

    _TLID_LABEL = re.compile(r"^(.*)_[0-9a-f]{8}$") if 're' in dir() else None

    # DEBUG: каждая попытка резолва пишется в voice_debug.log (папка мода).
    # В проде выпилить (или оставить — файл мелкий, по одной строке на реплику).
    _VDBG = os.path.join(_MOD_ROOT, "voice_debug.log")

    def _vdbg(msg):
        try:
            with codecs.open(_VDBG, "a", "utf-8") as f:
                f.write(msg + "\n")
        except Exception:
            pass

    # Приёмочный индикатор (одна строка за запуск): label_arc > 0 и
    # catalog_loadable=True доказывают, что цепочка
    # _MOD_ROOT -> searchpath -> catalog/ (и та же для ai_voice/) работает.
    _vdbg("[init] mod_root={} rel={} label_arc={} catalog_loadable={} voices={}".format(
        _MOD_ROOT, _MOD_REL, len(_label_arc),
        renpy.loadable("catalog/voice_list.json"),
        bool(_who_variant or _narrator_variant)))

    def _arc_for_tlid(tlid):
        m = _TLID_LABEL.match(tlid or "")
        label = m.group(1) if m else (tlid or "")
        return _label_arc.get(label, "_unknown")

    def static_auto_voice(tlid):
        try:
            text = renpy.store._last_say_what or ""
            uid = hashlib.md5(text.encode("utf-8")).hexdigest()
            lang = renpy.game.preferences.language or "en"
            arc = _arc_for_tlid(tlid)

            # 1. Вариант из voices.yaml (ref: -> {variant}.wav)
            who = renpy.store._last_say_who
            if who is not None:
                wname = getattr(who, "name", None)
                variant = _who_variant.get(wname)
            else:
                variant = _narrator_variant  # наррация

            path = None
            if variant:
                for ext in ("opus", "wav"):
                    cand = "{}/{}/{}/{}__{}.{}".format(
                        _VOICE_ROOT, lang, arc, uid, variant, ext)
                    if renpy.loadable(cand):
                        path = cand
                        break

            # 2. Фолбэк: любой {uid}*.{opus,wav} в папке арки
            if path is None:
                for ext in ("opus", "wav"):
                    pattern = os.path.join(
                        _MOD_ROOT, _VOICE_ROOT, lang, arc, uid + "*." + ext)
                    matches = sorted(glob.glob(pattern))
                    if matches:
                        path = "{}/{}/{}/{}".format(
                            _VOICE_ROOT, lang, arc, os.path.basename(matches[0]))
                        break

            _vdbg("CALL tlid={!r} text={!r} lang={!r} who={!r} variant={!r} path={} arcs={}".format(
                tlid, text[:60], lang,
                getattr(who, "name", None), variant, path, len(_label_arc)))
            return path
        except Exception as e:
            _vdbg("EXC {!r}".format(repr(e)))
            return None

define config.auto_voice = static_auto_voice
