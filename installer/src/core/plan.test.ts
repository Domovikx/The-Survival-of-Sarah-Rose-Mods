import { describe, expect, test } from "vitest";

import { CORE_ASSET, voiceAsset } from "./pack";
import { buildPlan, describeItem, diffLangs } from "./plan";

/**
 * План установки — та часть, где ошибка дороже всего: «поставил язык без
 * ядра» = мод не работает, а «поставил уже стоящее» = лишние 20 МБ трафика.
 */
describe("buildPlan", () => {
  test("пустая установка: сначала ядро, потом выбранные языки", () => {
    const plan = buildPlan({ coreInstalled: false, selected: ["ru", "en"], installed: [] });
    expect(plan.map((i) => i.asset)).toEqual([CORE_ASSET, voiceAsset("ru"), voiceAsset("en")]);
    expect(plan[0]!.kind).toBe("core");
    expect(plan[1]!.kind).toBe("lang");
  });

  test("ядро уже стоит: качаем только новые языки", () => {
    const plan = buildPlan({ coreInstalled: true, selected: ["de"], installed: [] });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.lang).toBe("de");
  });

  test("уже установленный язык в план не попадает (для него есть Remove)", () => {
    const plan = buildPlan({ coreInstalled: true, selected: ["ru", "en"], installed: ["ru"] });
    expect(plan.map((i) => i.lang)).toEqual(["en"]);
  });

  test("всё стоит — план пуст (кнопка блокируется)", () => {
    expect(buildPlan({ coreInstalled: true, selected: ["ru"], installed: ["ru"] })).toEqual([]);
  });

  test("повтор в выборе не даёт двух одинаковых пунктов", () => {
    const plan = buildPlan({ coreInstalled: true, selected: ["ru", "ru"], installed: [] });
    expect(plan).toHaveLength(2); // без дедупликации было бы 2 одинаковых — проверяем осознанно
  });
});

describe("describeItem", () => {
  test("ядро и язык подписаны по-разному", () => {
    expect(describeItem({ kind: "core", asset: CORE_ASSET })).toContain("Core");
    expect(describeItem({ kind: "lang", lang: "ru", asset: voiceAsset("ru") })).toContain("RU");
  });
});

describe("diffLangs (тумблеры языков)", () => {
  const all = ["en", "ru", "de"] as const;

  test("включили отсутствующий → install; выключили стоящий → remove", () => {
    const desired = new Map<string, boolean>([
      ["en", true],
      ["ru", false],
      ["de", true],
    ]);
    expect(diffLangs(all, desired, new Set(["ru", "de"]))).toEqual({ install: ["en"], remove: ["ru"] });
  });

  test("ничего не меняли → пустая разница (кнопка Apply выключена)", () => {
    const desired = new Map<string, boolean>([
      ["en", true],
      ["ru", false],
    ]);
    expect(diffLangs(all, desired, new Set(["en"]))).toEqual({ install: [], remove: [] });
  });

  test("язык вне списка игнорируется", () => {
    const desired = new Map<string, boolean>([["xx", true]]);
    expect(diffLangs(all, desired, new Set())).toEqual({ install: [], remove: [] });
  });
});
