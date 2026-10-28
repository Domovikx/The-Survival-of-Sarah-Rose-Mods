#!/usr/bin/env python
"""voxcpmworker.py — ИНФЕРЕНС-ШИМ VoxCPM2 (OpenBMB), протокол v2.

Роль и протокол — ТА ЖЕ, что у cosyworker.py (см. его докстринг и AGENTS.md
«Миграция python → TypeScript»): python остаётся только из-за torch;
TS-клиент (voicekit/worker.mts) шлёт задания JSON-lines, шим отдаёт СЫРОЙ
PCM, trim/opus делает TS.

Отличие от cosyworker: инференс VoxCPM2 (Controllable Cloning рефом),
эмояция подаётся СТИЛЕВЫМ ПРЕФИКСОМ к тексту `(<emotion>)<text>` (формат
офиц. README; проверено пробой tmp/voxcpm2/voxcpm2_probe.py — вердикт
владельца: «VoxCPM2 однозначно лучший», задача
tasks/archive/2026-10-26-voxcpm2-research.md). `seed` шим НЕ принимает:
generate() у voxcpm2 жёсткой сигнатуры без seed (зафиксировано в ресёрче).

ПРОТОКОЛ v2 (stdout — только JSON-ответы, логи — в stderr):
  -> {"id": 1, "cmd": "ping"}
  <- {"id": 1, "ok": true, "device": "cuda ...", "model_loaded": true}
  -> {"id": 2, "cmd": "gen", "text": "...", "ref": "C:/.../X.wav",
      "emotion": "..."|null, "opts": {...}|null}
      ("prompt_text": "..."|null — опц., Hi-Fi Cloning 2026-10-28),
  <- {"id": 2, "ok": true, "pcm_b64": "...", "sr": 48000, "raw_dur": 6.6}
     или {"id": 2, "ok": false, "error": "..."}
  -> {"cmd": "quit"}  -> ответ {"ok": true}, процесс завершается (код 0)

pcm_b64 — СЫРОЙ PCM: float32 LE mono, sr = sample_rate модели.

opts — ОПЦИОНАЛЬНЫЙ объект переопределений генерации (стенд перебора конфигов
voxcpm_bench.mts): ключи GEN_OPTS + "seed". Отсутствующий ключ = дефолт шима
(CLI --cfg-value/--timesteps) либо дефолт самой модели. Без opts поведение
ПРОДАКШЕНА НЕ МЕНЯЕТСЯ. seed -> torch.manual_seed (best-effort:
воспроизводимость стенда, CUDA не fully детерминирован).

ЗАПУСК (TS-клиент сам спавнит):
  C:\\tools\\voxcpm2\\.venv\\Scripts\\python.exe voxcpmworker.py
"""

import argparse
import base64
import json
import os
import sys
import time

os.environ.setdefault("HF_HUB_OFFLINE", "0")

# DLL-каталог для torchcodec (torchaudio 2.11 читает аудио ТОЛЬКО через него,
# а ему нужны shared-DLL ffmpeg; gyan-ffmpeg статический -> ставим shared-сборку
# в C:/tools/ffmpeg-shared). Патч ТОЛЬКО нашего процесса, чужие файлы не трогаем.
def _add_ffmpeg_dlls() -> None:
    root = "C:/tools/ffmpeg-shared"
    if not os.path.isdir(root):
        return
    for entry in sorted(os.listdir(root), reverse=True):
        bin_dir = os.path.join(root, entry, "bin")
        if os.path.isdir(bin_dir):
            _DLL_DIRS.append(os.add_dll_directory(os.path.abspath(bin_dir)))  # держим хэндл живым
            return
        if entry.lower().startswith("avcodec") and entry.lower().endswith(".dll"):
            _DLL_DIRS.append(os.add_dll_directory(os.path.abspath(root)))
            return


_DLL_DIRS: list = []
_add_ffmpeg_dlls()

import numpy as np  # noqa: E402
import torch  # noqa: E402
from voxcpm import VoxCPM  # noqa: E402

