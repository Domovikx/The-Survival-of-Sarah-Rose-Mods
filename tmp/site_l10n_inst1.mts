/**
 * site_l10n_inst1.mts — install.step1 без «спросит язык» (владелец 2026-11-12:
 * тексты всех языков в main — выбирать нечего; голоса = пакеты рядом).
 * Патчит словари T генератора. Запуск: node tmp/site_l10n_inst1.mts && node tmp/site_l10n_gen.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

const GEN = "tmp/site_l10n_gen.mts";
const INST1: Record<string, string> = {
  de: "Am einfachsten: Entpacke main.zip irgendwo und führe install.cmd aus — es findet den Spielordner (Steam) und installiert alles; lege die gewünschten Sprachpakete neben install.cmd — alle gefundenen Pakete werden installiert. Manuell: main.zip in den Spielordner entpacken, dann die Sprachpakete in denselben Ordner",
  es: "Lo más fácil: descomprime main.zip en cualquier lugar y ejecuta install.cmd — encuentra la carpeta del juego (Steam) e instala todo; pon los paquetes de voz que quieras junto a install.cmd — se instalan todos los encontrados. Manual: descomprime main.zip en la carpeta del juego y los zip de voz en la misma carpeta",
  fr: "Le plus simple : décompressez main.zip où vous voulez et lancez install.cmd — il trouve le dossier du jeu (Steam) et installe tout ; placez les packs de voix voulus à côté de install.cmd — tous les packs trouvés sont installés. Manuel : décompressez main.zip dans le dossier du jeu, puis les zip vocaux dans le même dossier",
  it: "Il più semplice: estrai main.zip ovunque e avvia install.cmd — trova la cartella del gioco (Steam) e installa tutto; metti i pacchetti voce che vuoi accanto a install.cmd — tutti i pacchetti trovati vengono installati. Manuale: estrai main.zip nella cartella del gioco e gli zip vocali nella stessa cartella",
  ja: "最簡単：main.zipを任意の場所に展開してinstall.cmdを実行——ゲームフォルダ（Steam）を検出して全てインストールします；必要な音声パックをinstall.cmdの隣に置くと、見つかった分はすべてインストールされます。手動：main.zipをゲームフォルダに展開し、音声zipも同じ場所へ",
  ko: "가장 간단하게: main.zip을 원하는 곳에 풀고 install.cmd를 실행——게임 폴더(Steam)를 찾아 전부 설치합니다; 필요한 음성 팩을 install.cmd 옆에 두면 발견된 팩이 모두 설치됩니다. 수동: main.zip을 게임 폴더에 풀고 음성 zip도 같은 곳에",
  pl: "Najprościej: rozpakuj main.zip gdziekolwiek i uruchom install.cmd — znajdzie folder gry (Steam) i zainstaluje wszystko; połóż wybrane pakiety głosów obok install.cmd — zainstalują się wszystkie znalezione. Ręcznie: rozpakuj main.zip do folderu gry, potem zip głosów do tego samego folderu",
  pt: "O mais fácil: extraia main.zip em qualquer lugar e execute install.cmd — ele encontra a pasta do jogo (Steam) e instala tudo; coloque os pacotes de voz que quiser ao lado do install.cmd — todos os encontrados são instalados. Manual: extraia main.zip na pasta do jogo e os zip de voz na mesma pasta",
  zh: "最简单：把 main.zip 解压到任意位置并运行 install.cmd——它会找到游戏目录（Steam）并安装一切；把所需的语音包放在 install.cmd 旁边，找到的包都会安装。手动：把 main.zip 解压到游戏目录，再把语音 zip 解压到同一目录",
};

let src = readFileSync(GEN, "utf8");
let total = 0;
for (const [lang, value] of Object.entries(INST1)) {
  const start = src.indexOf(`  ${lang}: {`);
  const end = src.indexOf("\n  },", start);
  if (start < 0 || end < 0) throw new Error(`блок ${lang} не найден`);
  let block = src.slice(start, end);
  const re = /(\binst1:\s*)("((?:[^"\\]|\\.)*)")/;
  if (!re.test(block)) throw new Error(`${lang}.inst1: не найдено`);
  block = block.replace(re, `$1"${value.replace(/"/g, '\\"')}"`);
  src = src.slice(0, start) + block + src.slice(end);
  total++;
}
writeFileSync(GEN, src);
console.log(`inst1 обновлено: ${total}`);
