/**
 * llm_backend.mts — единый переключатель локальных LLM-бэкендов (пульт).
 *
 * Зачем: бэкендов несколько (Strata/Colibri/LM Studio), и раньше при каждом
 * переключении приходилось править дефолты в шести файлах. Теперь источник
 * истины один: реестр ниже + конфиг tmp/llm_backend.json (пишет CLI `use`).
 *
 * Приоритет разрешения (выше → ниже):
 *   1. env TSSR_LLM_URL / TSSR_LLM_MODEL   — разовый оверрайд (URL и/или модель);
 *   2. env TSSR_LLM=<name>                 — выбор из реестра через окружение;
 *   3. конфиг tmp/llm_backend.json         — «постоянное» переключение (CLI `use`);
 *   4. дефолт реестра (strata).
 * CLI-флаги `--base-url` / `--model` у потребителей выше ВСЕГО этого.
 *
 * Использование:
 *   node scripts/llm_backend.mts list              # реестр бэкендов
 *   node scripts/llm_backend.mts show              # активный + откуда взят
 *   node scripts/llm_backend.mts status            # проба портов: кто поднят
 *   node scripts/llm_backend.mts use colibri       # переключить (пишет конфиг)
 *   node scripts/llm_backend.mts use --url http://127.0.0.1:9 --model foo
 *   TSSR_LLM=strata node ...                       # разовый выбор через env
 *
 * Потребители: po_translate, po_judge_check, commit_msg, emotion_judge,
 * emotion_tag (импорт resolveBackend; дефолты флагов берутся отсюда).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface LlmBackend {
  name: string;
  /** Базовый URL без /v1 (например http://127.0.0.1:8080). */
  url: string;
  model: string;
}

/** Реестр поддерживаемых бэкендов (порт/модель по умолчанию). */
export const REGISTRY: Record<string, LlmBackend> = {
  strata: {
    name: "strata",
    url: "http://127.0.0.1:8080",
    model: "qwen3.6-35b-a3b-ud-q4_k_xl",
  },
  colibri: {
    name: "colibri",
    url: "http://127.0.0.1:8000",
    model: "qwen3.6-colibri",
  },
  lmstudio: {
    name: "lmstudio",
    url: "http://127.0.0.1:1234",
    model: "qwen/qwen3.5-9b",
  },
};

const DEFAULT_NAME = "strata";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(REPO, "tmp", "llm_backend.json");

interface ConfigFile {
  name?: string;
  url?: string;
  model?: string;
}

function readConfig(): ConfigFile | null {
  if (!existsSync(CONFIG)) return null;
  try {
    const j = JSON.parse(readFileSync(CONFIG, "utf-8")) as ConfigFile;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null; // повреждённый конфиг — молча на дефолт (не роняем пайплайн)
  }
}

function byName(name: string | undefined): LlmBackend | null {
  return name && REGISTRY[name] ? REGISTRY[name] : null;
}

/** Источник активного бэкенда (для `show`/диагностики). */
export function backendSource(): "env" | "env-name" | "config" | "default" {
  if (process.env.TSSR_LLM_URL || process.env.TSSR_LLM_MODEL) return "env";
  if (byName(process.env.TSSR_LLM)) return "env-name";
  const cfg = readConfig();
  if (cfg && (byName(cfg.name) || (cfg.url && cfg.model))) return "config";
  return "default";
}

/** Активный бэкенд: env → конфиг → дефолт (см. шапку модуля). */
export function resolveBackend(): LlmBackend {
  const base =
    byName(process.env.TSSR_LLM) ??
    (() => {
      const cfg = readConfig();
      if (!cfg) return null;
      const named = byName(cfg.name);
      if (named) return named;
      if (cfg.url && cfg.model) return { name: cfg.name ?? "custom", url: cfg.url, model: cfg.model };
      return null;
    })() ??
    REGISTRY[DEFAULT_NAME];

  return {
    name: base.name,
    url: process.env.TSSR_LLM_URL ?? base.url,
    model: process.env.TSSR_LLM_MODEL ?? base.model,
  };
}

/** Пишет конфиг переключения (tmp/llm_backend.json). */
export function writeConfig(b: LlmBackend): void {
  writeFileSync(CONFIG, `${JSON.stringify(b, null, 2)}\n`, "utf-8");
}

/** Проба /v1/models: бэкенд поднят и отвечает? */
async function probe(b: LlmBackend): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${b.url}/v1/models`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok ? "UP  " : `HTTP ${r.status}`;
  } catch {
    return "down";
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (n: string): string | undefined => {
    const i = rest.indexOf(`--${n}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (!cmd || cmd === "show") {
    const b = resolveBackend();
    console.log(`активный: ${b.name} | ${b.url} | ${b.model} | источник: ${backendSource()}`);
    return;
  }
  if (cmd === "list") {
    for (const b of Object.values(REGISTRY)) console.log(`${b.name.padEnd(10)} ${b.url}  ${b.model}`);
    return;
  }
  if (cmd === "status") {
    const active = resolveBackend();
    console.log(`активный: ${active.name} (${backendSource()})`);
    for (const b of Object.values(REGISTRY)) {
      const state = await probe(b);
      const mark = b.name === active.name ? "*" : " ";
      console.log(` ${mark} ${b.name.padEnd(10)} ${state.padEnd(6)} ${b.url}`);
    }
    return;
  }
  if (cmd === "use") {
    const name = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
    const url = flag("url");
    const model = flag("model");
    let target: LlmBackend;
    if (name) {
      const reg = byName(name);
      if (!reg) {
        console.error(`нет в реестре: ${name} (см. list)`);
        process.exit(2);
      }
      target = { ...reg };
    } else if (url && model) {
      target = { name: "custom", url, model };
    } else {
      console.error("use <name> | use --url URL --model NAME");
      process.exit(2);
    }
    if (url) target.url = url;
    if (model) target.model = model;
    writeConfig(target);
    console.log(`переключено: ${target.name} | ${target.url} | ${target.model}`);
    console.log("потребители подхватят при СЛЕДУЩЕМ запуске (конфиг читается на старте)");
    return;
  }
  console.error("команды: show | list | status | use <name>|use --url U --model M");
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