MODEL_DIR = r"C:/tools/voxcpm2/models/VoxCPM2"
# Дефолты генерации VoxCPM2 (вердикт владельца 2026-10-27, пятая итерация):
# ЛЕСТНИЦА КОНФИГОВ (глобальная): старт 2.6 («максимальная яркость», но часто
# сваливается в ОР) -> судья бракует -> cfg -0.2 за круг: 2.6/2.4/2.2/2.0/1.8/1.6.
# Пол 1.6: ниже — значит проблема не в cfg, смотреть иное (speed и пр.).
# Страховка перебора — судья vox_qc (потолок >=15% -> REJECT, F0-свинг/регистр).
# История: cfg3.0 «захлебывался» -> 2.5 выиграл артефактную фразу, но «орил»
# часть фраз (oversaturation; TTS-литература: оптимум 1.2-2.5).
# ts30 оставлен: «больше шагов -> детальнее», ~2x времени против ts10.
DEFAULT_CFG = 2.6
DEFAULT_TIMESTEPS = 30


def elog(msg):
    """Лог в stderr (stdout зарезервирован под протокол)."""
    print(msg, file=sys.stderr, flush=True)


def respond(obj):
    """Один JSON-ответ в stdout."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


class Worker:
    """Модель + обработчики команд протокола (инференс, без аудио-цепочки)."""

    # Опции генерации, переопределяемые запросом через "opts" (стенд
    # voxcpm_bench.mts). Отсутствующие берутся из CLI-дефолтов шима/модели.
    GEN_OPTS = (
        "cfg_value",
        "inference_timesteps",
        "normalize",
        "retry_badcase",
        "retry_badcase_max_times",
        "retry_badcase_ratio_threshold",
        "min_len",
        "max_len",
        "denoise",
    )

    def __init__(self, args):
        self.args = args
        self.model = None
        self.sample_rate = None

    def load_model(self):
        """Однократная загрузка модели (до входа в цикл stdin)."""
        t0 = time.time()
        # ДЕНОЙЗЕР ВКЛ ПО УМОЛЧАНИЮ (владелец 2026-10-28, прод-конфиг cfg2.6/ts30/dn);
        # VOXCPM_DENOISER=0 — отключить загрузку (отладка/память).
        self.denoiser_on = os.environ.get("VOXCPM_DENOISER", "1") != "0"
        self.model = VoxCPM.from_pretrained(self.args.model_dir, load_denoiser=self.denoiser_on)
        self.sample_rate = int(self.model.tts_model.sample_rate)
        dev = "cpu"
        if torch.cuda.is_available():
            dev = "cuda ({}, {:.0f} ГБ)".format(
                torch.cuda.get_device_name(0),
                torch.cuda.get_device_properties(0).total_memory / 2**30,
            )
        elog(
            "voxcpm2 loaded in {:.1f}s (cfg {}, timesteps {}, sr {}, device {})".format(
                time.time() - t0, self.args.cfg_value, self.args.timesteps, self.sample_rate, dev
            )
        )

    def gen_one(self, text, ref, emotion, opts, prompt_text=None):
        """Одна фраза: реф + текст -> np-массив речи.

        emotion — стиль-префикс Controllable Cloning `(<emotion>)text`.
        opts — переопределения генерации (см. GEN_OPTS); без них — дефолты.
        prompt_text — Hi-Fi Cloning (2026-10-28): точная расшифровка рефа.
        Ошибки НЕ перехватываем: fail -> ok:false, повтор владеет worker.mts.
        """
        if prompt_text:
            # Hi-Fi ОТКЛОНЁН владельцем (2026-10-28): без эмоций не катит,
            # а с эмоциями офиц. API запрещает. Ветка спит (--hifi не дают).
            # Hi-Fi: офиц. API ЗАПРЕЩАЕТ control-instruction вместе с
            # prompt_text ("Cannot be used together") — голый текст, без (эмоции).
            # Иначе модель лепит префикс в речь (жалоба владельца 2026-10-28:
            # «добавился впереди какой-то текст»).
            prompt = text
        else:
            prompt = "({}){}".format(emotion, text) if emotion else text
        kw = {
            "text": prompt,
            "reference_wav_path": ref,
            "cfg_value": self.args.cfg_value,
            "inference_timesteps": self.args.timesteps,
        }
        if prompt_text:
            # Hi-Fi (офиц. API): prompt_wav_path + prompt_text ВМЕСТЕ с reference
            kw["prompt_wav_path"] = ref
            kw["prompt_text"] = prompt_text
            elog("  hifi clone: prompt_text {} симв".format(len(prompt_text)))
        for key in self.GEN_OPTS:
            if key in opts:
                kw[key] = opts[key]
        if self.denoiser_on:
            # denoise=True — прод-дефолт (2026-10-28); opt-out: --opt denoise=false
            kw.setdefault("denoise", True)
        if kw.get("denoise") and not self.denoiser_on:
            raise RuntimeError("denoise=True при VOXCPM_DENOISER=0 — денойзер не загружен (сними opt-out)")

        seed = opts.get("seed")
        if seed is not None:
            # Воспроизводимость стенда — best-effort (CUDA-латенты не fully
            # детерминированы, но один seed заметно сужает разброс).
            torch.manual_seed(int(seed))
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(int(seed))
        if opts:
            # Логируем ТОЛЬКО переопределения: прод-прогон без opts не засоряет
            # лог лишней строкой на фразу.
            elog("  gen opts: " + ", ".join("{}={}".format(k, kw[k]) for k in self.GEN_OPTS if k in kw))
        wav = self.model.generate(**kw)
        return wav

    def cmd_ping(self, req):
        dev = "cpu"
        if torch.cuda.is_available():
            dev = "cuda ({})".format(torch.cuda.get_device_name(0))
        return {"ok": True, "device": dev, "model_loaded": self.model is not None}

    def cmd_gen(self, req):
        """Генерация одной фразы -> сырой PCM base64. Fail-soft -> ok:false."""
        text = req.get("text")
        ref = req.get("ref")
        if not text or not ref:
            return {"ok": False, "error": "нет text/ref в запросе"}
        if not os.path.exists(ref):
            return {"ok": False, "error": "реф не существует: {}".format(ref)}
        emotion = req.get("emotion") or None
        prompt_text = req.get("prompt_text") or None
        opts = req.get("opts") or {}
        if not isinstance(opts, dict):
            return {"ok": False, "error": "opts должен быть объектом: {!r}".format(type(opts).__name__)}
        t0 = time.time()
        try:
            wav = self.gen_one(text, ref, emotion, opts, prompt_text)
            sr = int(self.sample_rate)
            arr = np.asarray(wav)
            if arr.ndim == 2:
                # (1, N) или (N, 1) — сводим к mono
                arr = arr.reshape(-1)
            elif arr.ndim != 1:
                return {"ok": False, "error": "неожиданная размерность: ndim {}".format(arr.ndim)}
            if arr.size == 0:
                return {"ok": False, "error": "модель вернула пустой массив"}
            arr = np.ascontiguousarray(arr, dtype="<f4")
            pcm = arr.tobytes()
            dur = arr.size / sr
            elog("  pcm {:.2}s (gen {:.1f}s)".format(dur, time.time() - t0))
            return {
                "ok": True,
                "pcm_b64": base64.b64encode(pcm).decode("ascii"),
                "sr": sr,
                "raw_dur": round(dur, 2),
            }
        except Exception as e:  # noqa: BLE001 — fail-soft протокола
            elog("  !! FAIL: {!r}".format(e))
            return {"ok": False, "error": "{}: {}".format(type(e).__name__, e)}

    def dispatch(self, req):
        """Маршрутизация одной команды (quit обрабатывается циклом main)."""
        cmd = req.get("cmd")
        if cmd == "ping":
            return self.cmd_ping(req)
        if cmd == "gen":
            return self.cmd_gen(req)
        return {"ok": False, "error": "неизвестная команда: {!r}".format(cmd)}


def main():
    ap = argparse.ArgumentParser(description="TSSR inference shim (VoxCPM2)")
    ap.add_argument("--model-dir", default=MODEL_DIR, help="каталог модели openbmb/VoxCPM2")
    ap.add_argument("--cfg-value", type=float, default=DEFAULT_CFG)
    ap.add_argument("--timesteps", type=int, default=DEFAULT_TIMESTEPS)
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        # stdin тоже UTF-8 (бага 2026-10-23: cp1251 жевал JSON от node)
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001 — reconfigure недоступен на старых python
        pass

    worker = Worker(args)
    worker.load_model()
    elog("worker: жду задания по stdin (JSON-lines)")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:  # noqa: BLE001
            respond({"ok": False, "error": "не-JSON во входе: {}".format(e)})
            continue
        if req.get("cmd") == "quit":
            respond({"ok": True})
            break
        resp = worker.dispatch(req)
        resp["id"] = req.get("id")
        respond(resp)

    elog("worker: quit, выхожу")
    return 0


if __name__ == "__main__":
    sys.exit(main())
