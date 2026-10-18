"""Интеграционные тесты: add_candidate (gen_selected -> корень каста)."""

import os
import shutil
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

from voicekit import paths  # noqa: E402


def find_ffmpeg():
    ff = shutil.which('ffmpeg')
    if ff:
        return ff
    for p in [
        r'C:\Users\Domo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe',
        r'C:\ffmpeg\bin\ffmpeg.exe',
    ]:
        if os.path.isfile(p):
            return p
    return None


@pytest.fixture
def full_project(tmp_path, monkeypatch):
    """Полная структура проекта (новая модель) во временной папке."""
    for attr, val in (
        ('ROOT', tmp_path),
        ('VOICE_CANDIDATES', tmp_path / 'voice_candidates'),
        ('CATALOG_DIR', tmp_path / 'catalog'),
        ('CONFIG_DIR', tmp_path / 'config'),
        ('VOICES_JSON', tmp_path / 'catalog' / 'voices.json'),
        ('AI_VOICE_DIR', tmp_path / 'ai_voice'),
    ):
        monkeypatch.setattr(paths, attr, str(val))

    (tmp_path / 'catalog').mkdir()
    char_dir = tmp_path / 'voice_candidates' / 'TestVoice'
    gen_sel = char_dir / 'gen_selected'
    gen_sel.mkdir(parents=True)
    (char_dir / 'TestVoice.yaml').write_text(
        'name: TestVoice\nwho_codes: [tv]\n', encoding='utf-8')

    import json
    with open(paths.VOICES_JSON, 'w', encoding='utf-8') as f:
        json.dump({'entries': [], 'characters': {'tv': 'TestVoice'}}, f)
    return tmp_path


def test_add_candidate_from_gen_selected(full_project, monkeypatch):
    """add_candidate: mp3 из gen_selected -> TestVoice.wav (корень каста)."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        pytest.skip('ffmpeg не найден')

    mp3 = os.path.join(paths.char_subdir('TestVoice', 'gen_selected'),
                       'TestVoice.mp3')
    subprocess.run([
        ffmpeg, '-y', '-f', 'lavfi', '-i',
        'sine=frequency=440:duration=12', '-ac', '1', '-ar', '24000',
        '-b:a', '96k', mp3
    ], capture_output=True, check=True)

    import add_candidate
    monkeypatch.setattr(sys, 'argv', ['add_candidate.py', '--only',
                                      'TestVoice'])
    rc = add_candidate.main()
    assert rc == 0

    ref = os.path.join(paths.char_dir('TestVoice'),
                       'TestVoice.wav')
    assert os.path.exists(ref)
    dur = float(subprocess.check_output(
        ['ffprobe', '-v', 'error', '-show_entries', 'stream=duration',
         '-of', 'csv=p=0', ref]).decode().strip().splitlines()[0])
    assert 9.0 <= dur <= 10.5  # нарезка 10с
    assert os.path.getsize(ref) > 1000


def test_add_candidate_any_mp3_name(full_project, monkeypatch):
    """Один mp3 с любым именем в gen_selected -> TestVoice.wav (нейминг не важен)."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        pytest.skip('ffmpeg не найден')

    mp3 = os.path.join(paths.char_subdir('TestVoice', 'gen_selected'),
                       '04.mp3')
    subprocess.run([
        ffmpeg, '-y', '-f', 'lavfi', '-i',
        'sine=frequency=440:duration=12', '-ac', '1', '-ar', '24000',
        '-b:a', '96k', mp3
    ], capture_output=True, check=True)

    import add_candidate
    monkeypatch.setattr(sys, 'argv', ['add_candidate.py', '--only',
                                      'TestVoice'])
    assert add_candidate.main() == 0
    assert os.path.exists(os.path.join(paths.char_dir('TestVoice'),
                                       'TestVoice.wav'))
    assert not os.path.exists(os.path.join(paths.char_dir('TestVoice'),
                                           'TestVoice_04.wav'))


def test_add_candidate_resumable(full_project, monkeypatch):
    """add_candidate повторно НЕ пересоздаёт существующий реф."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        pytest.skip('ffmpeg не найден')

    mp3 = os.path.join(paths.char_subdir('TestVoice', 'gen_selected'),
                       'TestVoice.mp3')
    subprocess.run([
        ffmpeg, '-y', '-f', 'lavfi', '-i',
        'sine=frequency=440:duration=12', '-ac', '1', '-ar', '24000',
        '-b:a', '96k', mp3
    ], capture_output=True, check=True)

    import add_candidate
    monkeypatch.setattr(sys, 'argv', ['add_candidate.py', '--only',
                                      'TestVoice'])
    assert add_candidate.main() == 0
    ref = os.path.join(paths.char_dir('TestVoice'),
                       'TestVoice.wav')
    mtime = os.path.getmtime(ref)
    assert add_candidate.main() == 0
    assert os.path.getmtime(ref) == mtime  # не пересоздан
    """add_candidate повторно НЕ пересоздаёт существующий реф."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        pytest.skip('ffmpeg не найден')

    mp3 = os.path.join(paths.char_subdir('TestVoice', 'gen_selected'),
                       'TestVoice.mp3')
    subprocess.run([
        ffmpeg, '-y', '-f', 'lavfi', '-i',
        'sine=frequency=440:duration=12', '-ac', '1', '-ar', '24000',
        '-b:a', '96k', mp3
    ], capture_output=True, check=True)

    import add_candidate
    monkeypatch.setattr(sys, 'argv', ['add_candidate.py', '--only',
                                      'TestVoice'])
    assert add_candidate.main() == 0
    ref = os.path.join(paths.char_dir('TestVoice'),
                       'TestVoice.wav')
    mtime = os.path.getmtime(ref)
    assert add_candidate.main() == 0
    assert os.path.getmtime(ref) == mtime  # не пересоздан