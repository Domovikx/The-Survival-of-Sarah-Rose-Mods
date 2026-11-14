import { join } from "node:path";
import { usedCharset } from "../patches/ai-voice-pack/tools/build/font_charset.mts";
import { missingGlyphs } from "../patches/ai-voice-pack/tools/build/font_coverage.mts";
const PATCH = "patches/ai-voice-pack";
const cs = usedCharset(PATCH);
console.log("charset:", cs.length, "| есть 꼭:", cs.includes("꼭"), "| есть 꽉:", cs.includes("꽉"));
for (const f of ["NotoSansCJKkr-Regular.otf", "NotoSansCJKjp-Regular.otf", "NotoSansCJKsc-Regular.otf"]) {
  const miss = missingGlyphs(join(PATCH, "fonts", f), cs);
  console.log(f, "нет глифов:", miss.length, miss.slice(0, 10).map((c) => c + "/U+" + c.codePointAt(0)!.toString(16)));
}
