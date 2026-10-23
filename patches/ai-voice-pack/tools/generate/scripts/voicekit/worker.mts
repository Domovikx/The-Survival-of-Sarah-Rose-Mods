/**
 * worker.mts — клиент инференс-шима cosyworker.py (JSON-lines через stdin/stdout).
 *
 * Протокол v2 (миграция python → TS, 2026-10-23, см. AGENTS.md):
 *   -> {"id": N, "cmd": "gen", "text", "ref", "emotion", "seed"}
 *   <- {"id": N, "ok": true, "pcm_b64", "sr", "raw_dur"}
 *      | {"id": N, "ok": false, "error"}
 *   -> {"id": N, "cmd": "ping"}
 *   <- {"id": N, "ok": true, "device", "model_loaded"}
 *   -> {"cmd": "quit"}   <- шим завершается с кодом 0
 *
 * pcm_b64 — сырой PCM (float32 LE mono, sr = sample_rate модели). Всё после
 * инференса живёт ЗДЕСЬ: ретрай TextEncodeInput → trim (voicekit/trim.mts)
 * → ffmpeg-цепочка корпусного формата (voicekit/audio.mts) → GenResult
 * {ok, dur, saved} — внешняя форма не менялась, voice_batch.mts не тронут.
 *
 * stdin/stdout, а не HTTP-порт: процесс живёт ровно столько, сколько живёт
 * оркестратор (модель грузится ОДИН раз на батч — главный источник выигрыша,
 * model load ~12.7s на RTX 5070 Ti). stdout зарезервирован под протокол,
 * все логи шима и СВОИ логи кодирования идут в onLog.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

import { opusPathFor, saveWavChain, tensorToOpus } from "./audio.mts";
import { trimTailBurst } from "./trim.mts";

/** Задание на генерацию одной фразы. */
export interface GenRequest {
  text: string;
  ref: string;
  emotion?: string | null;
  seed?: number;
  /** Куда писать (wav-имя; opus — рядом с тем же именем). Файл пишет worker. */
  out: string;
  /** Паритет старой шим-ветки: пропустить pipe и написать wav+levelnorm+opus. */
  keep_wav?: boolean;
}

export interface GenResult {
  ok: boolean;
  dur?: number;
  saved?: string;
  error?: string;
}

export interface PingResult {
  ok: boolean;
  device?: string;
  model_loaded?: boolean;
  error?: string;
}

export interface WorkerOptions {
  /** Путь к python (venv CosyVoice: C:/tools/cosyvoice3/.venv/Scripts/python.exe). */
  python: string;
  /** Путь к скрипту шима (cosyworker.py). */
  script: string;
  /** Доп. аргументы шима (--device cuda и пр.). */
  args?: string[];
  /** Таймаут одного запроса, мс (default 5 мин — генерация на CPU дольше). */
  requestTimeoutMs?: number;
  /** Логи: stderr шима + свои строки кодирования (trim/saved/WARN). */
  onLog?: (line: string) => void;
}

interface Pending {
  resolve: (v: Record<string, unknown>) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Живой инференс-процесс: spawn → ping (модель загружена) → generate×N → quit.
 * Один клиент = один процесс = одна загруженная модель.
 */
export class VoiceWorker {
  private proc: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private dead = false;
  private exitCode: number | null = null;
  private exitPromise: Promise<number | null>;
  private exitResolve!: (code: number | null) => void;
  private readonly opts: WorkerOptions;
  private readonly timeoutMs: number;

