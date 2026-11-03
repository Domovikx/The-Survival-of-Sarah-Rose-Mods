/**
 * gender.mts — БД ПОЛОВ спикеров (дом знаний — casts/).
 *
 * ЛИТЕРАЛЬНАЯ карта {имя: "M"|"F"|"?"} (решение владельца 2026-11-02): быстрый
 * синхронный ответ на вопрос «к кому обращаюсь и какой пол (1 — кто я, 2 — кто
 * он/она/они)» — открыл файл или вызвал genderOf(name): без async-обхода
 * контрактов и файловых походов.
 *
 * Источник значений — контракт casts/voices/{Имя}/{Имя}.mts (поле gender).
 * Синхронность куплена guard-тестом: casts/gender.test.mts сверяет карту с
 * контрактами — правишь контракт → падает тест → зеркалишь в карту
 * (DRY через тест, а не через вычисление).
 *
 * ПЕРЕПРОВЕРКА ПОЛОВ ПЕРСОНАЖЕЙ (убирает ляпы согласования): при сомнении
 * в роде персонажа источник истины — ЭТОТ файл: все персонажи (включая
 * адресатов и упоминаемых в репликах) описаны здесь. Инцидент 2026-11-03:
 * Marion = M, а в переводе стояло «Марион обратилась» — модель подогнала
 * род под себя. Порядок сверки: имя из строки → пол здесь → согласование
 * в переводе; спор решает файл, а не интуиция модели.
 *
 * Поток данных в перевод:
 *   контракт → ЭТА карта → НАПРЯМУЮ в инструменты перевода/ревью по имени
 *   спикера. Теги "#. speaker_gender:" удалены и из POT, и из po
 *   (2026-11-03, решение владельца): в po они вводили в заблуждение
 *   (нарратор F = голос озвучки), а в POT были лишним дублем этой карты.
 *   Сверка пола — всегда здесь.
 *   Правка данных: пол в контракте + зеркально сюда (guard-тест поймает
 *   рассинхрон). "?" = пол неизвестен — промпт просит модель решить по
 *   контексту.
 *   ВНИМАНИЕ: у Narrator в карте F — это ГОЛОС ОЗВУЧКИ, а не грамматика
 *   строки: в нарраторских репликах род берётся из персонажей строки.
 *
 * Покрытие: 148 спикеров POT (M=118, F=30, "?"=0; сверка 2026-11-02).
 * Ключи не ограничены POT-спикерами: персонажи-адресаты и упоминаемые в репликах
 * имена добавляются сюда же — карта растёт вручную по мере надобности.
 */
import type { CastContract } from "./cast.types.mts";

/** Пол — тот же тип, что в контракте. */
export type SpeakerGender = CastContract["gender"];

/**
 * БД: спикер (ключ POT msgctxt "speaker:<Имя>") -> пол.
 * Сгенерирована из контрактов 2026-11-02 (tmp/gen_gender_db.mts);
 * актуальность против контрактов держит casts/gender.test.mts.
 */
