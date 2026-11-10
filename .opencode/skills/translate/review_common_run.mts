// Общий непрерывный словесный фрагмент двух строк — для гейта «вклейка
// соседа» в translate_review.mts. Вынесено для self-test'а.
export const normTok = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[«»"'.,!?;:()[\]\-—…]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

export const commonRun = (a: string, b: string): string => {
  const A = normTok(a);
  const B = normTok(b);
  const setB = new Set<string>();
  for (let k = 3; k <= 16; k++) for (let j = 0; j + k <= B.length; j++) setB.add(B.slice(j, j + k).join("\u0001"));
  for (let k = Math.min(16, A.length); k >= 3; k--) {
    for (let j = 0; j + k <= A.length; j++) {
      const gram = A.slice(j, j + k).join("\u0001");
      if (setB.has(gram)) return A.slice(j, j + k).join(" ");
    }
  }
  return "";
};

// Служебные слова: общий фрагмент из них — естественное повторение соседних
// строк («с тех пор, как»), а не вклейка. Содержательных слов в утечке ≥2.
const STOP = new Set(
  (
    "и в во на с со к ко по что как но а или не ни уже ещё этот эта это эти тот та те она он оно они мы вы я ты " +
    "его её их ему им мне тебе о об до от для при после перед чтобы когда где чем так вот то был была было были " +
    "есть за из у ведь даже ли бы сейчас потом затем теперь тут здесь там себе сама сам свой своя своё свои " +
    "него ней ним них мной тобой нами вами собою того вместо тех той пор своей свою своём своих"
  ).split(" "),
);

export const contentWords = (run: string): number => run.split(" ").filter((w) => w && !STOP.has(w)).length;

/** Оригиналы делят фразу (≥3 слова общего хода) — префикс-расширение реплики:
 *  общее начало перевода законно и утечкой (УТЕЧКА) не считается. E2E 2026-11-09:
 *  pt/de[899] «He could be a serious threat.» / «…We should send scouts…» — FP. */
export const sharePhrase = (idA: string, idB: string): boolean => commonRun(idA, idB).split(" ").length >= 3;
