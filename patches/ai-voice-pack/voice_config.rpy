# AI Voice — runtime config for The Survival of Sarah Rose
#
# Layout: mods/tssr-ai-voice-pack/ai_voice/{ru,en}/{Arc}/{en12}-{state6} {variant}.opus
#   en12   = base32(md5(английского оригинала)[:8])[:12]  — какая это реплика (60 бит)
#   state6 = base32(md5({emotion,text})[:4])[:6]           — что произносится (30 бит)
#   variant = имя рефа из voice_list.json (Sarah_3, Narrator, King Orwell Rose)
#   Arc  берётся из label-части translation ID + catalog/label_arc.json
#
# Рантайм НЕ знает ни перевода, ни тона (они живут в POT, на стороне сборки),
# поэтому state6 ему недоступен и ищется по префиксу:
#
# ПРИОРИТЕТ ПОИСКА (variant — из voice_list.json, who -> ref):
#   1. {en12}-* {variant}.{opus,wav}   (файл своего голоса)
#   2. {en12}-*.{opus,wav}             (фолбэк: любой файл этой реплики)
#   Внутри: opus раньше wav, затем САМЫЙ СВЕЖИЙ по mtime — у реплики может лежать
#   устаревшее состояние рядом с текущим, и последняя генерация правильная.

# Приоритет -999: добавить свою папку в searchpath НАДО раньше любых других
# init-блоков (zzz_ui использует init offset = -2 -> -20), иначе ранние
# загрузки файлов (fonts/images) не найдут папку мода.
init -999 python:
    import base64
    import codecs
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

    # Имена файлов арки — один раз на арку. Пак неизменен в течение сессии, а
    # список нужен на каждую реплику; glob не используем: в Python рантайма
    # Ren'Py нет glob.escape (проверено в игре 2026-11-17: AttributeError),
    # а собирать шаблон из имени персонажа без экранирования нельзя.
    _dir_cache = { }

    def _voice_files(lang, arc):
        key = lang + "/" + arc
        cached = _dir_cache.get(key)
        if cached is not None:
            return cached
        base = os.path.join(_MOD_ROOT, _VOICE_ROOT, lang, arc)
        try:
            names = os.listdir(base)
        except Exception:
            names = []
        names = [n for n in names
                 if n.endswith(".opus") or n.endswith(".wav")]
        _dir_cache[key] = names
        return names

    def _tssr_pick(names, variant, base):
        # Приоритет: (1) файл своего варианта, (2) любой файл реплики;
        # внутри — opus раньше wav, затем самый СВЕЖИЙ по mtime: у реплики может
        # лежать устаревшее состояние рядом с текущим, последняя генерация верна.
        best = None
        for n in names:
            ext = n.rsplit(".", 1)[-1]
            own = bool(variant) and n.endswith(" " + variant + "." + ext)
            try:
                mt = os.path.getmtime(os.path.join(base, n))
            except Exception:
                mt = 0
            score = (2 if own else 1, 0 if ext == "opus" else 1, mt)
            if best is None or score > best[0]:
                best = (score, n)
        return best[1] if best else None

    def static_auto_voice(tlid):
        try:
            text = renpy.store._last_say_what or ""
            # Имя файла: {en12}-{state6} {variant}.opus — первые 12 символов base32
            # от первых 8 байт md5 оригинала (base32 RFC4648 — тот же, что у
            # base64.b32encode в Python и у сборки: паритет стережёт тест).
            uid = base64.b32encode(hashlib.md5(text.encode("utf-8")).digest()[:8]).decode()[:12]
            lang = renpy.game.preferences.language or "en"
            arc = _arc_for_tlid(tlid)
            base_dir = os.path.join(_MOD_ROOT, _VOICE_ROOT, lang, arc)

            # Голос: who -> вариант каста из voice_list.json; если спикера в
            # каталоге нет (новая роль/переименование) — вариант нарратора,
            # чтобы точная ветка не отключалась целиком.
            who = renpy.store._last_say_who
            variant = None
            if who is not None:
                variant = _who_variant.get(getattr(who, "name", None))
            if not variant:
                variant = _narrator_variant

            prefix = uid + "-"
            names = [n for n in _voice_files(lang, arc) if n.startswith(prefix)]
            picked = _tssr_pick(names, variant, base_dir)
            path = None
            if picked is not None:
                path = "{}/{}/{}/{}".format(_VOICE_ROOT, lang, arc, picked)

            _vdbg("CALL tlid={!r} text={!r} lang={!r} who={!r} variant={!r} path={} arcs={}".format(
                tlid, text[:60], lang,
                getattr(who, "name", None), variant, path, len(_label_arc)))
            return path
        except Exception as e:
            _vdbg("EXC {!r}".format(repr(e)))
            return None

define config.auto_voice = static_auto_voice
