/** tmp/tone_probe7.mts — D5: «орган не называем» + судья с одной задачей. */

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
  /(?<![\p{L}])задн(?:ий|его|ему|им|ем)\s+проход/iu,
  /(?<![\p{L}])прям(?:ая|ой|ую)\s+кишк/iu,
  /(?<![\p{L}])промежност/iu,
  /(?<![\p{L}])генитал/iu,
  /(?<![\p{L}])мошонк/iu,
  /(?<![\p{L}])оральн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс/iu,
  /(?<![\p{L}])анальн(?:ый|ого|ым|ом|ая|ой|ую|ые|ых)\s+секс/iu,
];
const firstTerm = (s: string): string | null => {
  for (const re of RE_CLIN) {
    const m = re.exec(s);
    if (m) return m[0];
  }
  return null;
};

const EDITOR = `You are a Russian literary editor of 18+ erotic prose. You get one SOURCE line (English), its TRANSLATION (Russian) and TERM (a clinical/medical word inside the translation).

Return JSON only: {"fragment": "...", "replacement": "..."}.

- "fragment" is an EXACT substring of the Russian line, copied character for character. It must cover TERM and every other word that has to change with it to keep the sentence grammatical and natural: a verb that agrees with it, a pronoun, a possessive name. Nothing beyond that.
- "replacement" rewrites exactly that span so it sounds like erotic prose instead of a medical report. The result must read as normal Russian.
- Everything outside the span is left untouched.

Russian erotic prose usually does not name the organ at all: "между ног", "её плоть", "себя", "туда", "внутрь неё" are better than any anatomical noun. Use a noun only when the sentence cannot work without one, and then an ordinary one that people actually say.

Register comes from the ENGLISH source: a neutral/literary euphemism in English ("her sex", "between her legs") stays neutral/literary in Russian; a crude English word ("pussy", "cock", "ass") stays equally crude.

Hard rules:
- no archaic, bookish, poetic or invented words ("ложе", "нега", "лощина", "нутро", "естество" are wrong; "лоно" only if nothing else fits);
- the replacement must not be another medical or anatomical term (no "задний проход", no "половые губы");
- do not add a possessive pronoun ("её") if the sentence already names the owner (Сары, Кейт);
- no added images, metaphors, details or sensations; do not change which body part is meant;
- the replacement may not be longer than the fragment by more than two words.

Example of the shape: {"fragment": "к промежности Кейт", "replacement": "между ног Кейт"}`;

const JUDGE = `You check ONE edit of a Russian 18+ literary translation. You get SOURCE (en), OLD (current Russian line) and NEW (Russian line after one fragment was replaced).

Your single job: decide whether NEW is a valid literary replacement for OLD.

Answer JSON only: {"ok": true|false, "reason": "<short, in Russian>"}.

Reject (ok=false) only if:
- NEW is grammatically broken or unreadable (agreement, case, verb form, word order);
- NEW still contains a medical/anatomical term (влагалище, половые органы, половые губы, анус, задний проход, промежность, эрекция, эякуляция, половой акт, оральный секс, гениталии);
- NEW contains an unnatural, archaic, poetic or invented word for this context;
- NEW names the owner twice ("в её лоно Сары");
- the meaning or the body part changed, or a detail appeared that SOURCE does not have;
- a character name disappeared or became a pronoun.

Do NOT judge elegance, do NOT ask for more anatomical precision, and do NOT defend the old medical wording: removing it is the whole point. A natural Russian euphemism ("между ног", "её плоть", "киска" for "pussy") is the correct answer, even if it names the organ less precisely than the medical term.`;

const chat = async (sys: string, user: string, temp: number, max = 260): Promise<string> => {
  const r = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.6-35b-a3b-ud-q4_k_xl",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: temp,
      max_tokens: max,
      stream: false,
      reasoning_effort: "none",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return d.choices?.[0]?.message?.content ?? "";
};

const parseJ = <T,>(s: string): T | null => {
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
};

