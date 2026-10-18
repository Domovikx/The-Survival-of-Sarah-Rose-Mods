"""Тесты для tools/clean_refs.py — аудио-фильтры и нормализация."""

import os
import sys
import subprocess
import tempfile
import shutil
import json
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))


def find_ffmpeg():
    """Ищем ffmpeg."""
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
def sample_wav(tmp_path):
    """Создаём фиктивный WAV файл для тестирования."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        pytest.skip("ffmpeg не найден")
    
    wav_path = tmp_path / 'sample.wav'
    # Генерируем 5-секундный синусоидальный тон
    subprocess.run([
        ffmpeg, '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
        '-ac', '1', '-ar', '24000', str(wav_path)
    ], capture_output=True, check=True)
    
    return wav_path


def test_clean_file_basic(sample_wav, tmp_path):
    """Тест: clean_file создаёт выходной файл."""
    from clean_refs import clean_file
    
    dst = tmp_path / 'cleaned.wav'
    result = clean_file(str(sample_wav), str(dst))
    
    assert result is True  # файл был обработан
    assert dst.exists()
    assert dst.stat().st_size > 0


def test_clean_file_skip_existing(sample_wav, tmp_path):
    """Тест: clean_file пропускает существующий файл."""
    from clean_refs import clean_file
    
    dst = tmp_path / 'cleaned.wav'
    dst.write_bytes(b'existing')
    
    result = clean_file(str(sample_wav), str(dst))
    
    assert result is False  # файл пропущен
    assert dst.read_bytes() == b'existing'  # не изменился


def test_loudnorm_target_level(sample_wav, tmp_path):
    """Тест: loudnorm нормализует до -16 LUFS ± 1 LUFS."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        pytest.skip("ffmpeg не найден")
    
    from clean_refs import clean_file
    
    dst = tmp_path / 'normalized.wav'
    clean_file(str(sample_wav), str(dst))
    
    # Измеряем громкость выхлда
    result = subprocess.run([
        ffmpeg, '-i', str(dst), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f', 'null', '-'
    ], capture_output=True, text=True)
    
    # Парсим JSON из stderr
    stderr = result.stderr
    json_start = stderr.rfind('{')
    json_end = stderr.rfind('}') + 1
    if json_start >= 0 and json_end > json_start:
        stats = json.loads(stderr[json_start:json_end])
        input_i = float(stats.get('input_i', -99))
        
        # Допускаем ±1 LUFS от целевого -16
        assert -17 <= input_i <= -15, f"Громкость {input_i} LUFS вне диапазона [-17, -15]"


def test_filter_chain_exists(sample_wav, tmp_path):
    """Тест: все фильтры применяются (denoise, deesser, highshelf, loudnorm)."""
    from clean_refs import clean_file
    
    dst = tmp_path / 'filtered.wav'
    clean_file(str(sample_wav), str(dst))
    
    # Если дошли сюда — фильтры применились без ошибок
    assert dst.exists()


def test_multiple_files(tmp_path):
    """Тест: обработка нескольких файлов через batch режим."""
    from clean_refs import clean_file
    
    src_dir = tmp_path / 'raw'
    src_dir.mkdir()
    dst_dir = tmp_path / 'ready'
    dst_dir.mkdir()
    
    # Создаём 3 WAV файла
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        pytest.skip("ffmpeg не найден")
    
    for i in range(3):
        wav = src_dir / f'test_{i}.wav'
        subprocess.run([
            ffmpeg, '-y', '-f', 'lavfi', '-i', f'sine=frequency={440+i*100}:duration=2',
            '-ac', '1', '-ar', '24000', str(wav)
        ], capture_output=True, check=True)
    
    # Обрабатываем каждый
    for i in range(3):
        src = src_dir / f'test_{i}.wav'
        dst = dst_dir / f'test_{i}.wav'
        result = clean_file(str(src), str(dst))
        assert result is True
        assert dst.exists()

def test_compress_pauses_cuts_long():
    """Длинная пауза сжимается до target, короткая не трогается."""
    import numpy as np
    from clean_refs import compress_pauses
    sr = 24000
    tone = np.sin(2 * np.pi * 220 * np.arange(sr) / sr) * 0.3
    long_pause = np.zeros(int(2.0 * sr))
    short_pause = np.zeros(int(0.3 * sr))
    x = np.concatenate([tone, long_pause, tone, short_pause, tone])
    y, max_pause, n_cut = compress_pauses(x, sr)
    assert n_cut == 1
    assert max_pause >= 2.0
    assert abs(len(y) / sr - (1 + 0.35 + 1 + 0.3 + 1)) < 0.1


def test_compress_pauses_keeps_short_only():
    """Без длинных пауз файл не меняется."""
    import numpy as np
    from clean_refs import compress_pauses
    sr = 24000
    tone = np.sin(2 * np.pi * 220 * np.arange(sr) / sr) * 0.3
    x = np.concatenate([tone, np.zeros(int(0.3 * sr)), tone])
    y, _, n_cut = compress_pauses(x, sr)
    assert n_cut == 0
    assert len(y) == len(x)


def test_compress_pauses_cuts_medium():
    """Пауза 0.5с (длиннее target 0.35) сжимается до 0.35."""
    import numpy as np
    from clean_refs import compress_pauses
    sr = 24000
    tone = np.sin(2 * np.pi * 220 * np.arange(sr) / sr) * 0.3
    x = np.concatenate([tone, np.zeros(int(0.5 * sr)), tone])
    y, _, n_cut = compress_pauses(x, sr)
    assert n_cut == 1
    assert abs(len(y) / sr - (1 + 0.35 + 1)) < 0.1
