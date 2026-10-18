"""Окружение TTS: пути к моделям/приложениям (env-переопределяемые)."""

import glob
import os

COSY_ROOT = os.environ.get('TSSR_COSY_ROOT', r'C:\tools\cosyvoice3')
W40K_TOOLS = os.environ.get(
    'TSSR_W40K_TOOLS',
    r'C:\Users\Domo\AppData\LocalLow\Owlcat Games\Warhammer 40000 Rogue Trader'
    r'\UnityModManager\W40KRTAudioDirectMod\tools')
QWEN_APP = os.environ.get(
    'QWEN_TTS_APP', r'C:\pinokio\api\Qwen3-TTS-Pinokio.git\app')
VOICE_DESIGN_MODEL = os.environ.get(
    'TSSR_VOICE_DESIGN_MODEL',
    r'C:\Users\Domo\.cache\huggingface\hub'
    r'\models--Qwen--Qwen3-TTS-12Hz-1.7B-VoiceDesign\snapshots')


def cosy_repo_dir():
    return os.path.join(COSY_ROOT, 'CosyVoice')


def voice_design_snapshot():
    """Последний снепшот VoiceDesign с model.safetensors (или None)."""
    base = VOICE_DESIGN_MODEL
    if not os.path.isdir(base):
        return None
    found = None
    for d in sorted(glob.glob(os.path.join(base, '*'))):
        if os.path.exists(os.path.join(d, 'model.safetensors')):
            found = d
    return found