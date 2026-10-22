/**
 * worker.mts — клиент инференс-шима cosyworker.py (JSON-lines через stdin/stdout).
 *
 * Протокол v1 (решён 2026-09-22 ресёрчем, см. tasks/2026-10-21-voice-pipeline-ts-migration.md):
 *   -> {"id": N, "cmd": "gen", "text", "ref", "emotion", "seed", "out"}
 *   <- {"id": N, "ok": true, "dur", "saved"} | {"id": N, "ok": false, "error"}
 *   -> {"id": N, "cmd": "ping"}
 *   <- {"id": N, "ok": true, "device", "model_loaded"}
 *   -> {"cmd": "quit"}   <- шим завершается с кодом 0
 *
 * stdin/stdout, а не HTTP-порт: процесс живёт ровно столько, сколько живёт
 * оркестратор (модель грузится ОДИН раз на батч — главный источник выигрыша,
 * model load ~12.7s на RTX 5070 Ti). stdout зарезервирован под протокол,
 * все логи шима идут в stderr и уходят в onLog.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

/** Задание на генерацию одной фразы. */
export interface GenRequest {
  text: string;
  ref: string;
  emotion?: string | null;
  seed?: number;
  out: string;
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
  /** Строки stderr шима (логи генерации). */
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

  /** Сгенерировать одну фразу (реф → opus/wav на disk по пути out). */
  async generate(req: GenRequest): Promise<GenResult> {
    const r = await this.send({
      cmd: "gen",
      text: req.text,
      ref: req.ref,
      emotion: req.emotion ?? null,
      seed: req.seed ?? 42,
      out: req.out,
    });
    return r as unknown as GenResult;
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
