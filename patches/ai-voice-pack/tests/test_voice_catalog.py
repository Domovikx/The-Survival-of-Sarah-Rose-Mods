"""Тесты voice_catalog: сборка из фикстур, категории, label_arc, diff-манифесты,
авторы строковых спикеров и коллизии (бага 2026-10-20)."""

import collections
import glob
import hashlib
import json
import os
import re
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'generate', 'scripts'))

import voice_catalog  # noqa: E402
from voicekit import paths  # noqa: E402
from voicekit import who_map  # noqa: E402

# Дефолты модуля — фиксируем ДО вызовов build (он мутирует глобалы).
DEFAULT_TL_RU = voice_catalog.TL_RU
DEFAULT_CATALOG_DIR = voice_catalog.CATALOG_DIR


def _uid(text):
    return hashlib.md5(text.encode('utf-8')).hexdigest()


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


TL_FIXTURE = '''# Arc: TestArc | Scene: TestScene

translate ru strings:

    old "Hello there"
    new "Привет"

    old "Menu item"
    new "Пункт меню"

    old "Narration line"
    new "Рассуждение"

    old "Closing narration"
    new "Финальное повествование"
'''

SCRIPT_FIXTURE = '''define s = Character("Sarah")

label test_scene:
    s "Hello there"
    "Narration line"
    jump other

label other:
    "Menu item" if True:
        jump test_scene
    "Closing narration"
'''


def _make_tree(tmp_path, tl_text=TL_FIXTURE):
    tl = str(tmp_path / 'tl')
    _write(os.path.join(tl, 'TestArc', 'TestScene.rpy'), tl_text)
    game = str(tmp_path / 'game_dir')
    _write(os.path.join(game, 'game', 'script.rpy'), SCRIPT_FIXTURE)
    out = str(tmp_path / 'out')
    return tl, game, out


def _load_entries(out):
    with open(os.path.join(out, 'voices.jsonl'), encoding='utf-8') as f:
        lines = [json.loads(l) for l in f if l.strip()]
    return lines[0], lines[1:]


def test_defaults_point_to_pkg_tl_and_catalog():
    assert DEFAULT_TL_RU == os.path.join(paths.PKG_ROOT, 'tl', 'ru')
    assert os.path.isdir(DEFAULT_TL_RU)
    assert DEFAULT_CATALOG_DIR == paths.CATALOG_DIR


def test_build_fixture(tmp_path):
    tl, game, out = _make_tree(tmp_path)
    voice_catalog.build(game_dir=game, out_dir=out, tl_dir=tl)

    meta, entries = _load_entries(out)
    by_old = {e['old']: e for e in entries}
    assert meta['totals']['total'] == 4

    hello = by_old['Hello there']
    assert hello['uid'] == _uid('Hello there')
    assert hello['new'] == 'Привет'
    assert hello['arc'] == 'TestArc'
    assert hello['scene'] == 'TestScene'
    assert hello['category'] == 'dialogue'
    assert hello['who'] == 's'
    assert hello['who_name'] == 'Sarah'

    assert by_old['Menu item']['category'] == 'menu'
    assert by_old['Narration line']['category'] == 'narration'
    assert by_old['Narration line']['who'] is None

    with open(os.path.join(out, 'label_arc.json'), encoding='utf-8') as f:
        label_arc = json.load(f)
    assert label_arc == {'test_scene': 'TestArc', 'other': 'TestArc'}


