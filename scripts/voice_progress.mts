/**
 * voice_progress.mts — прогресс ПОЛНОЙ озвучки: сколько строк записано из
 * плана, с какой скоростью идёт запись и сколько осталось.
 *
 * Зачем: пользователи спрашивают «как идёт полная озвучка EN» — эти числа
 * нужны публично (блок на лендинге) и в пульте.
 *
 * Источники — только факты с диска:
 *   • сколько записано и план — `voice_status.mts` (`countDone`/`plan`);
 *   • скорость — mtime файлов корпуса за последний час (движок пишет файл на
 *     каждую реплику), поэтому цифра не зависит от формата логов и одинаково
 *     работает для `voice_batch` и легаси-очередей.
 * Считаем ТОЛЬКО имена по контракту `{en12}-{state6} {variant}.opus`: бенч
 * складывал в audio/ имена `{uid}__{voice}__Vox...`, которые игра не находит
 * (инцидент 2026-11-20), и по ним «прогресс» был фиктивным.
 *
 * Запуск (из корня репы):
 *   node scripts/voice_progress.mts            # напечатать + обновить файл сайта
 *   node scripts/voice_progress.mts --no-write # только напечатать
 *   node scripts/voice_progress.mts --json     # снимок в stdout (для скриптов)
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { countDone, plan as voicePlan } from "../patches/ai-voice-pack/tools/generate/scripts/voice_status.mts";
import { parseVoiceName } from "../patches/ai-voice-pack/tools/generate/scripts/voice_names.mts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO_DIR = join(ROOT, "patches", "ai-voice-pack", "audio");
const SITE_FILE = join(ROOT, "site", "src", "shared", "config", "voice-progress.generated.ts");

/** Язык «в фокусе» публичного прогресса: полная озвучка пишется первой. */
export const FOCUS_LANG = "en";

/** Файл корпуса по контракту: где лежит и когда записан. */
export type CorpusFile = { arc: string; name: string; mtimeMs: number };

/**
 * Скан корпуса языка: ТОЛЬКО файлы с именем по контракту (base32-схема).
 * Возвращает файлы и самый свежий из них — по нему видно, идёт ли запись.
 */
export const scanCorpus = (lang: string, audioDir = AUDIO_DIR): CorpusFile[] => {
  const base = join(audioDir, lang);
  const files: CorpusFile[] = [];
  let arcs: string[];
  try {
    arcs = readdirSync(base);
  } catch {
    return files;
  }
  for (const arc of arcs) {
    const dir = join(base, arc);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue; // гонка с генерацией/удалением папки
    }
    for (const name of names) {
      if (!name.endsWith(".opus") && !name.endsWith(".wav")) continue;
      if (!parseVoiceName(name)) continue; // бенч-имя → игра его не видит
      try {
        files.push({ arc, name, mtimeMs: statSync(join(dir, name)).mtimeMs });
      } catch {
        /* файл увели между readdir и stat */
      }
    }
  }
  return files;
};

/**
 * Скорость записи, файлов/мин — по mtime за последний час.
 *
 * Окно само подстраивается: берём файлы не старше часа и делим на реальный
 * интервал от самого старого из них, но не меньше 5 минут (иначе первый файл
 * нового прогона дал бы «бесконечность»). Меньше двух файлов — скорости нет.
 */
export const rateFrom = (files: CorpusFile[], nowMs = Date.now(), windowMin = 60): number | null => {
  const from = nowMs - windowMin * 60_000;
  const recent = files.filter((f) => f.mtimeMs >= from);
  if (recent.length < 2) return null;
  const oldest = recent.reduce((a, f) => Math.min(a, f.mtimeMs), nowMs);
  const spanMin = Math.max(5, (nowMs - oldest) / 60_000);
  return recent.length / spanMin;
};

/** Идёт ли запись: последний файл корпуса записан меньше `idleMin` минут назад. */
export const isRecording = (files: CorpusFile[], nowMs = Date.now(), idleMin = 5): boolean =>
  files.length > 0 && nowMs - files.reduce((a, f) => Math.max(a, f.mtimeMs), 0) < idleMin * 60_000;

