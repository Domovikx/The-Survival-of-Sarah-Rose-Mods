#!/usr/bin/env python
"""Trim end-of-file breath/noise artifacts (pattern-based).

Pattern (the ONLY rule):
    deep silence gap  >= min_gap_ms
    followed by a short sound burst  <= max_burst_ms
    that touches the very end of the file  (within eof_tol_ms)

=> this is a TTS artifact (breath/exhale/noise), NOT a word. Cut it.

Sound level is NOT used as a criterion — only the pause+short-burst shape.

Usage:
  python tools/trim_tail_burst.py file.wav [out.wav]
  python tools/trim_tail_burst.py --dir game/tl/ru/voice/ --dry-run
  python tools/trim_tail_burst.py --dir game/tl/ru/voice/ --in-place
  python tools/trim_tail_burst.py --dir in/ --out-dir out/
"""

import argparse
import math
import os
import sys

import torch
import torchaudio

FRAME_MS = 10


def load(path):
    wave, sr = torchaudio.load(path)
    if wave.shape[0] > 1:
        wave = wave.mean(dim=0, keepdim=True)
    return wave, sr


def save(path, wave, sr):
    torchaudio.save(path, wave, sr, encoding='PCM_S', bits_per_sample=16)


def rms_db_frames(wave, sr):
    frame = max(int(sr * FRAME_MS / 1000), 1)
    n = wave.shape[1] // frame
    db = []
    for i in range(n):
        seg = wave[:, i * frame:(i + 1) * frame]
        rms = float((seg ** 2).mean().sqrt())
        db.append(20 * math.log10(rms + 1e-10))
    return db, frame


def find_tail_burst(db, frame_ms=FRAME_MS, noise_floor_db=-50.0,
                    max_burst_ms=500, min_gap_ms=80, eof_tol_ms=100):
    """Return dict(burst_start_frame, burst_end_frame, dur_ms, gap_ms, peak_db)
    or None if the tail pattern is not found."""
    n = len(db)
    if n == 0:
        return None

    # 1) last non-silent frame (walk back from EOF)
    i = n - 1
    while i >= 0 and db[i] <= noise_floor_db:
        i -= 1
    if i < 0:
        return None  # whole file silent
    burst_end = i

    # burst must touch (or nearly touch) EOF
    if (n - 1) - burst_end > eof_tol_ms // frame_ms:
        return None

    # 2) walk back through the burst
    j = burst_end
    while j >= 0 and db[j] > noise_floor_db:
        j -= 1
    burst_start = j + 1
    burst_dur_ms = (burst_end - burst_start + 1) * frame_ms
    if burst_dur_ms > max_burst_ms:
        return None

    # 3) silence gap before the burst
    k = burst_start - 1
    gap_frames = 0
    while k >= 0 and db[k] <= noise_floor_db:
        gap_frames += 1
        k -= 1
    gap_ms = gap_frames * frame_ms
    if gap_ms < min_gap_ms:
        return None
    if k < 0:
        return None  # no speech before the gap — whole file is one burst

    # peak dB of the burst
    peak_db = max(db[burst_start:burst_end + 1])

    return dict(
        burst_start_frame=burst_start,
        burst_end_frame=burst_end,
        dur_ms=burst_dur_ms,
        gap_ms=gap_ms,
        peak_db=peak_db,
    )


def trim(wave, sr, noise_floor_db=-50.0, max_burst_ms=500, min_gap_ms=80,
         eof_tol_ms=100, max_tail_silence_ms=None, fade_ms=20, max_iter=5):
    """Cut tail artifact pattern(s). Returns (wave, cuts) where cuts is a list
    of info dicts (one per iteration)."""
    cuts = []
    for _ in range(max_iter):
        db, frame = rms_db_frames(wave, sr)
        info = find_tail_burst(db, FRAME_MS, noise_floor_db, max_burst_ms,
                               min_gap_ms, eof_tol_ms)
        if info is None:
            break
        cut_sample = info['burst_start_frame'] * frame
        wave = wave[:, :cut_sample]
        info['cut_at_ms'] = cut_sample / sr * 1000
        cuts.append(info)

    if max_tail_silence_ms is not None and wave.shape[1] > 0:
        db, frame = rms_db_frames(wave, sr)
        thr = noise_floor_db
        end_frame = len(db) - 1
        while end_frame >= 0 and db[end_frame] <= thr:
            end_frame -= 1
        tail_silence_ms = (len(db) - 1 - end_frame) * FRAME_MS
        if tail_silence_ms > max_tail_silence_ms:
            keep_frames = end_frame + 1 + max_tail_silence_ms // FRAME_MS
            new_len = min(wave.shape[1], keep_frames * frame)
            if new_len > 0 and new_len < wave.shape[1]:
                wave = wave[:, :new_len]
                f = int(sr * fade_ms / 1000)
                if f > 0 and wave.shape[1] > f * 2:
                    env = torch.linspace(1.0, 0.0, f).unsqueeze(0)
                    wave[:, -f:] *= env

    return wave, cuts