def test_build_diff_manifests(tmp_path, monkeypatch):
    monkeypatch.setattr(voice_catalog.paths, 'REPO_ROOT', str(tmp_path))
    _tl, game, _out = _make_tree(tmp_path / 'seed')

    # v1 каталог: One/Two/Four
    tl1 = str(tmp_path / 'v1' / 'tl')
    _write(os.path.join(tl1, 'TestArc', 'TestScene.rpy'), '''# Arc: TestArc | Scene: TestScene

translate ru strings:

    old "One"
    new "Один"

    old "Two"
    new "Два"

    old "Four"
    new "Четыре"
''')
    out1 = str(tmp_path / 'v1' / 'out')
    voice_catalog.build(game_dir=game, out_dir=out1, tl_dir=tl1)

    # v2: Two переведён заново (changed), Three добавлен (added), Four убран (dropped)
    tl2 = str(tmp_path / 'v2' / 'tl')
    _write(os.path.join(tl2, 'TestArc', 'TestScene.rpy'), '''# Arc: TestArc | Scene: TestScene

translate ru strings:

    old "One"
    new "Один"

    old "Two"
    new "Два-2"

    old "Three"
    new "Три"
''')
    voice_catalog.build(game_dir=game, out_dir=out1, tl_dir=tl2,
                        diff_with=os.path.join(out1, 'voices.jsonl'))

    delta = os.path.join(str(tmp_path), 'tmp', 'voice_delta')
    def _read(name):
        with open(os.path.join(delta, name), encoding='utf-8') as f:
            return f.read().split()
    # Было в v1: One/Two/Four; стало: One/Two(изменён)/Three
    assert _read('added.txt') == [_uid('Three')]
    assert _read('changed.txt') == [_uid('Two')]
    assert _read('dropped.txt') == [_uid('Four')]


def test_build_missing_script_exits(tmp_path):
    tl, _game, out = _make_tree(tmp_path)
    with pytest.raises(SystemExit):
        voice_catalog.build(game_dir=str(tmp_path / 'nope'), out_dir=out,
                            tl_dir=tl)


# --- Бага «авторы» (2026-10-20): строковые спикеры, коллизии, replay-файлы -----

TL_AUTHORS_FIXTURE = '''# Arc: TestArc | Scene: TestScene

translate ru strings:

    old "Do you understand?"
    new "Ты поняла?"

    old "Walk!"
    new "Идём!"

    old "Behave."
    new "Приличнее."

    old "Same words"
    new "Одни и те же слова"

    old "Mixed line"
    new "Смешанная строка"

    old "Narration only"
    new "Только повествование"

    old "Menu item"
    new "Пункт меню"

    old "The pain it brings you now..."
    new "Та боль, что причиняет тебе сейчас..."

    old "Only narration in replay"
    new "Лишь повествование в реплее"

    old "Dual line"
    new "Двойная строка"

    old "Hidden voice line"
    new "Скрытая голосовая строка"
'''

SCRIPT_AUTHORS_FIXTURE = '''define s = Character("Sarah")
define k = Character("Kate")
define hec = Character("Hecate")

label scene_one:
    "Master" "Do you understand?"
    "Orc" "Walk!"
    "Hecate" "Behave."
    "Mysterious" "Hidden voice line"
    s "Same words"
    k "Same words"
    "Mixed line"
    s "Mixed line"
    "Narration only"
    jump other

label other:
    "Menu item" if True:
        jump scene_one
    "Dual line" if True:
        jump scene_one
    s "Dual line"
'''

REPLAY_AUTHORS_FIXTURE = '''label replay_branding:
    "Master" "The pain it brings you now..."
    "Only narration in replay"
'''


def _make_authors_tree(tmp_path):
    tl = str(tmp_path / 'tl')
    _write(os.path.join(tl, 'TestArc', 'TestScene.rpy'), TL_AUTHORS_FIXTURE)
    game = str(tmp_path / 'game_dir')
    _write(os.path.join(game, 'game', 'script.rpy'), SCRIPT_AUTHORS_FIXTURE)
    _write(os.path.join(game, 'game', 'replay_gallery.rpy'), REPLAY_AUTHORS_FIXTURE)
    out = str(tmp_path / 'out')
    return tl, game, out


