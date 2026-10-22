"""CV3-хелперы генерации: ПЕРЕНЕСЁННЫЙ код из внешнего W40K-тула.

Источник: W40KRTAudioDirectMod/tools/cosyvoice3_demo.py (CV3_PREFIX, prep_ref,
patch_flow_temperature, patch_silent_token_trim + SILENT_TOKENS) — копия по
правилу инкапсуляции (2026-10-22): наш код = единственный источник правды,
внешний репозиторий не импортируем. Оригинал не правим.

ОБНОВЛЕНИЕ: если внешний cosyvoice3_demo.py изменится — правки вносим СЮДА
(и тестово сверяем поведение), а не наоборот.
"""

import tempfile

import numpy as np
import torch
import torchaudio

CV3_PREFIX = 'You are a helpful assistant.<|endofprompt|>'


def prep_ref(path):
    """Постпроцессинг рефа как в офиц. HF Space: trim + peak 0.8 + 0.2s хвост.

    Аналог librosa.effects.trim (top_db=60, frame=440, hop=220) на numpy —
    без numba (librosa ломается на новых numba)."""
    speech, sr = torchaudio.load(path)
    if sr != 24000:
        speech = torchaudio.functional.resample(speech, sr, 24000)
    y = speech.squeeze(0).numpy()
    frame, hop = 440, 220
    if len(y) >= frame:
        n = 1 + (len(y) - frame) // hop
        idx = np.arange(frame)[None, :] + hop * np.arange(n)[:, None]
        rms = np.sqrt(np.mean(y[idx] ** 2, axis=1) + 1e-10)
        db = 20 * np.log10(rms + 1e-10)
        mask = db > (db.max() - 60)
        if mask.any():
            start = idx[mask.argmax(), 0]
            end = idx[len(mask) - mask[::-1].argmax() - 1, -1] + 1
            y = y[start:end]
    peak = float(np.abs(y).max())
    if peak > 0.8:
        y = y / peak * 0.8
    t = torch.from_numpy(y).unsqueeze(0)
    t = torch.cat([t, torch.zeros(1, int(24000 * 0.2))], dim=1)
    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    torchaudio.save(tmp.name, t, 24000)
    return tmp.name


def patch_flow_temperature(temp):
    """Проброс скрытого temperature в flow-диффузию (дефолт 1.0, в API не выведен).

    Сигнатура CV3-декодера: forward(mu, mask, n_timesteps, temperature=1.0,
    spks=None, cond=None, streaming=False)."""
    from cosyvoice.flow.flow_matching import CausalConditionalCFM
    orig = CausalConditionalCFM.forward

    def wrapped(self, mu, mask, n_timesteps, temperature=1.0, spks=None,
                cond=None, streaming=False, **kw):
        return orig(self, mu, mask, n_timesteps, temperature=temp, spks=spks,
                    cond=cond, streaming=streaming, **kw)

    CausalConditionalCFM.forward = wrapped


SILENT_TOKENS = frozenset({1, 2, 28, 29, 55, 248, 494, 2241, 2242, 2322, 2323})


def patch_silent_token_trim():
    """Срезать хвостовые silent/breath-токены перед flow.

    CV3 после фразы сам дорисовывает токены тишины/дыхания (FSQ silent and
    breath token), которые flow озвучивает как вздох/всхлип в конце реплики.
    Фильтр на уровне токенов не трогает речь (в отличие от аудио-трима)."""
    from cosyvoice.cli.model import CosyVoice3Model
    orig = CosyVoice3Model.token2wav

    def wrapped(self, token, *a, **kw):
        toks = token[0].tolist()
        i = len(toks)
        while i > 0 and toks[i - 1] in SILENT_TOKENS:
            i -= 1
        if i == 0:
            i = 1  # дегенерат: всё — тишина; оставляем 1 токен, чтобы flow не сломался
        return orig(self, token[:, :i], *a, **kw)

    CosyVoice3Model.token2wav = wrapped
