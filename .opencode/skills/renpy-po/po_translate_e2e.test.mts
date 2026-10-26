/**
 * E2E: живой перевод через реальную локальную LLM (LM Studio, qwen3.5-9b).
 *
 * Проверяет ЦЕПОЧКУ целиком: промпт (OUTPUT LANGUAGE + ключ tr + few-shot)
 * -> модель -> авточеки -> судья. Берёт РЕАЛЬНО отклонённые ранее строки и
 * смотрит, добиваются ли они теперь и, главное, что перевод идёт на ЦЕЛЕВОМ
 * языке (главная причина отказов всех языков).
 *
 * Запуск: TSSR_PO_E2E=1 node --test po_translate_e2e.test.mts
 */
import assert from "node:assert";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePo } from "./po_core.mts";
import { systemPrompt, translateEntry, salvageIssues, extractTranslation } from "./po_translate.mts";
import type { PoEntry } from "./po_core.mts";

const ON = process.env.TSSR_PO_E2E === "1";
const REPO = join(import.meta.dirname, "..", "..", "..");
const BASE = process.env.TSSR_PO_E2E_URL ?? "http://127.0.0.1:1234";
const MODEL = process.env.TSSR_PO_E2E_MODEL ?? "qwen/qwen3.5-9b";

const CJK: Record<string, RegExp> = {
  ja: /[\u3040-\u30ff\u4e00-\u9fff]/g,
  ko: /[\uac00-\ud7af]/g,
  zh: /[\u4e00-\u9fff]/g,
};

/** Целевой скрипт: для CJK — доля символов, для остальных — отсутствие чужих.
 * Сначала ВЫРЕЗАЕМ плейсхолдеры/формат-спецификаторы: строки вида
 * `{#file_time}%A年 %B月 %d日 %H時%M分` на 60% состоят из `%A/%B/%d`, и без
 * вырезания доля кандзи падает ниже порога — ложная тревога (поймано E2E). */
function onTargetLang(lang: string, tr: string): boolean {
  const bare = tr
    .replace(/%\{?[a-zA-Z#][a-zA-Z0-9]*\}?/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .trim();
  const sample = bare.length >= 4 ? bare : tr;
  if (CJK[lang]) return (sample.match(CJK[lang]) ?? []).length / Math.max(1, sample.length) >= 0.5;
  if (lang === "ru") return (sample.match(/[\u0400-\u04ff]/g) ?? []).length / Math.max(1, sample.length) >= 0.5;
  return !/[\u0400-\u04ff\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(tr);
}

/** Ранее отклонённые строки языка (msgids) — материал для добора. */
function rejectedMsgids(lang: string, limit: number): string[] {
  const f = join(REPO, "tmp", `po_translate_${lang}.jsonl`);
  if (!existsSync(f)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = readFileSync(f, "utf-8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    let r: { rejected?: boolean; error?: unknown; msgid?: string };
    try {
      r = JSON.parse(lines[i]) as typeof r;
    } catch {
      continue;
    }
    if (!r.rejected || r.error || !r.msgid || r.msgid.length < 30 || r.msgid.length > 150) continue;
    if (seen.has(r.msgid)) continue;
    seen.add(r.msgid);
    out.push(r.msgid);
  }
  return out;
}

/** Реальная запись из po-файла (с msgctxt и эмоцией из POT). */
function entryOf(lang: string, msgid: string): PoEntry | null {
  const po = readFileSync(join(REPO, "patches", "ai-voice-pack", "po", `${lang}.po`), "utf-8");
  const ents = parsePo(po.replace(/\r\n/g, "\n")).filter((e) => e.msgid);
  return ents.find((e) => e.msgid === msgid) ?? null;
}

test(
  "E2E: живой перевод на локальной LLM — без утечки языка, судья принимает",
  { skip: ON ? false : "запуск с TSSR_PO_E2E=1 (нужна LM Studio)", timeout: 900_000 },
  async () => {
    const LANGS = ["de", "ja", "ko", "fr"];
    const stats: Record<string, { ok: number; rej: number; leak: number }> = {};
    let totalOk = 0;
    let total = 0;

    for (const lang of LANGS) {
      const msgids = rejectedMsgids(lang, 3);
      if (!msgids.length) continue;
      stats[lang] = { ok: 0, rej: 0, leak: 0 };

      for (const msgid of msgids) {
        const entry = entryOf(lang, msgid);
        if (!entry) continue;
        total++;
        // последовательно намеренно: LM Studio обслуживает очередь по одной
        // eslint-disable-next-line no-await-in-loop
        const r = await translateEntry(
          BASE,
          MODEL,
          lang,
          entry,
          [],
          [],
          true,
          9,
          null,
          6, // --tries 6: доборный режим
        );
        if (!r.tr) {
          stats[lang].rej++;
          // судья отказалась — но мы всё равно смотрим, не утёк ли язык
          const leak = r.issues.some((i) => /wrong language|чужой язык|испанск|instead of/i.test(i));
          if (leak) stats[lang].leak++;
          continue;
        }
        // ПРИНЯТО: обязано быть на целевом языке и с баллом >= порога
        assert.ok(
          onTargetLang(lang, r.tr),
          `${lang}: ПРИНЯТО, но не целевой язык! EN=${msgid.slice(0, 50)} TR=${r.tr.slice(0, 60)}`,
        );
        assert.ok(r.judgeScore >= 9, `${lang}: принято при балле ${r.judgeScore} < 9`);
        stats[lang].ok++;
        totalOk++;
      }
    }

    console.log("E2E результат по языкам:", JSON.stringify(stats));
    console.log(`E2E принято ${totalOk}/${total}`);

    // Принимать должно ХОТЯ БЫ ЧАСТЬ — иначе цепочка сломана целиком
    assert.ok(total > 0, "не нашлось отклонённых строк для E2E");
    assert.ok(totalOk > 0, `ни одна строка не принята (${totalOk}/${total}) — цепочка не работает`);

    // Идеальная защита от утечки: ни одного принятого чужого языка
    const leaks = Object.values(stats).reduce((a, s) => a + s.leak, 0);
    assert.equal(leaks, 0, `зафиксированы утечки языка: ${leaks}`);
  },
);

test(
  "E2E: ключ tr и salvageIssues работают на живых ответах",
  { skip: ON ? false : "запуск с TSSR_PO_E2E=1" },
  async () => {
    const sys = systemPrompt("de");
    assert.ok(sys.startsWith("OUTPUT LANGUAGE: Deutsch (de)"));
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: 'category: "ui"\nEN: Save the game.' },
        ],
        temperature: 0.3,
        max_tokens: 200,
        reasoning_effort: "none",
      }),
    });
    assert.ok(res.ok, `LLM недоступна: HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    assert.ok(raw.length > 0, "пустой ответ модели");
    const tr = extractTranslation(JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>, "de");
    assert.ok(tr.length > 0, `не извлечён перевод: ${raw.slice(0, 120)}`);
    assert.ok(onTargetLang("de", tr), `немецкий перевод не на целевом языке: ${tr}`);
    // спелляж диагностики тоже живой
    assert.deepEqual(salvageIssues('{"score": 6, "issues": ["adjective ending bad"]'), ["adjective ending bad"]);
  },
);
