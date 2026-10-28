# -*- coding: utf-8 -*-
"""asr_refs.py — расшифровка рефов кастов для Hi-Fi Cloning (prompt_text).

Каждый реф casts/voices/{Имя}/{Имя}.wav -> текст (faster-whisper, CPU int8).
Тексты складываются в JSON (потом попадут в контракты {Имя}.mts как prompt_text
и в шим Hi-Fi: prompt_wav_path + prompt_text — решение владельца 2026-10-27).

Запуск (venv voxqc):
  python asr_refs.py --cast Xanthippe          # один каст (тест)
  python asr_refs.py --all                     # все, кроме Thomas (отложен владельцем)
  python asr_refs.py --all --model small --out tmp/voxcpm_bench/ref_transcripts.json

Ограничение владельца 2026-10-27: каст Thomas НЕ трогаем («исходник потом разбирай»).
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# tools/generate/scripts -> корень патча (ai-voice-pack)
PATCH_ROOT = Path(__file__).resolve().parents[3]
CASTS_DIR = PATCH_ROOT / "casts" / "voices"
DEFAULT_OUT = PATCH_ROOT.parent.parent / "tmp" / "voxcpm_bench" / "ref_transcripts.json"
DEFERRED = set()  # отложка по Thomas снята владельцем 2026-10-28 («ну сделай плиз» -> Hi-Fi)


def load_audio_16k(wav: Path):
    """Декод сам (ffmpeg -> 16k mono f32le): обход бага совместимости
    faster_whisper/av (av.open(metadata_errors=) нет в av 19) — в модель
    уходит numpy-массив, путь av.open не задействуется."""
    import subprocess

    import numpy as np

    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(wav), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        capture_output=True,
    )
    if r.returncode != 0 or not r.stdout:
        raise RuntimeError(f"ffmpeg decode failed: {wav.name}: {r.stderr.decode(errors='replace')[:200]}")
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def transcribe(model, wav: Path) -> dict:
    segments, info = model.transcribe(load_audio_16k(wav), language="ru", beam_size=5, vad_filter=True)
    text = " ".join(s.text.strip() for s in segments).strip()
    return {
        "text": text,
        "lang": getattr(info, "language", None),
        "lang_p": round(float(getattr(info, "language_probability", 0.0)), 3),
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="ASR рефов кастов -> JSON (prompt_text для Hi-Fi)")
    ap.add_argument("--cast", action="append", default=[], help="имя каста (повторяемо)")
    ap.add_argument("--all", action="store_true", help="все касты, кроме отложенных")
    ap.add_argument("--model", default="small", help="faster-whisper модель (default small)")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--force", action="store_true", help="пересчитать даже сExisting записью")
    args = ap.parse_args()

    names = sorted(args.cast) if args.cast else sorted(p.name for p in CASTS_DIR.iterdir() if p.is_dir())
    todo = []
    for n in names:
        wav = CASTS_DIR / n / f"{n}.wav"
        if n in DEFERRED:
            print(f"SKIP {n}: отложен владельцем (2026-10-27)")
            continue
        if not wav.is_file():
            print(f"SKIP {n}: нет рефа {wav.name}", file=sys.stderr)
            continue
        todo.append((n, wav))
    if not todo:
        print("нечего расшифровывать")
        return 1

    out_path = Path(args.out)
    data = {}
    if out_path.is_file() and not args.force:
        try:
            data = json.loads(out_path.read_text(encoding="utf-8"))
        except Exception:
            data = {}
    todo = [(n, w) for n, w in todo if n not in data or args.force]
    if not todo:
        print(f"всё уже расшифровано в {out_path}")
        return 0

    from faster_whisper import WhisperModel

    t0 = time.time()
    print(f"модель {args.model}: загрузка...")
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    print(f"модель за {time.time() - t0:.1f}с, файлов: {len(todo)}")

    for n, wav in todo:
        t1 = time.time()
        try:
            r = transcribe(model, wav)
        except Exception as e:  # fail-soft: один битый файл не роняет батч
            print(f"FAIL {n}: {e}", file=sys.stderr)
            continue
        data[n] = r
        print(f"{n}: [{time.time() - t1:.1f}с lang={r['lang']} p={r['lang_p']}] {r['text'][:100]}")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"итого в {out_path}: {len(data)} записей, за {time.time() - t0:.1f}с")
    return 0


if __name__ == "__main__":
    sys.exit(main())