def test_build_authors_fixture(tmp_path, monkeypatch):
    """Гард баги: строковые спикеры получают who-id, коллизии — по записи на спикера,
    replay-файлы парсятся, display-имя сливается с define при совпадении,
    uid-override переназначает спикера маски."""
    tl, game, out = _make_authors_tree(tmp_path)
    # точечное исключение: реплика маски Mysterious принадлежит hec
    ov = tmp_path / 'overrides.jsonl'
    ov.write_text(
        json.dumps({'uid': _uid('Hidden voice line'), 'who': 'hec',
                    'note': 'фикстура-override'}) + '\n', encoding='utf-8')
    monkeypatch.setattr(who_map, 'OVERRIDES_PATH', str(ov))
    voice_catalog.build(game_dir=game, out_dir=out, tl_dir=tl)

    meta, entries = _load_entries(out)
    by = collections.defaultdict(list)
    for e in entries:
        by[e['old']].append(e)

    def whos(text):
        return {(e['who'], e['category']) for e in by[text]}

    # строковый спикер НЕ из белого списка (тот самый Master-кейс)
    assert whos('Do you understand?') == {('master', 'dialogue')}
    # легаси-код сохранён
    assert whos('Walk!') == {('orc', 'dialogue')}
    # display-имя "Hecate" слилось с define hec, а не slug 'hecate'
    assert whos('Behave.') == {('hec', 'dialogue')}
    # коллизия: один текст — два спикера — две записи (один uid)
    assert whos('Same words') == {('s', 'dialogue'), ('k', 'dialogue')}
    assert {e['uid'] for e in by['Same words']} == {_uid('Same words')}
    # смешанный текст: и нарратор, и персонаж
    assert whos('Mixed line') == {(None, 'narration'), ('s', 'dialogue')}
    # replay_gallery.rpy парсится (раньше виден не был)
    assert whos('The pain it brings you now...') == {('master', 'dialogue')}
    # меню + эхо-реплика персонажа: обе записи сосуществуют
    assert whos('Dual line') == {(None, 'menu'), ('s', 'dialogue')}
    # uid-override (registry/overrides.jsonl): маска отдана реальному персонажу
    assert whos('Hidden voice line') == {('hec', 'dialogue')}

    assert meta['characters']['master'] == 'Master'
    assert meta['characters']['orc'] == 'Orc'
    assert meta['totals']['total'] == 14
    assert all(e['who_name'] for e in entries if e['category'] == 'dialogue')


_REAL_GAME = getattr(paths, 'GAME_INSTALL', '') or ''


@pytest.mark.skipif(not os.path.isfile(os.path.join(_REAL_GAME, 'game', 'script.rpy')),
                    reason='нет установки игры (TSSR_GAME)')
def test_real_game_every_speaker_text_has_dialogue_authors(tmp_path):
    """E2E-гард на реальной установке: любой say-текст с автором, попавший в каталог,
    обязан иметь хотя бы одну dialogue-запись. Сканер в тесте написан независимо от
    прод-regex'ов — ловит регрессии парсера при обновлениях игры."""
    out = str(tmp_path / 'out')
    voice_catalog.build(game_dir=_REAL_GAME, out_dir=out, tl_dir=DEFAULT_TL_RU)
    meta, entries = _load_entries(out)
    by = collections.defaultdict(list)
    for e in entries:
        by[e['old']].append(e)

    # якорь баги: реплика из сцены клеймения (script.rpy + replay_gallery.rpy)
    branding_uid = 'f46578c80445765aac5b866fe224a2ef'
    branding = [e for es in by.values() for e in es if e['uid'] == branding_uid]
    assert branding, 'uid сцены клеймения пропал из каталога'
    assert all(e['who'] == 'master' and e['category'] == 'dialogue' for e in branding)

    # независимый сканер say-форм игры
    deny = {'play', 'queue', 'stop', 'voice', 'pause', 'hide', 'show', 'scene',
            'window', 'centered', 'fast', 'slow', 'loop', 'nointeract', 'with',
            'call', 'jump', 'return', 'menu', 'image', 'define'}
    say_str = re.compile(r'^\s*"([^"]+)"\s+"((?:[^"\\]|\\.)*)"')
    say_id = re.compile(r'^\s*([A-Za-z_]\w*)\s+"((?:[^"\\]|\\.)*)"')
    game_say_texts = set()
    for path in glob.glob(os.path.join(_REAL_GAME, 'game', '*.rpy')):
        with open(path, encoding='utf-8', errors='replace') as f:
            for line in f:
                m = say_str.match(line)
                if m:
                    game_say_texts.add(m.group(2))
                    continue
                m = say_id.match(line)
                if m and m.group(1) not in deny:
                    game_say_texts.add(m.group(2))

    bad = []
    for text in game_say_texts:
        es = by.get(text)
        if not es:
            continue  # вне tl (не переведено) — мимо
        if not any(e['category'] == 'dialogue' and e['who'] for e in es):
            bad.append(text)
    assert not bad, 'say-тексты без автора: {}'.format(bad[:10])

    # строковые спикеры получили who-id в characters
    assert meta['characters'].get('captain') == 'Captain'

    # разметка тега Voice (registry/overrides.jsonl): реплики маски — своим
    # персонажам (23 исключения из tmp/voice_tag_attribution.md)
    assert {'mar'} <= {e['who'] for e in by['Oy!']}
    assert {'hec'} <= {e['who'] for e in by['Go to the ships!']}
    assert 'dam' in {e['who'] for e in by['What?']}
    voice_n = sum(1 for e in entries if e['who'] == 'voice')
    assert voice_n == 86, 'голосов существа: ждал 86 (109 - 23), got {}'.format(
        voice_n)

    # rename-trap: каждый who каталога обязан существовать в реестре who_map
    # (новое имя спикера из апдейта игры без записи в реестре = падение сюда)
    reg_whos = set(who_map.resolve())
    catalog_whos = {e['who'] for e in entries if e['who']}
    assert catalog_whos <= reg_whos, 'кто-коды вне реестра: {}'.format(
        sorted(catalog_whos - reg_whos)[:10])


