"""Раскладка проекта — ЕДИНСТВЕННОЕ место, где живут пути.

БД мода (ЕДИНОЕ место истины голосов) — PKG_ROOT/casts/:
  casts.mts   типизированная мапа «спикер POT → голос» + line_overrides
                 (VOICES/SPEAKERS/LINE_OVERRIDES; ревью — speaker_map.mts)
  voices/        войсы: папки {Name}/ (контракт {Name}.yaml + рефы) +
                 voices.mts (генерит cast_mts.mts: список + тип Voice)

Спикеры игры — po/template.pot (msgctxt "speaker:*"); старый реестр
who_map.jsonl/overrides.jsonl удалён при чистке 2026-10-21 (переехал в
casts.mts).

Структура casts/voices/{Name}/:
  generated/     сырьё от voice_design (01.mp3, 02.mp3, ...)
  gen_selected/  отобранные вручную ({Name}.mp3, {Name}_1.mp3)
  {Name}.wav     АКТИВНЫЙ реф в корне каста (его ищет система: load_voices);
                 варианты A/B рядом: {Name}_1.wav, {Name}_2.wav (неактивные)

Правило: скриптам запрещено хардкодить пути — только через этот модуль.
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Корень репы: пресеты живут в config/ на уровне репы (см. AGENTS.md).
PKG_ROOT = os.path.dirname(os.path.dirname(ROOT))       # patches/ai-voice-pack
REPO_ROOT = os.path.dirname(os.path.dirname(PKG_ROOT))  # корень репы

# Дом скриптов пайплайна (+ voicekit). Исторически это был game-repo tools/ —
# после переезда в mods-repo лежат здесь; удалённое TOOLS_DIR (generate/tools)
# указывало в никуда с 2026-10 и больше не существует.
SCRIPTS_DIR = os.path.join(ROOT, 'scripts')
VOICE_CANDIDATES = os.path.join(PKG_ROOT, 'casts', 'voices')
CATALOG_DIR = os.path.join(PKG_ROOT, 'catalog')  # зеркало установки 2026-10-19
CONFIG_DIR = os.path.join(REPO_ROOT, 'config')
OUTPUT_DIR = os.path.join(ROOT, 'output')
# Озвучка (массив репы): audio/vo_{lang} — в дистрибутиве это ai_voice/<lang>
AUDIO_DIR = os.path.join(PKG_ROOT, 'audio')
# Установка игры (READ-ONLY источник оригинальных скриптов, например script.rpy
# для voice_catalog). Переопределяется env TSSR_GAME; путь по умолчанию —
# стандартная локация Steam (паттерн tts_env: env-переопределяемый дефолт).
GAME_INSTALL = os.environ.get(
    'TSSR_GAME',
    r'C:\Program Files (x86)\Steam\steamapps\common\The Survival of Sarah Rose')


def ai_voice_dir(lang):
    """Каталог озвучки языка в репо: audio/vo_{ru|en}.

    Читает AUDIO_DIR в момент вызова — тесты мокают paths.AUDIO_DIR.
    В zip эта папка уезжает как mods/.../ai_voice/<lang>/ (см. build_pack).
    """
    return os.path.join(AUDIO_DIR, 'vo_' + lang)

VOICES_JSONL = os.path.join(CATALOG_DIR, 'voices.jsonl')
VOICE_LIST_JSON = os.path.join(CATALOG_DIR, 'voice_list.json')
LABEL_ARC_JSON = os.path.join(CATALOG_DIR, 'label_arc.json')
# Журнал прогонов генерации кастов — ДЕРИВАТ (пересоздаётся voice_design).
CAST_SUMMARY_JSONL = os.path.join(OUTPUT_DIR, 'voice_candidates.jsonl')
MISSING_VOICES_MD = os.path.join(CATALOG_DIR, 'missing_voices.md')
SYNC_REPORT_MD = os.path.join(CATALOG_DIR, 'voice_sync_report.md')

CHAR_SUBDIRS = ('generated', 'gen_selected')


def char_dir(name):
    return os.path.join(VOICE_CANDIDATES, name)


def char_subdir(name, sub):
    if sub not in CHAR_SUBDIRS:
        raise ValueError('неизвестная подпапка: {!r}'.format(sub))
    return os.path.join(char_dir(name), sub)


def char_yaml(name):
    return os.path.join(char_dir(name), name + '.yaml')


def ref_active(name):
    return os.path.join(char_dir(name), name + '.wav')


def ref_voices(name):
    return 'casts/voices/{}/{}.wav'.format(name, name)


def ref_variant(name, variant):
    """Путь A/B-варианта в корне каста ({Name}_{variant}.wav)."""
    return os.path.join(char_dir(name), '{}_{}.wav'.format(name, variant))


def resolve_ref(ref):
    """Реф-путь -> абсолютный.

    Относительный 'casts/...' считается от PKG_ROOT; легаси-префиксы
    'registry/casts/...', 'voice_candidates/...' (старые дома БД) и
    'casts/{Name}/...' (до переезда в voices/ 2026-10-21) редиректятся
    в casts/voices/ — старые манифесты остаются читаемыми.
    """
    if ref.startswith('voice_candidates/'):
        ref = 'casts/voices/' + ref[len('voice_candidates/'):]
    if ref.startswith('registry/casts/'):
        ref = 'casts/voices/' + ref[len('registry/casts/'):]
    if ref.startswith('casts/') and not ref.startswith('casts/voices/'):
        ref = 'casts/voices/' + ref[len('casts/'):]
    if os.path.isabs(ref):
        return ref
    if ref.startswith('casts/'):
        return os.path.join(PKG_ROOT, ref)
    return os.path.join(ROOT, ref)


def batch_log():
    return os.path.join(OUTPUT_DIR, 'voice', 'batch.log')