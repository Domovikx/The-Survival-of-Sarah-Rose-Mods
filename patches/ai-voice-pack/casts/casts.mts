/**
 * casts/casts.mts — типизированная мапа «спикер POT → голос (каст)».
 *
 * Спикеров (po/template.pot, msgctxt "speaker:*") больше, чем голосов (casts/):
 * несколько спикеров делят один каст — массовка → Generic-пулы, опечатки игры,
 * ипостаси одного существа. Это рукописный модуль (комментарии приветствуются);
 * его перезаписывает только человек, тул — читает и рапортует:
 *
 *   SPEAKERS       — КАЖДЫЙ спикер POT: войс | null (null = осознанно без
 *                    голоса, ревью владельца). Ключи — тип PotSpeaker из
 *                    po/template.speakers.mts (генерится potgen из игры),
 *                    значения — Voice из casts/voices.mts (список
 *                    папок casts/voices/, рукописный): компилятор ловит и
 *                    выпавшего спикера, и протухший ключ, и чужое имя войса.
 *
 * Гарантия «ничего не теряем» (guard — speaker_map.mts + его живые тесты):
 *   - КАЖДЫЙ спикер POT обязан быть ключом SPEAKERS (tsc по PotSpeaker + audit);
 *   - значение обязано существовать в VOICES (и на компиляции, и в audit);
 *   - ключ вне POT = переименование/выпадение спикера — audit падает;
 *   - VOICES сверяется с папками casts/voices/ в обе стороны (audit).
 *
 * Реплики «под маской чужого спикера» НЕ оверрайдятся здесь: если uid
 * говорит не тот, кто указан в POT — это баг парсера/игры, его чинят в
 * парсере, а не замазывают маппингом (решение владельца 2026-10-21:
 * LINE_OVERRIDES удалён).
 *
 * Актуализация: npm run potgen (освежить POT_SPEAKERS после апдейта игры),
 * npm run speakers:audit (рапорт), npm run speakers:audit -- --emit
 * (блок новых спикеров для вставки). Тесты: npm run test:speakers.
 */

import { VOICES, type Voice } from "./voices.mts";
import type { PotSpeaker } from "../po/template.speakers.mts";

export { VOICES, type Voice };

/**
 * Мапа «спикер POT → голос». Значения типизированы: опечатка имени каста не
 * пройдёт компиляцию (tsc) и упадёт в audit. Null — осознанно без голоса.
 * Ключи обязаны покрывать РОВНО PotSpeaker (в обе стороны: выпавший спикер
 * и протухший ключ — ошибки компиляции; после апдейта игры — npm run potgen
 * + speakers:audit --emit подскажет новых).
 */
