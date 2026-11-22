/**
 * vox_queue.mts — ОЧЕРЕДЬ Vox-генерации: обход арок языка через voxcpm_bench
 * с --resume (задача 2026-10-30 «Vox: SB+WarArc на 11 языках», требование
 * владельца: «нужен планировщик чтобы продолжать после обрыва или остановки»).
 *
 * Запуск (из корня репы):
 *   node patches/ai-voice-pack/tools/generate/scripts/vox_queue.mts ru            # 3 стартовые арки
 *   node patches/ai-voice-pack/tools/generate/scripts/vox_queue.mts es WarArc     # одна арка
 *   node patches/ai-voice-pack/tools/generate/scripts/vox_queue.mts de --dry-run  # печать команд
 *   python tools/voice_ctl.py vox-start [lang|all]   # пульт (фоном, ниже приоритет)
 *   python tools/voice_ctl.py vox-stop / vox-pause / vox-resume
 *
 * Свойства:
 *   - RESUME: каждый прогон идёт с `--resume` — готовые opus пропускаются,
 *     убийство/обрыв/ребут не теряют прогресс, повторный запуск продолжает
 *     с места (файлы пишутся атомарно: wav -> .part -> rename);
 *   - арки ПО ПОРЯДКУ, лог append: tools/generate/output/voice/vox_gen_{lang}.log
 *     с маркерами `=== START/DONE lang arc HH:MM ===` — их же парсит
 *     voice_ctl (START_RE/DONE_RE), т.е. статус/пауза/стоп пульта видят очередь;
 *   - ПРОГРЕСС в формате voice_batch: строка `[i/N] vox {arc}` (i включает
 *     пропущенные resume'ом) — parse_progress_line пульта её читает без правок;
 *   - низкий приоритет python-шинов (wmic BelowNormal);
 *   - конфиг = ПРОЛОГ-конфиг (seed 49, cfg2.6/ts30/dn — вердикт владельца
 *     2026-10-29): тем же звучанием, что уже озвученный пролог;
 *   - Stop: Ctrl+C/kill раннера безопасен (текущая фраза может не дописаться —
 *     её нет в opus, resume перегенерирует).
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BENCH = join(SCRIPTS_DIR, "voxcpm_bench.mts");

/** Языки игры (11 po-языков): валидация аргумента и `all` в пульте. */
export const VOX_LANGS = ["ru", "en", "de", "es", "fr", "it", "ja", "ko", "pl", "pt", "zh"] as const;
/** Арки по умолчанию — три стартовые из диаграммы ветвления (docs/game-branching.puml). */
export const DEFAULT_ARCS = ["Prologue", "StoryBeginnings", "WarArc"] as const;
/** Конфиг пролога (238x11, коммиты 1bdaa17c0/264dc93ef): им озвучен пролог — им и SB/WarArc. */
export const PROLOGUE_CFG = { seed: 49, cfg: 2.6, ts: 30 } as const;
/** --picks >= размера пула = все фразы арки (selectSample режет Math.min). */
export const PICKS_ALL = "99999";

export interface QueueCli {
  lang: string;
  /** Арки-параметры после языка; пусто = DEFAULT_ARCS. */
  arcs: string[];
  /** Печать команд без запуска (--dry-run). */
  dryRun: boolean;
}

export function parseQueueCli(argv: string[]): QueueCli {
  const dryRun = argv.includes("--dry-run");
  const rest = argv.filter((a) => !a.startsWith("-"));
  const [lang, ...arcs] = rest;
  if (!lang) throw new Error("usage: node vox_queue.mts <lang> [arc...] [--dry-run]");
  if (!(VOX_LANGS as readonly string[]).includes(lang)) {
    throw new Error(`неизвестный язык "${lang}" — доступны: ${VOX_LANGS.join(", ")}`);
  }
  return { lang, arcs: arcs.length > 0 ? arcs : [...DEFAULT_ARCS], dryRun };
}

/** Аргументы запуска стенда для одной арки (конфиг пролога + resume). */
export function benchQueueArgs(lang: string, arc: string): string[] {
  return [
    BENCH,
    "--lang",
    lang,
    "--arc",
    arc,
    "--picks",
    PICKS_ALL,
    "--seed",
    String(PROLOGUE_CFG.seed),
    "--cfg",
    String(PROLOGUE_CFG.cfg),
    "--ts",
    String(PROLOGUE_CFG.ts),
    // denoise=true — прод-дефолт (2026-10-28); ЯВНЫМ --opt шим и корпус пролога
    // одновременно: без него шим денойзит и так (env VOXCPM_DENOISER=1), но имя
    // файла потеряло бы `_dn` и не легло бы рядом с существующим корпусом.
    "--opt",
    "denoise=true",
    "--resume",
  ];
}

/** Прогресс-состояние одного прогона по арке (парсит вывод стенда). */
export interface ProgressState {
  /** Сколько resume уже посчитал готовыми до этого прогона. */
  skipped: number;
  /** Сколько в работе (заголовок стенда `пронов=N` / `в работе N`). */
  remaining: number;
  /** Сколько фраз досгенерировано в ЭТОМ прогоне. */
  done: number;
}

export function progressState(): ProgressState {
  return { skipped: 0, remaining: 0, done: 0 };
}

/**
 * Строка вывода стенда -> новая строка прогресса пульта `[i/N] vox {arc}`
 * (формат PROGRESS_RE voice_ctl) или null. Считаются ТОЛЬКО завершённые
 * фразы (строка результата `..., gen Nс,`); план-листинг и FAIL не в счёт —
 * незавершённая фраза не попала в opus и будет доделана resume'ом.
 */
export function progressLine(line: string, st: ProgressState, arc: string): string | null {
  const skip = /resume: пропущено готовых (\d+), в работе (\d+)/.exec(line);
  if (skip) {
    st.skipped = Number(skip[1]);
    st.remaining = Number(skip[2]);
    if (st.remaining === 0) return `[${st.skipped}/${st.skipped}] vox ${arc}`;
    return null;
  }
  const hdr = /прогонов=(\d+)/.exec(line);
  if (hdr && st.remaining === 0) st.remaining = Number(hdr[1]);
  if (/^ {1,4}\d+\. .*gen /.test(line)) {
    st.done += 1;
    const total = st.skipped + st.remaining;
    if (total > 0) return `[${st.skipped + st.done}/${total}] vox ${arc}`;
  }
  return null;
}

/**
 * ОТКЛЮЧЕНО 2026-11-20. Очередь звала `voxcpm_bench`, а стенд пишет в
 * `audio/<lang>/<arc>/` бенч-имена `{uid}__{voice}__Vox_cfg...`. Движок ищет
 * `{en12}-{state6} {variant}.opus`, поэтому 5 часов прогона EN дали 1 851
 * файл, которого игра не видит, — а счётчики при этом показывали «прогресс».
 *
 * Канон: `voice_batch.mts --engine voxcpm2 --lang <l>` (он и есть `vox-start`
 * пульта): имя строит `voice_constants`-путь `voiceBase` из `voice_names.mts`.
 * Чистые функции (разбор CLI, аргументы стенда, разбор прогресса) остались —
 * на них тесты и расчёты.
 */
const main = (): number => {
  console.error("vox_queue: ОТКЛЮЧЕНО — писал имена не по контракту {en12}-{state6} {variant}.opus.");
  console.error("Полная озвучка: node voice_ctl.mts vox-start <lang>  (= voice_batch --engine voxcpm2)");
  return 2;
};

// Запуск только напрямую (импорт в тестах не исполняет очередь).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
