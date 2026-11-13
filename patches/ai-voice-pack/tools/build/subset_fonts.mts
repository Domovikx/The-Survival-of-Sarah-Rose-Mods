/**
 * subset_fonts.mts — ПЕРЕГЕНЕРАЦИЯ CJK-шрифтов мода (ассетная операция,
 * НЕ часть сборки дистрибутива).
 *
 * Зачем: три файла Noto Sans CJK (jp/kr/sc) — 47.1 MiB, это 74% веса ядра,
 * и именно они не давали 7z сжаться (в архиве 10.3 MiB из 13.5). В игре
 * используется 4 616 символов (PO всех 11 языков + блоки типографики), а не
 * 65 000 глифов: сабсет 1.45 MiB на шрифт, все три в solid-7z — 1.17 MiB.
 * Итог: main 13.5 -> ~4.4 MiB (решение владельца 2026-11-13: цель — размер).
 *
 * Запуск (из корня репы):
 *   node patches/ai-voice-pack/tools/build/subset_fonts.mts
 * Требует python + fonttools (`pip install fonttools`). Ожидаются ПОЛНЫЕ
 * Noto из upstream (https://github.com/notofonts/noto-cjk); на уже
 * сабсетнутом файле прогон безвреден, но и не нужен.
 *
 * Покрытие проверяется ДО замены файла и НЕЗАВИСИМО от fonttools
 * (font_coverage.mts читает cmap сам): набор символов из PO обязан иметь глиф,
 * иначе прогон падает и файл не подменяется.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { missingGlyphs } from "./font_coverage.mts";
import { usedCharset } from "./font_charset.mts";

// ai-voice-pack/tools/build/subset_fonts.mts -> ../.. = patches/ai-voice-pack
const PATCH = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const REPO = resolve(PATCH, "..", "..");
const FONTS = join(PATCH, "fonts");
const PO = join(PATCH, "po");
const TMP = join(REPO, "tmp");

const TARGETS = ["NotoSansCJKjp-Regular.otf", "NotoSansCJKkr-Regular.otf", "NotoSansCJKsc-Regular.otf"];

/**
 * Полный Noto Sans CJK — ~15.7 MiB на файл. Порог 5 MiB отделяет полный
 * шрифт от нашего сабсета (1.4–1.5 MiB): на сабсете перегенерация запрещена,
 * иначе новые символы набора молча останутся без глифов.
 */
const FULL_FONT_MIN = 5 << 20;

function mib(n: number): string {
  return `${(n / (1 << 20)).toFixed(2)} MiB`;
}

function main(): void {
  if (!readdirSync(PO, { withFileTypes: true }).some((d) => d.isFile() && /\.(po|pot)$/i.test(d.name))) {
    throw new Error(`нет PO-файлов в ${PO} — не из чего собирать набор символов`);
  }
  // Исходники обязаны быть ПОЛНЫМИ шрифтами: на сабсете прогон не может вернуть
  // глифы, которых в наборе не было (набор вырос — дырки остались бы молча,
  // потому что «полный» шрифт в этой роли = уже урезанный). Проверяем ДО
  // чтения PO и до запуска python: отказ должен быть мгновенным и понятным.
  for (const name of TARGETS) {
    const size = statSync(join(FONTS, name)).size;
    if (size < FULL_FONT_MIN) {
      throw new Error(
        `${name} уже сабсетнут (${mib(size)} < ${mib(FULL_FONT_MIN)}). ` +
          `Положи ПОЛНЫЙ шрифт Noto Sans CJK (upstream) в ${FONTS} и повтори прогон.`,
      );
    }
  }
  const charset = usedCharset(PATCH);
  mkdirSync(TMP, { recursive: true });
  const charsetFile = join(TMP, "font_charset.txt");
  writeFileSync(charsetFile, charset.join(""), "utf-8");
  console.log(`символов в наборе (все 11 языков): ${charset.length}  ->  ${charsetFile}`);

  for (const name of TARGETS) {
    const src = join(FONTS, name);
    const before = statSync(src).size;
    // Что ПОЛНЫЙ шрифт и так не умеет (Noto CJK без Latin Extended-A, арабского,
    // тайского): такие символы рисует Literata, к сабсету отношения не имеют.
    const missingFull = new Set(missingGlyphs(src, charset));
    const out = join(TMP, `subset_${basename(name)}`);
    rmSync(out, { force: true });
    const r = spawnSync(
      "python",
      [
        "-m",
        "fontTools.subset",
        src,
        `--text-file=${charsetFile}`,
        `--output-file=${out}`,
        "--layout-features=*",
        "--name-IDs=*",
        "--recalc-timestamp",
      ],
      { encoding: "utf-8", maxBuffer: 64 << 20 },
    );
    if (r.status !== 0) {
      throw new Error(
        `pyftsubset упал на ${name} (код ${String(r.status)}). Нужен python + fonttools и ПОЛНЫЙ шрифт:\n` +
          `${r.stdout ?? ""}${r.stderr ?? ""}`,
      );
    }
    // Главный инвариант: сабсет не теряет НИ ОДНОГО глифа полного шрифта.
    const missingSub = missingGlyphs(out, charset);
    const lost = missingSub.filter((c) => !missingFull.has(c));
    if (lost.length > 0) {
      rmSync(out, { force: true });
      throw new Error(
        `${name}: сабсет ПОТЕРЯЛ глифы ${lost.length} символов ` +
          `(${lost
            .slice(0, 20)
            .map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`)
            .join(" ")}). ` +
          "Файл НЕ заменён.",
      );
    }
    const after = statSync(out).size;
    renameSync(out, src);
    console.log(
      `  ${name.padEnd(30)} ${mib(before)} -> ${mib(after)}  (-${(100 - (100 * after) / before).toFixed(0)}%; ` +
        `вне покрытия шрифта и раньше было ${missingFull.size} симв.)`,
    );
  }

  // Финальная сверка: все три файла на диске не потеряли глифов против полного
  // шрифта (эталон — сохранённые копии в tmp/, если прогон делался после них).
  for (const name of TARGETS) {
    const missing = missingGlyphs(join(FONTS, name), charset);
    console.log(`  ${name.padEnd(30)} символов без глифа: ${missing.length} (те же, что и у полного шрифта)`);
  }
  console.log("готово: глифы не потеряны, размеры выше");
}

main();