export const SPEAKERS: Record<PotSpeaker, Voice | null> = {
  // === нарратор и главные ===
  "Narrator": "Narrator",
  "Sarah": "Sarah",

  // === именной каст: спикер говорит собственным голосом ===
  "Alaric": "Alaric",
  "Albert": "Albert",
  "Alfred": "Alfred",
  "Atilla": "Atilla",
  "Ayaka": "Ayaka",
  "Barion": "Barion",
  "Basilisk": "Basilisk",
  "Caleb": "Caleb",
  "Captain Belmont": "Captain Belmont",
  "Carolyn": "Carolyn",
  "Cassius": "Cassius",
  "Daemon": "Daemon",
  "Dalia": "Dalia",
  "Damian": "Damian",
  "Dio": "Dio",
  "Duke Antonio": "Duke Antonio",
  "Elsa": "Elsa",
  "Ephraim": "Ephraim",
  "Eula": "Eula",
  "Gabriel": "Gabriel",
  "Garret": "Garret",
  "Gideon": "Gideon",
  "Gilead": "Gilead",
  "Gorak": "Gorak",
  "Hassar": "Hassar",
  "Hecate": "Hecate",
  "Hugh": "Hugh",
  "Jacob": "Jacob",
  "Jaeid": "Jaeid",
  "Jasmine": "Jasmine",
  "Kamal": "Kamal",
  "Kate": "Kate",
  "Kim": "Kim",
  "King Orwell Rose": "King Orwell Rose",
  "Kravel": "Kravel",
  "Krip": "Krip",
  "Lily": "Lily",
  "Maeiv": "Maeiv",
  "Marion": "Marion",
  "Marius": "Marius",
  "Marshal Edmond": "Marshal Edmond",
  "Mary": "Mary",
  "Matthew": "Matthew",
  "Metis": "Metis",
  "Miriam": "Miriam",
  "Nathan": "Nathan",
  "Naydeen": "Naydeen",
  "Nickolas": "Nickolas",
  "Orc": "Orc",
  "Orwen": "Orwen",
  "Ramsey": "Ramsey",
  "Raza": "Raza",
  "Razaphel": "Razaphel",
  "Sakar": "Sakar",
  "Samayra": "Samayra",
  "Shah Mahda": "Shah Mahda",
  "Sigmund": "Sigmund",
  "Sophia": "Sophia",
  "Thomas": "Thomas",
  "Tirion": "Tirion",
  "Vaelen": "Vaelen",
  "Varga": "Varga",
  "Woodland Spirit": "Woodland Spirit",
  "Xanthippe": "Xanthippe",

  // === один голос на многих: ипостаси и массовка ===
  // Существо-void-god: Voice/Master — та же ипостась, что Daemon (решение
  // владельца, перенесено из ENTITY_NOTES who_map_bootstrap.py)
  "Voice": "Daemon",
  "Master": "Daemon",
  // Капитан Belmont и его ипостаси в репликах без имени
  "Captain": "Captain Belmont",
  // Массовка → Generic-пулы (пол+возраст по роли)
  "Soldier": "Generic Male Mature",
  "Soldiers": "Generic Male Mature",
  "Guard": "Generic Male Mature",
  "Guards": "Generic Male Mature",
  "Camp Guard": "Generic Male Mature",
  "Guard Captain": "Generic Male Mature",
  "Captain of the guard": "Generic Male Mature",
  "Old Captain": "Generic Male Mature",
  "Officer": "Generic Male Mature",
  "Mythran Officer": "Generic Male Mature",
  "Mythran Soldier": "Generic Male Young",
  "Mythran Prince": "Generic Male Young",
  "Male Soldier": "Generic Male Young",
  "Male soldier": "Generic Male Young",
  "Female Soldier": "Generic Female Young",
  "Female soldier": "Generic Female Young",
  "Spearmen": "Generic Male Mature",
  "Brigand": "Generic Male Mature",
  "Robber": "Generic Male Mature",
  "Sailor": "Generic Male Mature",
  "Siege crew": "Generic Male Mature",
  "Tailor": "Generic Male Mature",
  "Blacksmith": "Generic Male Mature",
  "Merchant": "Generic Male Mature",
  "Innkeeper": "Generic Male Mature",
  // Трактирщик/бармен — возможно, одно лицо (ревью при появлении каста)
  "Barkeep": "Generic Male Mature",
  "Barkeeper": "Generic Male Mature",
  "Barman": "Generic Male Mature",
  "Mayor": "Generic Male Mature",
  "Judge": "Generic Male Mature",
  "Scholar": "Generic Male Mature",
  "Engineer": "Generic Male Mature",
  "Engineers": "Generic Male Mature",
  "Examinator": "Generic Male Mature",
  "High Priest": "Generic Male Mature",
  "Priest": "Generic Male Mature",
  "Ambassador": "Generic Male Mature",
  "Advisor": "Generic Male Mature",
  "Announcer": "Generic Male Mature",
  "Courier": "Generic Male Young",
  "Royal Messenger": "Generic Male Young",
  "Scout": "Generic Male Young",
  "Squire": "Generic Male Young",
  "Servant": "Generic Male Mature",
  "Servants": "Generic Male Mature",
  "Slave": "Generic Male Mature",
  "Slave Woman": "Generic Female Mature",
  "Tribesman": "Generic Male Mature",
  "Old Tribesman": "Generic Male Mature",
  "Man": "Generic Male Mature",
  "Other man": "Generic Male Mature",
  "Second man": "Generic Male Mature",
  "Ragged Man": "Generic Male Mature",
  "Old man": "Generic Male Mature",
  "Young man": "Generic Male Young",
  "Woman": "Generic Female Mature",
  "Young woman": "Generic Female Young",
  "Girl": "Generic Female Young",
  "Peasant girl": "Generic Female Young",
  "Nobleman": "Generic Male Mature",
  "Noblewoman": "Generic Female Mature",
  "Noble wife": "Generic Female Mature",
  "People": "Generic Male Mature",
  "Official": "Generic Male Mature",
  "The Official": "Generic Male Mature",
  "City Official": "Generic Male Mature",
  "Court Official": "Generic Male Mature",
  // Опечатки игры — сшиты с каноном голосом
  "Court Offical": "Generic Male Mature", // опечатка "Court Official"
  "Emissary": "Generic Male Mature",
  "Emmissary": "Generic Male Mature", // опечатка "Emissary"
  "Founder": "Oryon", // маска Орыона: «my name is Oryon» — тот же персонаж
  "Curator": "Generic Male Mature",
  "Camp Soldier": "Generic Male Young",

  // === без голоса: на решении владельца ===
  "Oryon": "Oryon", // новый каст 2026-10-21 (122 реплики + 22 маски Founder); реф в работе, до рефа молчит
  "King-On-The-Outside": "King-On-The-Outside", // новый beast-каст 2026-10-21 (42 реплики); реф через beastify
  "Romanov Twin": "Generic Male Mature", // 7 реплик: «Two men entered» — два мужчины-коллектора, не родственники (TheBlackMonolithMage5)
  "Voidling": "Daemon", // 4 обрывка умирающего существа Пустоты (BattleOfRahayal) — beastify-фолбэк
  "Both": "Miriam", // 2 реплики: Miriam+Orwen просят прощения хором (UnionKingdom1) — из дуэта взят один ребёнок
  "Sarah and Thomas in unison": "Sarah", // 1 реплика пролога «Yes Father.» (OpeningScene) — Sarah ведущая в паре
};

export type SpeakerName = PotSpeaker;