const CASES: Array<[string, string, string]> = [
  [
    "owner-example",
    "With her arms now tied behind her back, she almost seemed to be presenting herself, her breasts sticking out, her sex uncovered.",
    "Теперь, когда её руки были связаны за спиной, казалось, будто она сама себя представляет: грудь выпирала вперёд, а половые органы оставались открытыми.",
  ],
  ["fingers-into-sex", "Kate began to slowly push two fingers into Sarah's sex.", "Кейт начала медленно вводить два пальца во влагалище Сары."],
  [
    "cock-into-pussy",
    "Varga put one hand on his own cock, and slowly guided it into Sarah's pussy, gently pushing into her.",
    "Варга положил одну руку на свой член и медленно ввёл его во влагалище Сары, нежно проникая внутрь.",
  ],
  ["erection", "He waved his erection from side to side.", "Он размахивал своей эрекцией из стороны в сторону."],
  ["between-legs", "Her eyes drifted down to between Kate's legs.", "Её глаза соскользнули ниже — к промежности Кейт."],
  [
    "exposed-her-sex",
    "Sarah unclapsed her hands and exposed her sex again. Her face red, a mix of embarassement and rage.",
    "Сара раскрыв руки, снова обнажила свои половые органы. Её лицо покраснело — это была смесь смущения и гнева.",
  ],
  [
    "wet-sex",
    "Sarah felt Lily's fingers slide down her stomach, past her legs, then pressing upon her wet sex.",
    "Сара почувствовала, как пальцы Лили скользнули вниз по её животу, прошли мимо ног, а затем коснулись её влажных половых органов.",
  ],
  ["anus", "His thumb pressed against her anus, slow and deliberate.", "Его большой палец надавил на её анус, медленно и нарочито."],
  [
    "oral",
    "Another soldier was leaning back against a wall, with a man and a woman on their knees, taking turns sucking him off.",
    "Другой солдат прислонился спиной к стене, а мужчина и женщина стояли на коленях, поочерёдно занимаясь с ним оральным сексом.",
  ],
  [
    "pussy-exposed",
    "Sarah still felt every part of her being controlled, her hair still pulled tight, her pussy exposed and being penetrated.",
    "Сара всё ещё чувствовала, что каждая часть её существа находится под контролем: волосы по-прежнему были туго стянуты, а влагалище — обнажено и пронизывалось.",
  ],
  [
    "labia",
    "Where Sarah had fumbled between Kate's legs, Kate clearly knew her way around Sarah's lower parts.",
    "Там, где Сара лишь неловко возилась между ног Кейт, та явно знала, как обращаться с половыми губами Сары.",
  ],
  ["clitoris", "She gasped as his tongue found her clit.", "Она охнула, когда его язык нашёл её клитор."],
];

let ok = 0;
let bad = 0;
for (const [tag, en, ru] of CASES) {
  const term = firstTerm(ru);
  let out = ru;
  const notes: string[] = [];
  let accepted = false;
  if (!term) {
    notes.push("нет клиники");
    accepted = true;
  } else {
    let feedback = "";
    for (let attempt = 0; attempt < 4 && !accepted; attempt++) {
      const temp = [0, 0.3, 0.55, 0.75][attempt];
      const j = parseJ<{ fragment?: string; replacement?: string }>(
        await chat(EDITOR, `SOURCE (en): ${en}\nTRANSLATION (ru): ${ru}\nTERM: ${term}${feedback}`, temp),
      );
      if (!j?.fragment || !j?.replacement) {
        notes.push(`#${attempt + 1} нет JSON`);
        continue;
      }
      const at = ru.indexOf(j.fragment);
      if (at < 0) {
        notes.push(`#${attempt + 1} фрагмент не найден`);
        feedback = "\n\nIMPORTANT: the previous fragment was not an exact substring. Copy it character for character.";
        continue;
      }
      const cand = ru.slice(0, at) + j.replacement + ru.slice(at + j.fragment.length);
      const left = firstTerm(cand);
      if (left) {
        notes.push(`#${attempt + 1} клиника «${left}»`);
        feedback = `\n\nIMPORTANT: the result still contains the clinical term "${left}". Remove it.`;
        continue;
      }
      if (j.replacement.trim().split(/\s+/).length > j.fragment.trim().split(/\s+/).length + 2) {
        notes.push(`#${attempt + 1} длинно`);
        continue;
      }
      const v = parseJ<{ ok?: boolean; reason?: string }>(
        await chat(JUDGE, `SOURCE (en): ${en}\nOLD (ru): ${ru}\nNEW (ru): ${cand}`, 0, 160),
      );
      if (v?.ok) {
        out = cand;
        accepted = true;
        notes.push(`#${attempt + 1} OK [${j.fragment} → ${j.replacement}]`);
      } else {
        notes.push(`#${attempt + 1} брак: ${v?.reason ?? "нет ответа"}`);
        feedback = `\n\nYour previous attempt was rejected by the editor-in-chief: "${v?.reason ?? ""}". Fix exactly that problem.`;
      }
    }
  }
  if (accepted) ok++;
  else bad++;
  console.log(`### ${tag} ${accepted ? "✓" : "✗ ОСТАВЛЕНО"}  ${notes.join(" ; ")}`);
  console.log(`  было: ${ru}`);
  console.log(`  стало: ${out}\n`);
}
console.log(`итог: принято ${ok} / отклонено ${bad}`);
