/** tmp/tone_probe4.mts — D3: LLM отдаёт {fragment, replacement}, вклейку делает код. */

const RE_CLIN = [
  /(?<![\p{L}])полов(?:ые|ых|ым|ыми|ой|ого|ому|ая|ое)\s+(?:орган|губ)/iu,
  /(?<![\p{L}])полов(?:ой|ым|ого|ые|ых|ая|ое)\s+(?:акт|сношени|связ|жизн|член|возбуждени)/iu,
  /(?<![\p{L}])влагалищ/iu,
  /(?<![\p{L}])вагин/iu,
  /(?<![\p{L}])пенис/iu,
  /(?<![\p{L}])эрекц/iu,
  /(?<![\p{L}])эякуля/iu,
  /(?<![\p{L}])семяизвержени/iu,
  /(?<![\p{L}])копуляц/iu,
  /(?<![\p{L}])совокуплени/iu,
  /(?<![\p{L}])мастурбац/iu,
  /(?<![\p{L}])онанизм/iu,
  /(?<![\p{L}])анус(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?![\p{L}])/iu,
  /(?<![\p{L}])промежност/iu,
  /(?<![\p{L}])генитал/iu,
  /(?<![\p{L}])мошонк/iu,
  /(?<![\p{L}])оральн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс/iu,
  /(?<![\p{L}])анальн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс/iu,
];
const firstTerm = (s: string): string | null => {
  for (const re of RE_CLIN) { const m = re.exec(s); if (m) return m[0]; }
  return null;
};

const SYS = `You are a Russian literary editor of 18+ erotic prose. You get one SOURCE line (English), its TRANSLATION (Russian) and TERM (a clinical/medical word inside the translation).

Return JSON only: {"fragment": "...", "replacement": "..."}.

- "fragment" is an EXACT substring of the Russian line that must be copied character for character. Take the shortest span around TERM that can be rewritten grammatically (usually the word itself, sometimes with a preposition or a verb next to it).
- "replacement" is that same span rewritten so it sounds like erotic prose instead of a medical report. Keep the same meaning and the same grammatical role.
- The REST of the line is left untouched by you and must stay untouched: do not repeat it, do not fix anything else in it.

Register comes from the ENGLISH source, not from the existing translation: a neutral/literary euphemism in English ("her sex", "between her legs") stays neutral/literary in Russian (no slang, no crude words); a crude English word ("pussy", "cock", "ass") stays equally crude. Never more explicit or more modest than the source.

Do not add images, metaphors, details or sensations the source does not have. Do not invent rare or bookish words. Do not change which body part is meant. Do not replace a name with a pronoun. The replacement must not be longer than the fragment by more than two words.

Example of the shape: {"fragment": "во влагалище", "replacement": "в лоно"}`;

const chat = async (user: string, temp: number): Promise<string> => {
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "qwen3.6-35b-a3b-ud-q4_k_xl",
      messages: [{ role: "system", content: SYS }, { role: "user", content: user }],
      temperature: temp, max_tokens: 260, stream: false, reasoning_effort: "none" }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return d.choices?.[0]?.message?.content ?? "";
};

const json = (s: string): { fragment?: string; replacement?: string } | null => {
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
};

const CASES: Array<[string, string, string]> = [
  ["owner-example", "With her arms now tied behind her back, she almost seemed to be presenting herself, her breasts sticking out, her sex uncovered.", "Теперь, когда её руки были связаны за спиной, казалось, будто она сама себя представляет: грудь выпирала вперёд, а половые органы оставались открытыми."],
  ["fingers-into-sex", "Kate began to slowly push two fingers into Sarah's sex.", "Кейт начала медленно вводить два пальца во влагалище Сары."],
  ["cock-into-pussy", "Varga put one hand on his own cock, and slowly guided it into Sarah's pussy, gently pushing into her.", "Варга положил одну руку на свой член и медленно ввёл его во влагалище Сары, нежно проникая внутрь."],
  ["erection", "He waved his erection from side to side.", "Он размахивал своей эрекцией из стороны в сторону."],
  ["between-legs", "Her eyes drifted down to between Kate's legs.", "Её глаза соскользнули ниже — к промежности Кейт."],
  ["exposed-her-sex", "Sarah unclapsed her hands and exposed her sex again. Her face red, a mix of embarassement and rage.", "Сара раскрыв руки, снова обнажила свои половые органы. Её лицо покраснело — это была смесь смущения и гнева."],
  ["wet-sex", "Sarah felt Lily's fingers slide down her stomach, past her legs, then pressing upon her wet sex.", "Сара почувствовала, как пальцы Лили скользнули вниз по её животу, прошли мимо ног, а затем коснулись её влажных половых органов."],
  ["anus", "His thumb pressed against her anus, slow and deliberate.", "Его большой палец надавил на её анус, медленно и нарочито."],
  ["oral", "Another soldier was leaning back against a wall, with a man and a woman on their knees, taking turns sucking him off.", "Другой солдат прислонился спиной к стене, а мужчина и женщина стояли на коленях, поочерёдно занимаясь с ним оральным сексом."],
  ["pussy-exposed", "Sarah still felt every part of her being controlled, her hair still pulled tight, her pussy exposed and being penetrated.", "Сара всё ещё чувствовала, что каждая часть её существа находится под контролем: волосы по-прежнему были туго стянуты, а влагалище — обнажено и пронизывалось."],
  ["labia", "Where Sarah had fumbled between Kate's legs, Kate clearly knew her way around Sarah's lower parts.", "Там, где Сара лишь неловко возилась между ног Кейт, та явно знала, как обращаться с половыми губами Сары."],
  ["clit", "The pressing of her lips against her neck, the gnawing of teeth, the way her hand seized her breasts and her fingers curled, sliding past her clit...", "Прижатие её губ к шее, щипание зубами, то, как её рука схватила её грудь, а пальцы изогнулись и скользнули мимо клитора..."],
];

let ok = 0, bad = 0;
for (const [tag, en, ru] of CASES) {
  const term = firstTerm(ru);
  let out = ru, note = "";
  if (!term) { note = "нет клиники"; }
  else {
    let done = false;
    for (const temp of [0, 0.4]) {
      const j = json(await chat(`SOURCE (en): ${en}\nTRANSLATION (ru): ${ru}\nTERM: ${term}`, temp));
      if (!j?.fragment || !j?.replacement) { note = "не JSON/пусто"; continue; }
      const { fragment, replacement } = j;
      const at = ru.indexOf(fragment);
      if (at < 0 || ru.indexOf(fragment, at + 1) >= 0) { note = `фрагмент не найден: ${fragment}`; continue; }
      const cand = ru.slice(0, at) + replacement + ru.slice(at + fragment.length);
      const left = firstTerm(cand);
      if (left) { note = `осталась клиника: ${left}`; out = cand; continue; }
      if (replacement.trim().split(/\s+/).length > fragment.trim().split(/\s+/).length + 2) { note = "replace длиннее на >2 слова"; out = cand; continue; }
      out = cand; note = `[${fragment} → ${replacement}]`; done = true; break;
    }
    if (!done && !note.startsWith("[")) note += " (НЕ ПРИНЯТО)";
  }
  const good = !firstTerm(out) && !note.includes("НЕ ПРИНЯТО");
  if (good) ok++;
  else bad++;
  console.log(`### ${tag} ${good ? "✓" : "✗"} ${note}\n  было: ${ru}\n  стало: ${out}\n`);
}
console.log(`итог: ✓ ${ok} / ✗ ${bad}`);