/** Снимок прогресса одного языка: сколько записано, сколько всего, скорость. */
export type LangSnapshot = {
  lang: string;
  done: number;
  plan: number;
  arcsDone: number;
  arcsTotal: number;
  /** Файлов в минуту (по mtime), null — запись не идёт или мерить нечего. */
  ratePerMin: number | null;
  /** Минут до полной озвучки языка при измеренной скорости. */
  etaMin: number | null;
};

/** Снимок одного языка. `nowMs` — для тестов/воспроизводимости. */
export const langSnapshot = (lang: string, nowMs = Date.now(), audioDir = AUDIO_DIR): LangSnapshot => {
  const plan = voicePlan(lang);
  const made = countDone(lang);
  const planTotal = [...plan.values()].reduce((a, b) => a + b, 0);
  let arcsDone = 0;
  for (const [arc, n] of plan) if (n > 0 && (made.made.get(arc) ?? 0) >= n) arcsDone++;
  const files = scanCorpus(lang, audioDir);
  const rate = isRecording(files, nowMs) ? rateFrom(files, nowMs) : null;
  const remaining = Math.max(0, planTotal - made.total);
  return {
    lang,
    done: made.total,
    plan: planTotal,
    arcsDone,
    arcsTotal: plan.size,
    ratePerMin: rate ? Math.round(rate * 10) / 10 : null,
    etaMin: rate && rate > 0 ? Math.round(remaining / rate) : null,
  };
};

/** Текст сгенерированного модуля сайта (данные, без логики). */
export const siteModule = (en: LangSnapshot, updatedAt: string): string =>
  `/**
 * СГЕНЕРИРОВАНО — руками не править.
 *
 * Источник: \`scripts/voice_progress.mts\` (счётчики — voice_status.mts,
 * скорость — mtime файлов корпуса, только имена по контракту). Перегенерация:
 * \`node scripts/voice_progress.mts\` и деплой сайта.
 */
export type VoiceProgressData = {
  /** Когда снят снимок (ISO 8601). */
  updatedAt: string;
  /** Полная озвучка английского: сколько строк записано и сколько всего. */
  en: {
    done: number;
    plan: number;
    arcsDone: number;
    arcsTotal: number;
    ratePerMin: number | null;
    etaMin: number | null;
  };
};

export const VOICE_PROGRESS: VoiceProgressData = ${JSON.stringify(
    {
      updatedAt,
      en: {
        done: en.done,
        plan: en.plan,
        arcsDone: en.arcsDone,
        arcsTotal: en.arcsTotal,
        ratePerMin: en.ratePerMin,
        etaMin: en.etaMin,
      },
    },
    null,
    2,
  )};
`;

const fmt = (n: number): string => n.toLocaleString("ru-RU");
const human = (min: number | null): string => {
  if (min === null) return "—";
  if (min < 90) return `${min} мин`;
  const h = min / 60;
  if (h < 36) return `${h.toFixed(1)} ч`;
  return `${(h / 24).toFixed(1)} сут`;
};

const main = (argv: string[]): number => {
  const nowMs = Date.now();
  const write = !argv.includes("--no-write");
  const json = argv.includes("--json");
  const en = langSnapshot(FOCUS_LANG, nowMs);
  const pct = en.plan ? ((100 * en.done) / en.plan).toFixed(1) : "0.0";
  if (json) {
    console.log(JSON.stringify({ updatedAt: new Date(nowMs).toISOString(), en }, null, 2));
    return 0;
  }
  console.log(`Полная озвучка ${FOCUS_LANG.toUpperCase()}: ${fmt(en.done)} / ${fmt(en.plan)} строк (${pct}%)`);
  console.log(`арок закрыто: ${en.arcsDone} / ${en.arcsTotal}`);
  console.log(`скорость: ${en.ratePerMin === null ? "запись не идёт" : en.ratePerMin + " строк/мин"}`);
  console.log(`осталось при этой скорости: ${human(en.etaMin)}`);
  if (write) {
    writeFileSync(SITE_FILE, siteModule(en, new Date(nowMs).toISOString()), "utf-8");
    console.log(`снимок для сайта: ${SITE_FILE}`);
  }
  return 0;
};

/** Запуск только при прямом вызове файла (импорт из пульта не пишет файлы). */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