def process_file(in_path, out_path, args):
    wave, sr = load(in_path)
    orig_ms = wave.shape[1] / sr * 1000
    trimmed, cuts = trim(
        wave, sr,
        noise_floor_db=args.noise_floor,
        max_burst_ms=args.max_burst,
        min_gap_ms=args.min_gap,
        eof_tol_ms=args.eof_tol,
        max_tail_silence_ms=args.max_tail_silence,
        fade_ms=args.fade,
    )
    new_ms = trimmed.shape[1] / sr * 1000
    name = os.path.basename(in_path)
    if cuts:
        parts = []
        for c in cuts:
            parts.append('burst {:.0f}ms (peak {:.1f}dB) after {:.0f}ms gap'
                         .format(c['dur_ms'], c['peak_db'], c['gap_ms']))
        print('{}: {:.0f}ms -> {:.0f}ms | CUT {}'.format(
            name, orig_ms, new_ms, '; '.join(parts)))
        if out_path is not None:
            save(out_path, trimmed, sr)
    else:
        print('{}: {:.0f}ms | KEEP (no pattern)'.format(name, orig_ms))
        if out_path is not None and out_path != in_path:
            save(out_path, trimmed, sr)
    return bool(cuts)


def main():
    ap = argparse.ArgumentParser(description='Trim end-of-file breath artifacts (pattern-based)')
    ap.add_argument('input', nargs='?', help='input WAV file')
    ap.add_argument('output', nargs='?', default=None, help='output WAV file (optional)')
    ap.add_argument('--dir', default=None, help='process all *.wav in directory')
    ap.add_argument('--out-dir', default=None, help='output directory for --dir')
    ap.add_argument('--in-place', action='store_true', help='overwrite files in --dir')
    ap.add_argument('--dry-run', action='store_true', help='report only, do not write')
    ap.add_argument('--noise-floor', type=float, default=-50.0, help='silence floor dB (default -50)')
    ap.add_argument('--max-burst', type=float, default=500.0, help='max artifact burst ms (default 500)')
    ap.add_argument('--min-gap', type=float, default=80.0, help='min silence gap ms (default 80)')
    ap.add_argument('--eof-tol', type=float, default=100.0, help='burst must end within N ms of EOF (default 100)')
    ap.add_argument('--max-tail-silence', type=float, default=None, help='also limit trailing silence ms (default: off)')
    ap.add_argument('--fade', type=float, default=20.0, help='fade-out ms when trimming silence (default 20)')
    args = ap.parse_args()

    if args.dir:
        files = sorted(f for f in os.listdir(args.dir) if f.lower().endswith('.wav'))
        if not files:
            print('no .wav files in', args.dir)
            return
        total_cut = 0
        for f in files:
            in_path = os.path.join(args.dir, f)
            if args.dry_run:
                out_path = None
            elif args.in_place:
                out_path = in_path
            elif args.out_dir:
                os.makedirs(args.out_dir, exist_ok=True)
                out_path = os.path.join(args.out_dir, f)
            else:
                out_path = None
            if process_file(in_path, out_path, args):
                total_cut += 1
        print('--- {} of {} files had tail artifacts'.format(total_cut, len(files)))
    else:
        if not args.input:
            ap.error('specify input file or --dir')
        if args.dry_run:
            out_path = None
        elif args.in_place:
            out_path = args.input
        else:
            out_path = args.output
        process_file(args.input, out_path, args)


if __name__ == '__main__':
    main()