def test_who_map_registry_invariants():
    """Реестр who_map: схема DRY, уникальность, deprecated-сшивки, entity-группы."""
    raw = who_map.load()
    assert raw, 'реестр who_map.jsonl пуст/отсутствует'
    resolved = who_map.resolve()

    for ch, rec in raw.items():
        assert rec.get('character') == ch
        assert isinstance(rec.get('define'), list), ch

    names_seen = {}
    for who, rec in resolved.items():
        for n in rec['names']:
            assert n not in names_seen or names_seen[n] == who, \
                'имя {!r} спорит между {} и {}'.format(n, names_seen.get(n), who)
            names_seen[n] = who

    for rec in resolved.values():
        if rec['status'] == 'deprecated':
            assert rec.get('merged_into'), rec
            assert rec.get('note'), rec
        if rec.get('voice'):
            assert os.path.isdir(os.path.join(paths.VOICE_CANDIDATES, rec['voice'])), \
                'нет папки каста {}'.format(rec['voice'])

    import collections
    entities = collections.Counter(r['entity'] for r in resolved.values()
                                   if r.get('entity'))
    assert all(n >= 2 for n in entities.values()), 'entity-группа < 2 ключей'

    # overrides: uid-формат и кто-коды существуют в реестре
    for o in who_map.overrides():
        assert re.fullmatch(r'[0-9a-f]{32}', o['uid']), o
        assert o['who'] in resolved, 'override ведёт в никуда: {}'.format(o)

    # опечатки игры резолвятся в канон через deprecated-сшивки
    exact, _cf = who_map.name_index()
    emissary_who = next(r['who'] for r in resolved.values()
                        if r['character'] == 'Emissary')
    official_who = next(r['who'] for r in resolved.values()
                        if r['character'] == 'Court Official')
    assert exact.get('Emmissary') == emissary_who
    assert exact.get('Court Offical') == official_who


def test_who_codes_cover_wired_casts():
    """Регрессия проводки: касты с раньше пустыми who_codes подключены."""
    from voicekit.catalog import who_to_voice
    wm = who_to_voice()
    assert wm.get('dam') == 'Damian'
    for code, name in (('art', 'Arthur'), ('bran', 'Bran'),
                       ('eny', 'Enya'), ('sy', 'Synara'), ('to', 'Took')):
        assert wm.get(code) == name