export const SPEAKER_GENDER: Record<string, SpeakerGender> = {
  "Advisor": "M",
  "Alaric": "M",
  "Albert": "M",
  "Alfred": "M",
  "Ambassador": "M",
  "Announcer": "M",
  // 0 реплик в игре (2026-11-03): пол неизвестен → модель решает по контексту
  "Arthur": "?",
  "Atilla": "M",
  "Ayaka": "F",
  "Barion": "M",
  "Barkeep": "M",
  "Barkeeper": "M",
  "Barman": "M",
  "Basilisk": "M",
  "Blacksmith": "M",
  "Both": "F",
  // 0 реплик в игре (2026-11-03): пол неизвестен → модель решает по контексту
  "Bran": "?",
  "Brigand": "M",
  "Caleb": "M",
  "Camp Guard": "M",
  "Camp Soldier": "M",
  "Captain": "M",
  "Captain Belmont": "M",
  "Captain of the guard": "M",
  "Carolyn": "F",
  "Cassius": "M",
  "City Official": "M",
  "Courier": "M",
  "Court Offical": "M",
  "Court Official": "M",
  "Curator": "M",
  "Daemon": "M",
  "Dalia": "F",
  "Damian": "M",
  "Dio": "F",
  "Duke Antonio": "M",
  "Elsa": "F",
  "Emissary": "M",
  "Emmissary": "M",
  "Engineer": "M",
  "Engineers": "M",
  // 0 реплик в игре (2026-11-03): пол неизвестен → модель решает по контексту
  "Enya": "?",
  "Ephraim": "M",
  "Eula": "F",
  "Examinator": "M",
  "Female soldier": "F",
  "Female Soldier": "F",
  "Founder": "M",
  "Gabriel": "M",
  "Garret": "M",
  "Gideon": "M",
  "Gilead": "M",
  "Girl": "F",
  "Gorak": "M",
  "Guard": "M",
  "Guard Captain": "M",
  "Guards": "M",
  "Hassar": "M",
  "Hecate": "F",
  "High Priest": "M",
  "Hugh": "M",
  "Innkeeper": "M",
  "Jacob": "M",
  "Jaeid": "M",
  "Jasmine": "F",
  "Judge": "M",
  "Kamal": "M",
  "Kate": "F",
  "Kim": "F",
  "King Orwell Rose": "M",
  "King-On-The-Outside": "M",
  "Kravel": "M",
  "Krip": "M",
  "Lily": "F",
  "Maeiv": "F",
  "Male soldier": "M",
  "Male Soldier": "M",
  "Man": "M",
  "Marion": "M",
  "Marius": "M",
  "Marshal Edmond": "M",
  "Mary": "F",
  "Master": "M",
  "Matthew": "M",
  "Mayor": "M",
  "Merchant": "M",
  "Metis": "M",
  "Miriam": "F",
  "Mythran Officer": "M",
  "Mythran Prince": "M",
  "Mythran Soldier": "M",
  "Narrator": "F",
  "Nathan": "M",
  "Naydeen": "F",
  "Nickolas": "M",
  "Noble wife": "F",
  "Nobleman": "M",
  "Noblewoman": "F",
  "Officer": "M",
  "Official": "M",
  "Old Captain": "M",
  "Old man": "M",
  "Old Tribesman": "M",
  "Orc": "M",
  "Orwen": "M",
  "Oryon": "M",
  "Other man": "M",
  "Peasant girl": "F",
  "People": "M",
  "Priest": "M",
  "Ragged Man": "M",
  "Ramsey": "M",
  "Raza": "M",
  "Razaphel": "M",
  "Robber": "M",
  "Romanov Twin": "M",
  "Royal Messenger": "M",
  "Sailor": "M",
  "Sakar": "M",
  "Samayra": "F",
  "Sarah": "F",
  "Sarah and Thomas in unison": "F",
  "Scholar": "M",
  "Scout": "M",
  "Second man": "M",
  "Servant": "M",
  "Servants": "M",
  "Shah Mahda": "M",
  "Siege crew": "M",
  "Sigmund": "M",
  "Slave": "M",
  "Slave Woman": "F",
  "Soldier": "M",
  "Soldiers": "M",
  "Sophia": "F",
  "Spearmen": "M",
  "Squire": "M",
  // сцена: «a group of three women», «Synara and her cronies»
  "Synara": "F",
  "Tailor": "M",
  "The Official": "M",
  "Thomas": "M",
  "Tirion": "M",
  // 0 реплик в игре (2026-11-03): пол неизвестен → модель решает по контексту
  "Took": "?",
  "Tribesman": "M",
  "Vaelen": "M",
  "Varga": "M",
  "Voice": "M",
  "Voidling": "M",
  "Woman": "F",
  "Woodland Spirit": "M",
  "Xanthippe": "M",
  "Young man": "M",
  "Young woman": "F",
};

/** Быстрый синхронный ответ «какой пол у <имя>»: null — персонажа нет в БД. */
export function genderOf(name: string): SpeakerGender | null {
  return SPEAKER_GENDER[name] ?? null;
}
