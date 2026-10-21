/**
 * voices.mts — войсы casts/voices/: имя -> относительный путь к рефу.
 *
 * Значение: "./voices/{Имя}/{Имя}.wav" — путь ОТСЮДА (от casts/), либо
 * null, если активного рефа нет (папка есть, реф не вылечен/не отобран).
 * Ключ = имя папки = тип Voice. Мапа «спикер → голос» — casts/casts.mts.
 *
 * Разрешение пути у потребителя (Node):
 *   new URL(VOICES[name], import.meta.resolve("<путь к этому файлу>"))
 */

export const VOICES = {
  "Alaric": "./voices/Alaric/Alaric.wav",
  "Albert": "./voices/Albert/Albert.wav",
  "Alfred": "./voices/Alfred/Alfred.wav",
  "Arthur": "./voices/Arthur/Arthur.wav",
  "Atilla": "./voices/Atilla/Atilla.wav",
  "Ayaka": "./voices/Ayaka/Ayaka.wav",
  "Barion": "./voices/Barion/Barion.wav",
  "Basilisk": "./voices/Basilisk/Basilisk.wav",
  "Bran": "./voices/Bran/Bran.wav",
  "Caleb": "./voices/Caleb/Caleb.wav",
  "Captain Belmont": "./voices/Captain Belmont/Captain Belmont.wav",
  "Carolyn": "./voices/Carolyn/Carolyn.wav",
  "Cassius": "./voices/Cassius/Cassius.wav",
  "Daemon": "./voices/Daemon/Daemon.wav",
  "Dalia": "./voices/Dalia/Dalia.wav",
  "Damian": "./voices/Damian/Damian.wav",
  "Dio": "./voices/Dio/Dio.wav",
  "Duke Antonio": "./voices/Duke Antonio/Duke Antonio.wav",
  "Elsa": "./voices/Elsa/Elsa.wav",
  "Enya": "./voices/Enya/Enya.wav",
  "Ephraim": "./voices/Ephraim/Ephraim.wav",
  "Eula": "./voices/Eula/Eula.wav",
  "Gabriel": "./voices/Gabriel/Gabriel.wav",
  "Garret": "./voices/Garret/Garret.wav",
  "Generic Female Mature": "./voices/Generic Female Mature/Generic Female Mature.wav",
  "Generic Female Young": "./voices/Generic Female Young/Generic Female Young.wav",
  "Generic Male Mature": "./voices/Generic Male Mature/Generic Male Mature.wav",
  "Generic Male Young": "./voices/Generic Male Young/Generic Male Young.wav",
  "Gideon": "./voices/Gideon/Gideon.wav",
  "Gilead": "./voices/Gilead/Gilead.wav",
  "Gorak": "./voices/Gorak/Gorak.wav",
  "Hassar": "./voices/Hassar/Hassar.wav",
  "Hecate": "./voices/Hecate/Hecate.wav",
  "Hugh": "./voices/Hugh/Hugh.wav",
  "Jacob": "./voices/Jacob/Jacob.wav",
  "Jaeid": "./voices/Jaeid/Jaeid.wav",
  "Jasmine": "./voices/Jasmine/Jasmine.wav",
  "Kamal": "./voices/Kamal/Kamal.wav",
  "Kate": "./voices/Kate/Kate.wav",
  "Kim": "./voices/Kim/Kim.wav",
  "King Orwell Rose": "./voices/King Orwell Rose/King Orwell Rose.wav",
  "King-On-The-Outside": "./voices/King-On-The-Outside/King-On-The-Outside.wav",
  "Kravel": "./voices/Kravel/Kravel.wav",
  "Krip": "./voices/Krip/Krip.wav",
  "Lily": "./voices/Lily/Lily.wav",
  "Maeiv": "./voices/Maeiv/Maeiv.wav",
  "Marion": "./voices/Marion/Marion.wav",
  "Marius": "./voices/Marius/Marius.wav",
  "Marshal Edmond": "./voices/Marshal Edmond/Marshal Edmond.wav",
  "Mary": "./voices/Mary/Mary.wav",
  "Matthew": "./voices/Matthew/Matthew.wav",
  "Metis": "./voices/Metis/Metis.wav",
  "Miriam": "./voices/Miriam/Miriam.wav",
  "Narrator": "./voices/Narrator/Narrator.wav",
  "Nathan": "./voices/Nathan/Nathan.wav",
  "Naydeen": "./voices/Naydeen/Naydeen.wav",
  "Nickolas": "./voices/Nickolas/Nickolas.wav",
  "Orc": "./voices/Orc/Orc.wav",
  "Orwen": "./voices/Orwen/Orwen.wav",
  "Oryon": "./voices/Oryon/Oryon.wav",
  "Ramsey": "./voices/Ramsey/Ramsey.wav",
  "Raza": "./voices/Raza/Raza.wav",
  "Razaphel": "./voices/Razaphel/Razaphel.wav",
  "Sakar": "./voices/Sakar/Sakar.wav",
  "Samayra": "./voices/Samayra/Samayra.wav",
  "Sarah": "./voices/Sarah/Sarah.wav",
  "Shah Mahda": "./voices/Shah Mahda/Shah Mahda.wav",
  "Sigmund": "./voices/Sigmund/Sigmund.wav",
  "Sophia": "./voices/Sophia/Sophia.wav",
  "Synara": "./voices/Synara/Synara.wav",
  "Thomas": "./voices/Thomas/Thomas.wav",
  "Tirion": "./voices/Tirion/Tirion.wav",
  "Took": "./voices/Took/Took.wav",
  "Vaelen": "./voices/Vaelen/Vaelen.wav",
  "Varga": "./voices/Varga/Varga.wav",
  "Woodland Spirit": "./voices/Woodland Spirit/Woodland Spirit.wav",
  "Xanthippe": "./voices/Xanthippe/Xanthippe.wav",
} as const;

/** Имя войса = имя папки casts/voices/. */
export type Voice = keyof typeof VOICES;

/** Путь рефа относительно casts/ либо null (рефа нет). */
export type VoiceRef = (typeof VOICES)[Voice];
