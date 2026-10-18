# Читает persistent TSSR (zlib+pickle py2) и печатает ключевые preferences.
# Нужны заглушки классов renpy.persistent.RenPyPersistent / renpy.preferences.Preferences.
import sys, types, zlib, pickle

P = r"C:\Users\Domo\AppData\Roaming\RenPy\TheSurvivalofSarahRose-1625513096\persistent"

# --- заглушки модулей движка (классы из py2-pickle) ---
class _SetstateMixin(object):
    def __setstate__(self, state):
        if isinstance(state, tuple) and len(state) == 2:
            items, inst = state
            if isinstance(items, dict) and hasattr(self, "update"):
                self.update(items)
            elif isinstance(items, list) and hasattr(self, "extend"):
                self.extend(items)
            if isinstance(inst, dict):
                self.__dict__.update(inst)
        elif isinstance(state, dict):
            self.__dict__.update(state)
    def __getstate__(self):
        return dict(self.__dict__) if not isinstance(self, dict) else (dict(self), dict(self.__dict__))

class _StubClass(_SetstateMixin, object):
    pass

class _StubDict(_SetstateMixin, dict):
    pass

class _StubList(_SetstateMixin, list):
    pass

class _StubModule(types.ModuleType):
    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        base = (_StubDict if name.endswith("Dict") else
                _StubList if name.endswith("List") else _StubClass)
        cls = type(name, (base,), {"__module__": self.__name__})
        setattr(self, name, cls)
        return cls

renpy_mod = _StubModule("renpy")
renpy_mod.__path__ = []  # пакет — чтобы import renpy.X проходил
pers_mod = _StubModule("renpy.persistent")
prefs_mod = _StubModule("renpy.preferences")
py_mod = _StubModule("renpy.python")
renpy_mod.persistent = pers_mod
renpy_mod.preferences = prefs_mod
renpy_mod.python = py_mod
sys.modules["renpy"] = renpy_mod
sys.modules["renpy.persistent"] = pers_mod
sys.modules["renpy.preferences"] = prefs_mod
sys.modules["renpy.python"] = py_mod

with open(P, "rb") as f:
    raw = f.read()

try:
    data = zlib.decompress(raw)
except Exception:
    data = raw  # на случай без zlib

obj = pickle.loads(data, encoding="latin1")
print("top:", type(obj), getattr(obj, "__dict__", {}).keys())
d = getattr(obj, "__dict__", {})
pref = d.get("_preferences")
if pref is None:
    print("NO _preferences; keys:", list(d.keys())[:40])
else:
    pd = pref.__dict__
    for k in ("language", "afm_enable", "afm_time", "afm_after_click",
              "text_cps", "using_afm_enable", "muted"):
        print("%-20s = %r" % (k, pd.get(k, "<absent>")))
