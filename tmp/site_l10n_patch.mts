/**
 * site_l10n_patch.mts — точечное обновление ПРОТУХШИХ значений в словарях T
 * генератора tmp/site_l10n_gen.mts (ключ-ориентированно, с assert на замену).
 * Контент-ревамп 2026-11-11: 11 языков вместо EN+RU, VoxCPM2 вместо CosyVoice3,
 * демо-скоуп вместо «134 534 строк», install.cmd, «патч» вместо «проект».
 * Запуск: node tmp/site_l10n_patch.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

const GEN = "tmp/site_l10n_gen.mts";

type KV = Record<string, string>;

const NEW: Record<string, KV> = {
  de: {
    title: "The Survival of Sarah Rose — KI-Sprachausgabe + 11 Sprachen",
    description:
      "Inoffizielles Fan-Patch: volle KI-Sprachausgabe mit geklonten, emotionalen Stimmen — plus Übersetzungen in 11 Sprachen (Russisch komplett; die übrigen decken das Intro bis zur ersten Wahl ab). Kostenlos, 18+.",
    heroSub:
      "Inoffizielles Fan-Patch: Der Spieltext wird vollständig vertont — über 75 geklonte Stimmen mit gefühlvoller Darstellung jeder Zeile. 11 Sprachen: Russisch komplett, die übrigen bis zur ersten Wahl.",
    badgeTranslate: "11 Sprachen — RU komplett, die übrigen Demo bis zur ersten Wahl",
    badgeVoice: "Sprachausgabe: Demo 100 % (11 Sprachen, je 1 188 Zeilen)",
    badgeFormat: "Opus 24 kbps — ca. 17 MB pro Sprache (Demo)",
    ctaDownload: "ZIPs herunterladen (Mod + Sprachpakete)",
    featTranslateTitle: "Übersetzungen in 11 Sprachen",
    featTranslateText:
      "Russisch: eine komplette Übersetzung der gesamten Geschichte. Die übrigen 10 Sprachen decken den Demo-Umfang ab — das Intro bis zur ersten Wahl.",
    featVoiceTitle: "KI-Sprachausgabe (11 Sprachen)",
    featVoiceText:
      "Geklonte Stimmen für jede Figur (VoxCPM2) — mit gefühlvoller Darstellung passend zur Szene. Der Demo-Umfang ist in 11 Sprachen vollständig vertont.",
    voiceTitle: "Sprachausgabe — Demo bereit",
    voiceTotal:
      "Demo-Umfang in 11 Sprachen vertont — je 1 188 Zeilen (bis zur ersten Wahl); der volle Durchlauf ist geplant.",
    voiceRu: "Russisch (RU): komplette Übersetzung, Demo-Umfang vertont",
    voiceEn: "Englisch (EN): der Originaltext, Demo-Umfang vertont",
    inst1: "Am einfachsten: Entpacke main.zip irgendwo und führe install.cmd aus — es findet den Spielordner (Steam), fragt die Sprache und installiert alles (lege das Sprachpaket deiner Sprache neben install.cmd). Manuell: main.zip in den Spielordner entpacken, dann das Sprachpaket in denselben Ordner",
    inst2: "Spiel starten und die Sprache in den Mod-Einstellungen wählen (Badge oben rechts) — 11 Sprachen verfügbar",
    instNote: "Erfordert das auf Steam gekaufte Spiel. Dieses Patch ist inoffiziell und nicht mit den Entwicklern oder Publishern verbunden.",
    a1: "Nein — ein inoffizielles Fan-Patch, nicht verbunden mit den Entwicklern oder Publishern.",
  },
  es: {
    title: "The Survival of Sarah Rose — Voces IA + 11 idiomas",
    description:
      "Mod de fan no oficial: doblaje IA completo con voces clonadas y emotivas — más traducciones a 11 idiomas (ruso completo; el resto cubre la intro hasta la primera elección). Gratis, 18+.",
    heroSub:
      "Mod de fan no oficial: el texto del juego completamente doblado — más de 75 voces clonadas con interpretación emotiva en cada línea. 11 idiomas: ruso completo, el resto hasta la primera elección.",
    badgeTranslate: "11 idiomas — RU completo, el resto demo hasta la primera elección",
    badgeVoice: "Doblaje: demo 100 % (11 idiomas, 1 188 líneas cada uno)",
    badgeFormat: "Opus 24 kbps — unos 17 MB por idioma (demo)",
    ctaDownload: "Descargar ZIPs (mod + paquetes de voz)",
    featTranslateTitle: "Traducciones a 11 idiomas",
    featTranslateText:
      "Ruso: traducción completa de toda la historia. Los otros 10 idiomas cubren el ámbito demo — la intro hasta la primera elección.",
    featVoiceTitle: "Doblaje IA (11 idiomas)",
    featVoiceText:
      "Voces clonadas para cada personaje (VoxCPM2), con interpretación emotiva acorde a cada escena. El ámbito demo está completamente doblado en 11 idiomas.",
    voiceTitle: "Doblaje — demo listo",
    voiceTotal:
      "Ámbito demo doblado en 11 idiomas — 1 188 líneas cada uno (hasta la primera elección); la partida completa está planeada.",
    voiceRu: "Ruso (RU): traducción completa, ámbito demo doblado",
    voiceEn: "Inglés (EN): el texto original, ámbito demo doblado",
    inst1: "Lo más fácil: descomprime main.zip en cualquier lugar y ejecuta install.cmd — encuentra la carpeta del juego (Steam), pregunta el idioma y lo instala todo (pon el zip de voz de tu idioma junto a install.cmd). Manual: descomprime main.zip en la carpeta del juego y el zip de voz en la misma carpeta",
    inst2: "Inicia el juego y elige el idioma en los ajustes del mod (ícono arriba a la derecha) — hay 11 idiomas disponibles",
    instNote: "Requiere el juego comprado en Steam. Este parche es no oficial y no está relacionado con los desarrolladores o distribuidores.",
    a1: "No — un parche de fan no oficial, sin relación con los desarrolladores o distribuidores.",
  },
  fr: {
    title: "The Survival of Sarah Rose — Voix IA + 11 langues",
    description:
      "Mod de fans non officiel : doublage IA complet avec des voix clonées et expressives — plus des traductions en 11 langues (russe complet ; les autres couvrent l’intro jusqu’au premier choix). Gratuit, 18+.",
    heroSub:
      "Mod de fans non officiel : le texte du jeu entièrement doublé — plus de 75 voix clonées, jouées avec émotion pour chaque réplique. 11 langues : russe complet, les autres jusqu’au premier choix.",
    badgeTranslate: "11 langues — RU complet, les autres en démo jusqu’au premier choix",
    badgeVoice: "Doublage : démo 100 % (11 langues, 1 188 répliques chacune)",
    badgeFormat: "Opus 24 kbps — environ 17 Mo par langue (démo)",
    ctaDownload: "Télécharger les ZIP (mod + packs de voix)",
    featTranslateTitle: "Traductions en 11 langues",
    featTranslateText:
      "Russe : une traduction complète de toute l’histoire. Les 10 autres langues couvrent le périmètre démo — l’intro jusqu’au premier choix.",
    featVoiceTitle: "Doublage IA (11 langues)",
    featVoiceText:
      "Des voix clonées pour chaque personnage (VoxCPM2), avec l’émotion de chaque scène. Le périmètre démo est entièrement doublé en 11 langues.",
    voiceTitle: "Doublage — démo prête",
    voiceTotal:
      "Périmètre démo doublé en 11 langues — 1 188 répliques chacune (jusqu’au premier choix) ; la partie complète est prévue.",
    voiceRu: "Russe (RU) : traduction complète, périmètre démo doublé",
    voiceEn: "Anglais (EN) : le texte original, périmètre démo doublé",
    inst1: "Le plus simple : décompressez main.zip où vous voulez et lancez install.cmd — il trouve le dossier du jeu (Steam), demande la langue et installe tout (placez le zip vocal de votre langue à côté de install.cmd). Manuel : décompressez main.zip dans le dossier du jeu, puis le zip vocal dans le même dossier",
    inst2: "Lancez le jeu et choisissez la langue dans les réglages du mod (badge en haut à droite) — 11 langues disponibles",
    instNote: "Nécessite le jeu acheté sur Steam. Ce patch est non officiel et sans lien avec les développeurs ou éditeurs.",
    a1: "Non — un patch de fans non officiel, sans lien avec les développeurs ou éditeurs.",
  },
  it: {
    title: "The Survival of Sarah Rose — Voci IA + 11 lingue",
    description:
      "Mod di fan non ufficiale: doppiaggio IA completo con voci clonate ed espressive — più traduzioni in 11 lingue (russo completo; le altre coprono l’intro fino alla prima scelta). Gratis, 18+.",
    heroSub:
      "Mod di fan non ufficiale: il testo del gioco interamente doppiato — oltre 75 voci clonate con interpretazione ricca di emozione per ogni battuta. 11 lingue: russo completo, le altre fino alla prima scelta.",
    badgeTranslate: "11 lingue — RU completo, le altre demo fino alla prima scelta",
    badgeVoice: "Doppiaggio: demo 100 % (11 lingue, 1 188 battute ciascuna)",
    badgeFormat: "Opus 24 kbps — circa 17 MB per lingua (demo)",
    ctaDownload: "Scarica gli ZIP (mod + pacchetti voce)",
    featTranslateTitle: "Traduzioni in 11 lingue",
    featTranslateText:
      "Russo: una traduzione completa di tutta la storia. Le altre 10 lingue coprono l’ambito demo — l’intro fino alla prima scelta.",
    featVoiceTitle: "Doppiaggio IA (11 lingue)",
    featVoiceText:
      "Voci clonate per ogni personaggio (VoxCPM2), con l’emozione di ogni scena. L’ambito demo è interamente doppiato in 11 lingue.",
    voiceTitle: "Doppiaggio — demo pronta",
    voiceTotal:
      "Ambito demo doppiato in 11 lingue — 1 188 battute ciascuna (fino alla prima scelta); la passata completa è prevista.",
    voiceRu: "Russo (RU): traduzione completa, ambito demo doppiato",
    voiceEn: "Inglese (EN): il testo originale, ambito demo doppiato",
    inst1: "Il più semplice: estrai main.zip ovunque e avvia install.cmd — trova la cartella del gioco (Steam), chiede la lingua e installa tutto (metti lo zip vocale della tua lingua accanto a install.cmd). Manuale: estrai main.zip nella cartella del gioco e lo zip vocale nella stessa cartella",
    inst2: "Avvia il gioco e scegli la lingua nelle impostazioni della mod (icona in alto a destra) — 11 lingue disponibili",
    instNote: "Richiede il gioco acquistato su Steam. Questa patch è non ufficiale e non affiliata a sviluppatori o editori.",
    a1: "No — una patch di fan non ufficiale, non affiliata a sviluppatori o editori.",
  },
  ja: {
    title: "The Survival of Sarah Rose — AI音声＆翻訳（11言語）",
    description:
      "非公式ファンパッチ：クローンの感情豊かな声によるAI音声を全編収録——さらに11言語の翻訳付き（ロシア語は完訳、他言語は最初の分岐までのデモ）。無料、18+。",
    heroSub:
      "非公式ファンパッチ：ゲームテキストを全編収録——75以上のクローン声で、各セリフを感情豊かに。11言語対応：ロシア語は完訳、他は最初の分岐まで。",
    badgeTranslate: "11言語——RU完訳、他は最初の分岐までのデモ",
    badgeVoice: "音声：デモ100%（11言語、各1,188行）",
    badgeFormat: "Opus 24 kbps — 言語ごとに約17 MB（デモ）",
    ctaDownload: "ZIPをダウンロード（MOD＋音声パック）",
    featTranslateTitle: "11言語の翻訳",
    featTranslateText:
      "ロシア語は物語全体の完訳。他の10言語はデモ範囲——最初の分岐までの導入をカバー。",
    featVoiceTitle: "AI音声（11言語）",
    featVoiceText:
      "キャラクターごとのクローン声（VoxCPM2）。シーンに合った感情で演じます。デモ範囲は11言語で全編収録。",
    voiceTitle: "音声 — デモ完成",
    voiceTotal:
      "デモ範囲を11言語で収録——各1,188行（最初の分岐まで）。全編は今後予定。",
    voiceRu: "ロシア語（RU）：完訳、デモ範囲を収録",
    voiceEn: "英語（EN）：オリジナルテキスト、デモ範囲を収録",
    inst1: "最簡単：main.zipを任意の場所に展開してinstall.cmdを実行——ゲームフォルダ（Steam）を検出し、言語を尋ねて全てインストールします（使用言語の音声zipをinstall.cmdの隣に置く）。手動：main.zipをゲームフォルダに展開し、音声zipも同じ場所へ",
    inst2: "ゲームを起動し、MOD設定（右上のバッジ）で言語を選択——11言語対応",
    instNote: "Steamで購入したゲームが必要。本パッチは非公式であり、開発元・発売元とは無関係です。",
    a1: "いいえ——非公式ファンパッチです。開発元・発売元とは無関係です。",
  },
  ko: {
    title: "The Survival of Sarah Rose — AI 음성 & 자막 (11개 언어)",
    description:
      "비공식 팬 패치: 클론된 감정 풍부한 목소리의 AI 음성 전부 수록 — 11개 언어 자막 추가(러시아어는 전문 완역, 나머지는 첫 선택까지 데모). 무료, 18+.",
    heroSub:
      "비공식 팬 패치: 게임 텍스트 전부 수록——75개 이상의 클론 보이스로 모든 대사를 감정 있게. 11개 언어: 러시아어는 완역, 나머지는 첫 선택까지.",
    badgeTranslate: "11개 언어 — RU 완역, 나머지는 첫 선택까지 데모",
    badgeVoice: "음성: 데모 100% (11개 언어, 각 1,188줄)",
    badgeFormat: "Opus 24 kbps — 언어당 약 17MB (데모)",
    ctaDownload: "ZIP 다운로드 (MOD + 음성 팩)",
    featTranslateTitle: "11개 언어 번역",
    featTranslateText:
      "러시아어는 전체 스토리 완역. 나머지 10개 언어는 데모 범위——첫 선택까지의 도입부를 커버합니다.",
    featVoiceTitle: "AI 음성 (11개 언어)",
    featVoiceText:
      "캐릭터마다 클론 보이스(VoxCPM2). 장면에 어울리는 감정으로 연기합니다. 데모 범위는 11개 언어로 전부 수록.",
    voiceTitle: "음성 — 데모 준비 완료",
    voiceTotal:
      "데모 범위를 11개 언어로 수록——각 1,188줄(첫 선택까지). 전문은 예정되어 있습니다.",
    voiceRu: "러시아어 (RU): 전문 완역, 데모 범위 수록",
    voiceEn: "영어 (EN): 원문 텍스트, 데모 범위 수록",
    inst1: "가장 간단하게: main.zip을 원하는 곳에 풀고 install.cmd를 실행——게임 폴더(Steam)를 찾아 언어를 묻고 전부 설치합니다(사용할 언어의 음성 zip을 install.cmd 옆에 두세요). 수동: main.zip을 게임 폴더에 풀고 음성 zip도 같은 곳에",
    inst2: "게임을 실행하고 MOD 설정(오른쪽 위 배지)에서 언어 선택 — 11개 언어 지원",
    instNote: "Steam에서 구매한 게임 필요. 이 패치는 비공식이며 개발사/배급사와 무관합니다.",
    a1: "아니요 — 비공식 팬 패치입니다. 개발사/배급사와 무관합니다.",
  },
  pl: {
    title: "The Survival of Sarah Rose — Głosy AI + 11 języków",
    description:
      "Nieoficjalny fanowski patch: pełne udźwiękowienie AI sklonowanymi, emocjonalnymi głosami — plus tłumaczenia na 11 języków (rosyjski kompletny; pozostałe obejmują intro do pierwszego wyboru). Za darmo, 18+.",
    heroSub:
      "Nieoficjalny fanowski patch: tekst gry w całości udźwiękowiony — ponad 75 sklonowanych głosów z emocjonalną grą każdej linii. 11 języków: rosyjski kompletny, pozostałe do pierwszego wyboru.",
    badgeTranslate: "11 języków — RU kompletny, pozostałe demo do pierwszego wyboru",
    badgeVoice: "Udźwiękowienie: demo 100 % (11 języków, po 1 188 linii)",
    badgeFormat: "Opus 24 kbps — ok. 17 MB na język (demo)",
    ctaDownload: "Pobierz ZIPy (mod + pakiety głosów)",
    featTranslateTitle: "Tłumaczenia na 11 języków",
    featTranslateText:
      "Rosyjski: kompletne tłumaczenie całej historii. Pozostałe 10 języków obejmuje zakres demo — intro do pierwszego wyboru.",
    featVoiceTitle: "Udźwiękowienie AI (11 języków)",
    featVoiceText:
      "Sklonowane głosy dla każdej postaci (VoxCPM2) z emocją pasującą do sceny. Zakres demo jest w pełni udźwiękowiony w 11 językach.",
    voiceTitle: "Udźwiękowienie — demo gotowe",
    voiceTotal:
      "Zakres demo udźwiękowiony w 11 językach — po 1 188 linii (do pierwszego wyboru); pełna wersja w planach.",
    voiceRu: "Rosyjski (RU): kompletne tłumaczenie, zakres demo udźwiękowiony",
    voiceEn: "Angielski (EN): oryginalny tekst, zakres demo udźwiękowiony",
    inst1: "Najprościej: rozpakuj main.zip gdziekolwiek i uruchom install.cmd — znajdzie folder gry (Steam), zapyta o język i zainstaluje wszystko (połóż zip głosu swojego języka obok install.cmd). Ręcznie: rozpakuj main.zip do folderu gry, potem zip głosu do tego samego folderu",
    inst2: "Uruchom grę i wybierz język w ustawieniach modu (badge w prawym górnym rogu) — dostępne 11 języków",
    instNote: "Wymaga kupionej gry na Steam. Ten patch jest nieoficjalny i niepowiązany z twórcami ani wydawcami.",
    a1: "Nie — nieoficjalny fanowski patch, niepowiązany z twórcami ani wydawcami.",
  },
  pt: {
    title: "The Survival of Sarah Rose — Vozes IA + 11 idiomas",
    description:
      "Mod de fã não oficial: dublagem IA completa com vozes clonadas e expressivas — mais traduções para 11 idiomas (russo completo; os demais cobrem a intro até a primeira escolha). Grátis, 18+.",
    heroSub:
      "Mod de fã não oficial: o texto do jogo totalmente dublado — mais de 75 vozes clonadas com atuação cheia de emoção em cada fala. 11 idiomas: russo completo, os demais até a primeira escolha.",
    badgeTranslate: "11 idiomas — RU completo, os demais demo até a primeira escolha",
    badgeVoice: "Dublagem: demo 100 % (11 idiomas, 1 188 falas cada)",
    badgeFormat: "Opus 24 kbps — cerca de 17 MB por idioma (demo)",
    ctaDownload: "Baixar ZIPs (mod + pacotes de voz)",
    featTranslateTitle: "Traduções em 11 idiomas",
    featTranslateText:
      "Russo: uma tradução completa de toda a história. Os outros 10 idiomas cobrem o escopo demo — a intro até a primeira escolha.",
    featVoiceTitle: "Dublagem IA (11 idiomas)",
    featVoiceText:
      "Vozes clonadas para cada personagem (VoxCPM2), com a emoção de cada cena. O escopo demo está totalmente dublado em 11 idiomas.",
    voiceTitle: "Dublagem — demo pronto",
    voiceTotal:
      "Escopo demo dublado em 11 idiomas — 1 188 falas cada (até a primeira escolha); a partida completa está prevista.",
    voiceRu: "Russo (RU): tradução completa, escopo demo dublado",
    voiceEn: "Inglês (EN): o texto original, escopo demo dublado",
    inst1: "O mais fácil: extraia main.zip em qualquer lugar e execute install.cmd — ele encontra a pasta do jogo (Steam), pergunta o idioma e instala tudo (coloque o zip de voz do seu idioma ao lado do install.cmd). Manual: extraia main.zip na pasta do jogo e o zip de voz na mesma pasta",
    inst2: "Inicie o jogo e escolha o idioma nas configurações do mod (ícone no canto superior direito) — 11 idiomas disponíveis",
    instNote: "Requer o jogo comprado na Steam. Este patch é não oficial e sem relação com os desenvolvedores ou distribuidores.",
    a1: "Não — um patch de fã não oficial, sem relação com desenvolvedores ou distribuidores.",
  },
  zh: {
    title: "The Survival of Sarah Rose — AI 语音＋11 种语言",
    description:
      "非官方粉丝补丁：克隆情感声线的完整 AI 配音——外加 11 种语言翻译（俄语完整版；其余覆盖到首次选择的演示内容）。免费，18+。",
    heroSub:
      "非官方粉丝补丁：游戏文本全程配音——75+ 克隆声线，每句台词都有情感演绎。11 种语言：俄语完整，其余到首次选择。",
    badgeTranslate: "11 种语言——RU 完整版，其余为首次选择前的演示",
    badgeVoice: "配音：演示版 100%（11 种语言，各 1,188 句）",
    badgeFormat: "Opus 24 kbps — 每语言约 17 MB（演示）",
    ctaDownload: "下载 ZIP（MOD＋语音包）",
    featTranslateTitle: "11 种语言翻译",
    featTranslateText:
      "俄语：整个故事的完整翻译。其余 10 种语言覆盖演示范围——到首次选择的开场。",
    featVoiceTitle: "AI 配音（11 种语言）",
    featVoiceText:
      "每个角色都有克隆声线（VoxCPM2），按场景演绎情绪。演示范围在 11 种语言中全部配音。",
    voiceTitle: "配音 — 演示就绪",
    voiceTotal:
      "演示范围已在 11 种语言中配音——各 1,188 句（到首次选择）；完整流程已列入计划。",
    voiceRu: "俄语（RU）：完整翻译，演示范围已配音",
    voiceEn: "英语（EN）：原文文本，演示范围已配音",
    inst1: "最简单：把 main.zip 解压到任意位置并运行 install.cmd——它会找到游戏目录（Steam），询问语言并安装一切（把所选语言的语音 zip 放在 install.cmd 旁边）。手动：把 main.zip 解压到游戏目录，再把语音 zip 解压到同一目录",
    inst2: "启动游戏，在 MOD 设置（右上角徽章）中选择语言——支持 11 种语言",
    instNote: "需要 Steam 购买的本体游戏。本补丁为非官方作品，与开发者或发行商无关。",
  },
};

let src = readFileSync(GEN, "utf8");
let total = 0;

for (const lang of Object.keys(NEW)) {
  const start = src.indexOf(`  ${lang}: {`);
  if (start < 0) throw new Error(`блок ${lang} не найден`);
  const end = src.indexOf("\n  },", start);
  if (end < 0) throw new Error(`конец блока ${lang} не найден`);
  let block = src.slice(start, end);
  for (const [key, value] of Object.entries(NEW[lang]!)) {
    const re = new RegExp(`(\\b${key}:\\s*)("((?:[^"\\\\]|\\\\.)*)")`);
    const m = re.exec(block);
    if (!m) throw new Error(`${lang}.${key}: значение не найдено`);
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    block = block.replace(re, `$1"${escaped}"`);
    total++;
  }
  src = src.slice(0, start) + block + src.slice(end);
}

writeFileSync(GEN, src);
console.log(`обновлено значений: ${total} (${Object.keys(NEW).length} языков)`);