  constructor(opts: WorkerOptions) {
    this.opts = opts;
    this.timeoutMs = opts.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.exitPromise = new Promise((r) => (this.exitResolve = r));
    this.proc = spawn(opts.python, [opts.script, ...(opts.args ?? [])], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      // Контракт UTF-8 с обеих сторон: без него stdin шима читал JSON в cp1251
      // (мохибака в тексте фраз, бага 2026-10-23). Двойная защита наряду с
      // sys.stdin.reconfigure в cosyworker.py.
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    const proto = createInterface({ input: this.proc.stdout });
    proto.on("line", (line) => this.onProtocolLine(line));
    const logs = createInterface({ input: this.proc.stderr });
    logs.on("line", (line) => opts.onLog?.(line));
    this.proc.on("error", (err) => {
      this.dead = true;
      this.failAll(new Error(`шим не запустился: ${err.message}`));
      this.exitResolve(null);
    });
    this.proc.on("exit", (code) => {
      this.dead = true;
      this.exitCode = code;
      this.failAll(new Error(`шим завершился (код ${code})`));
      this.exitResolve(code);
    });
  }

  /** Шим жив? (после quit/падения — false) */
  get alive(): boolean {
    return !this.dead;
  }

  private onProtocolLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.opts.onLog?.(`[worker] не-JSON в stdout: ${line}`);
      return;
    }
    const id = typeof msg.id === "number" ? msg.id : null;
    if (id === null) return; // события без id (пока не предусмотрены)
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(msg);
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private send(obj: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.dead) return Promise.reject(new Error(`шим уже завершён (код ${this.exitCode})`));
    const id = typeof obj.id === "number" ? obj.id : this.nextId++;
    const msg = { ...obj, id };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`запрос #${id} не получил ответ за ${this.timeoutMs} мс`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify(msg) + "\n", (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`запись в stdin шима не удалась: ${err.message}`));
        }
      });
    });
  }

  /** Проверка: процесс отвечает, модель загружена. */
  async ping(): Promise<PingResult> {
    const r = await this.send({ cmd: "ping" });
    return r as unknown as PingResult;
  }

  /**
   * Сгенерировать одну фразу: шим → PCM → trim → opus (или wav-фолбэк)
   * по пути req.out. Fail-soft как python cmd_gen: ошибка кодирования →
   * ok:false, исключение не летит наружу.
   */
  async generate(req: GenRequest): Promise<GenResult> {
    const t0 = Date.now();
    let r = await this.sendGen(req);
    if (!r.ok && typeof r.error === "string" && r.error.includes("TextEncodeInput")) {
      // Холодный фронтенд wetext: ПЕРВАЯ строка после загрузки модели бьётся
      // о TextEncodeInput (гонка анонимной докачки влажного фронтенда), вторая
      // после — проходит (бага 2026-10-23). Один повтор через 3с — докачка
      // успевает. Раньше повтор жил в cosyworker.py; в миграции python → TS
      // переехал сюда (гард — voice_batch.test.mts, живой тест — WARMUP в
      // fake_worker.mts).
      this.opts.onLog?.("  WARN: фронтенд ещё прогревается (TextEncodeInput) — повтор через 3с");
      await new Promise((res) => setTimeout(res, 3000));
      r = await this.sendGen(req);
    }
    if (!r.ok) {
      return { ok: false, error: typeof r.error === "string" ? r.error : "неизвестная ошибка шима" };
    }
    try {
      return this.encode(r, req, Date.now() - t0);
    } catch (e) {
      const msg = e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
      this.opts.onLog?.(`  !! FAIL: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  private sendGen(req: GenRequest): Promise<Record<string, unknown>> {
    return this.send({
      cmd: "gen",
      text: req.text,
      ref: req.ref,
      emotion: req.emotion ?? null,
      seed: req.seed ?? 42,
    });
  }

  /** PCM из шима → trim → корпусное кодирование → GenResult. */
  private encode(r: Record<string, unknown>, req: GenRequest, genMs: number): GenResult {
    const sr = Number(r.sr);
    const pcmB64 = typeof r.pcm_b64 === "string" ? r.pcm_b64 : "";
    if (!pcmB64 || !Number.isFinite(sr) || sr <= 0) {
      return { ok: false, error: "шим вернул пустой pcm/sr" };
    }
    const bytes = Buffer.from(pcmB64, "base64");
    if (bytes.length === 0 || bytes.length % 4 !== 0) {
      return { ok: false, error: `шим вернул некратный pcm (${bytes.length} байт)` };
    }
    // slice — копия: буфер пула Buffer может не быть выровнен по 4
    const raw = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const { samples, cuts } = trimTailBurst(raw, sr);
    mkdirSync(dirname(req.out), { recursive: true });
    const dur = Math.round((samples.length / sr) * 100) / 100;

    let saved: string;
    if (req.keep_wav) {
      if (!saveWavChain(samples, sr, req.out)) {
        this.opts.onLog?.("  WARN: opus-конверт не удался, wav остаётся фолбэком");
      }
      saved = req.out;
    } else if (tensorToOpus(samples, sr, req.out)) {
      saved = opusPathFor(req.out);
    } else {
      this.opts.onLog?.("  WARN: pipe-конверт не удался — пишу wav-фолбэк");
      if (!saveWavChain(samples, sr, req.out)) {
        this.opts.onLog?.("  WARN: opus-конверт не удался, wav остаётся фолбэком");
      }
      saved = req.out;
    }
    if (cuts.length) {
      const parts = cuts.map((c) => `burst ${Math.round(c.durMs)}ms after ${Math.round(c.gapMs)}ms gap`);
      this.opts.onLog?.(`  trim: ${parts.join(", ")}`);
    }
    this.opts.onLog?.(`  saved ${saved} (${dur.toFixed(1)}s, gen ${(genMs / 1000).toFixed(1)}s)`);
    return { ok: true, dur, saved };
  }

  /** Грейсфул-остановка: {"cmd":"quit"} → ждём exit. Уже мёртвому — no-op. */
  async quit(): Promise<number | null> {
    if (this.dead) return this.exitCode;
    try {
      this.proc.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n");
    } catch {
      /* stdin уже закрыт — упадём в kill ниже */
    }
    const withTimeout = Promise.race([this.exitPromise, new Promise<null>((r) => setTimeout(() => r(null), 15_000))]);
    const code = await withTimeout;
    if (code === null && !this.dead) this.kill();
    return code;
  }

  /** Форс-kill (после quit с таймаутом или из finally). */
  kill(): void {
    if (!this.dead) this.proc.kill();
  }
}
