/**
 * Локали интерфейса инсталлятора — тот же принцип, что на сайте TSSR:
 * ключ = английский текст, значения = остальные 10 языков (§«Сайт» в AGENTS).
 *
 * Своя маленькая копия, а не импорт `site/`: инсталлятор — отдельное приложение
 * со своим бандлом, тянуть чужой конфиг ради строк = лишняя связка сборок.
 * Правило одно: **новый текст — сразу 10 переводов**, пропуск ловится типом.
 */

import { LANG_ORDER } from "@/core/langs.generated";

/** Порядок языков — тот же, что у списков игры и сайта (config/language-priority.json). */
export const UI_LANGS = LANG_ORDER;
export type UiLang = (typeof UI_LANGS)[number];
type NonEn = Exclude<UiLang, "en">;

/** Названия языков для переключателя (как на сайте — на своём языке). */
export const LANG_LABELS: Record<UiLang, string> = {
  en: "English",
  zh: "中文",
  ru: "Русский",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  ja: "日本語",
  fr: "Français",
  pl: "Polski",
  ko: "한국어",
  it: "Italiano",
};

type Trans = Record<NonEn, string>;

/** Каталог (экспорт — для теста полноты переводов). */
export const CATALOGUE: Record<string, Trans> = {
  "AI voice pack · Windows · only the official Steam version": {
    zh: "AI 语音 · Windows · 仅支持 Steam 官方版本",
    ru: "AI-озвучка · Windows · только официальная версия из Steam",
    es: "Voces IA · Windows · solo la versión oficial de Steam",
    pt: "Vozes de IA · Windows · apenas a versão oficial da Steam",
    de: "KI-Stimmen · Windows · nur die offizielle Steam-Version",
    ja: "AI音声 · Windows · Steam 公式版のみ対応",
    fr: "Voix IA · Windows · version officielle Steam uniquement",
    pl: "Głos AI · Windows · tylko oficjalna wersja ze Steam",
    ko: "AI 음성 · Windows · 공식 Steam 버전 전용",
    it: "Voci IA · Windows · solo versione ufficiale Steam",
  },
  "Game": {
    zh: "游戏",
    ru: "Игра",
    es: "Juego",
    pt: "Jogo",
    de: "Spiel",
    ja: "ゲーム",
    fr: "Jeu",
    pl: "Gra",
    ko: "게임",
    it: "Gioco",
  },
  "Folder": {
    zh: "文件夹",
    ru: "Папка",
    es: "Carpeta",
    pt: "Pasta",
    de: "Ordner",
    ja: "フォルダー",
    fr: "Dossier",
    pl: "Folder",
    ko: "폴더",
    it: "Cartella",
  },
  "Steam build": {
    zh: "Steam 版本号",
    ru: "Сборка Steam",
    es: "Versión de Steam",
    pt: "Versão da Steam",
    de: "Steam-Build",
    ja: "Steam ビルド",
    fr: "Version Steam",
    pl: "Wersja Steam",
    ko: "Steam 빌드",
    it: "Build di Steam",
  },
  "Detect again": {
    zh: "重新检测",
    ru: "Найти заново",
    es: "Detectar de nuevo",
    pt: "Detectar novamente",
    de: "Erneut suchen",
    ja: "再検出",
    fr: "Détecter à nouveau",
    pl: "Wykryj ponownie",
    ko: "다시 찾기",
    it: "Rileva di nuovo",
  },
  "Components": {
    zh: "组件",
    ru: "Компоненты",
    es: "Componentes",
    pt: "Componentes",
    de: "Komponenten",
    ja: "コンポーネント",
    fr: "Composants",
    pl: "Komponenty",
    ko: "구성 요소",
    it: "Componenti",
  },
  "Core": {
    zh: "核心",
    ru: "Ядро",
    es: "Núcleo",
    pt: "Núcleo",
    de: "Kern",
    ja: "コア",
    fr: "Cœur",
    pl: "Rdzeń",
    ko: "코어",
    it: "Nucleo",
  },
  "Texts in 10 languages, fonts, mod menu. Required for any voice pack.": {
    zh: "10 种语言的文本、字体和模组菜单。任何语音包都需要它。",
    ru: "Тексты на 10 языках, шрифты и меню мода. Нужен для любого голосового пака.",
    es: "Textos en 10 idiomas, fuentes y menú del mod. Necesario para cualquier paquete de voz.",
    pt: "Textos em 10 idiomas, fontes e menu do mod. Necessário para qualquer pacote de voz.",
    de: "Texte in 10 Sprachen, Schriften und Mod-Menü. Für jedes Sprachpaket nötig.",
    ja: "10言語のテキスト、フォント、Modメニュー。音声パックには必須です。",
    fr: "Textes en 10 langues, polices et menu du mod. Requis pour tout pack vocal.",
    pl: "Teksty w 10 językach, czcionki i menu moda. Wymagane dla każdego pakietu głosowego.",
    ko: "10개 언어 텍스트, 글꼴, 모드 메뉴. 모든 음성 팩에 필요합니다.",
    it: "Testi in 10 lingue, font e menu della mod. Necessario per qualsiasi pacchetto vocale.",
  },
  "Voice packs": {
    zh: "语音包",
    ru: "Голосовые паки",
    es: "Paquetes de voz",
    pt: "Pacotes de voz",
    de: "Sprachpakete",
    ja: "音声パック",
    fr: "Packs vocaux",
    pl: "Pakiety głosowe",
    ko: "음성 팩",
    it: "Pacchetti vocali",
  },
  "optional · one per language · 15–21 MB each": {
    zh: "可选 · 每种语言一个 · 每个 15–21 MB",
    ru: "необязательно · по одному на язык · 15–21 МБ каждый",
    es: "opcional · uno por idioma · 15–21 MB cada uno",
    pt: "opcional · um por idioma · 15–21 MB cada",
    de: "optional · eines pro Sprache · je 15–21 MB",
    ja: "任意 · 言語ごとに1つ · 各 15–21 MB",
    fr: "facultatif · un par langue · 15–21 Mo chacun",
    pl: "opcjonalne · jeden na język · 15–21 MB każdy",
    ko: "선택 사항 · 언어당 하나 · 각 15–21 MB",
    it: "opzionale · uno per lingua · 15–21 MB ciascuno",
  },
  "installed": {
    zh: "已安装",
    ru: "установлено",
    es: "instalado",
    pt: "instalado",
    de: "installiert",
    ja: "インストール済み",
    fr: "installé",
    pl: "zainstalowano",
    ko: "설치됨",
    it: "installato",
  },
  "not installed": {
    zh: "未安装",
    ru: "не установлено",
    es: "no instalado",
    pt: "não instalado",
    de: "nicht installiert",
    ja: "未インストール",
    fr: "non installé",
    pl: "nie zainstalowano",
    ko: "설치 안 됨",
    it: "non installato",
  },
  "{{n}} audio files": {
    zh: "{{n}} 个音频文件",
    ru: "{{n}} аудиофайлов",
    es: "{{n}} archivos de audio",
    pt: "{{n}} arquivos de áudio",
    de: "{{n}} Audiodateien",
    ja: "音声ファイル {{n}} 個",
    fr: "{{n}} fichiers audio",
    pl: "{{n}} plików audio",
    ko: "오디오 파일 {{n}}개",
    it: "{{n}} file audio",
  },
  "core + {{n}} voice packs": {
    zh: "核心 + {{n}} 个语音包",
    ru: "Ядро + {{n}} голосовых паков",
    es: "núcleo + {{n}} paquetes de voz",
    pt: "núcleo + {{n}} pacotes de voz",
    de: "Kern + {{n}} Sprachpakete",
    ja: "コア + 音声パック {{n}} 個",
    fr: "cœur + {{n}} packs vocaux",
    pl: "rdzeń + pakiety głosowe: {{n}}",
    ko: "코어 + 음성 팩 {{n}}개",
    it: "nucleo + {{n}} pacchetti vocali",
  },
  "core installed, no voice packs": {
    zh: "核心已安装，暂无语音包",
    ru: "Ядро установлено, голосовых паков нет",
    es: "núcleo instalado, sin paquetes de voz",
    pt: "núcleo instalado, sem pacotes de voz",
    de: "Kern installiert, keine Sprachpakete",
    ja: "コアのみインストール済み（音声パックなし）",
    fr: "cœur installé, aucun pack vocal",
    pl: "rdzeń zainstalowany, brak pakietów głosowych",
    ko: "코어만 설치됨, 음성 팩 없음",
    it: "nucleo installato, nessun pacchetto vocale",
  },
  "not found": {
    zh: "未找到",
    ru: "не найдена",
    es: "no encontrado",
    pt: "não encontrado",
    de: "nicht gefunden",
    ja: "見つかりません",
    fr: "introuvable",
    pl: "nie znaleziono",
    ko: "찾을 수 없음",
    it: "non trovato",
  },
  "Cancel": {
    zh: "取消",
    ru: "Отмена",
    es: "Cancelar",
    pt: "Cancelar",
    de: "Abbrechen",
    ja: "キャンセル",
    fr: "Annuler",
    pl: "Anuluj",
    ko: "취소",
    it: "Annulla",
  },
  "Apply changes": {
    zh: "应用更改",
    ru: "Применить изменения",
    es: "Aplicar cambios",
    pt: "Aplicar alterações",
    de: "Änderungen anwenden",
    ja: "変更を適用",
    fr: "Appliquer les modifications",
    pl: "Zastosuj zmiany",
    ko: "변경 사항 적용",
    it: "Applica modifiche",
  },
  "will be installed": {
    zh: "将被安装",
    ru: "будет установлено",
    es: "se instalará",
    pt: "será instalado",
    de: "wird installiert",
    ja: "インストール予定",
    fr: "sera installé",
    pl: "zostanie zainstalowane",
    ko: "설치 예정",
    it: "verrà installato",
  },
  "will be removed": {
    zh: "将被删除",
    ru: "будет удалено",
    es: "se eliminará",
    pt: "será removido",
    de: "wird entfernt",
    ja: "削除予定",
    fr: "sera supprimé",
    pl: "zostanie usunięte",
    ko: "삭제 예정",
    it: "verrà rimosso",
  },
  "Remove": {
    zh: "移除",
    ru: "Удалить",
    es: "Quitar",
    pt: "Remover",
    de: "Entfernen",
    ja: "削除",
    fr: "Retirer",
    pl: "Usuń",
    ko: "제거",
    it: "Rimuovi",
  },
  "Install selected": {
    zh: "安装所选",
    ru: "Установить выбранное",
    es: "Instalar seleccionados",
    pt: "Instalar selecionados",
    de: "Auswahl installieren",
    ja: "選択項目をインストール",
    fr: "Installer la sélection",
    pl: "Zainstaluj wybrane",
    ko: "선택 항목 설치",
    it: "Installa selezionati",
  },
  "Install selected ({{n}})": {
    zh: "安装所选（{{n}}）",
    ru: "Установить выбранное ({{n}})",
    es: "Instalar seleccionados ({{n}})",
    pt: "Instalar selecionados ({{n}})",
    de: "Auswahl installieren ({{n}})",
    ja: "選択項目をインストール（{{n}}）",
    fr: "Installer la sélection ({{n}})",
    pl: "Zainstaluj wybrane ({{n}})",
    ko: "선택 항목 설치 ({{n}})",
    it: "Installa selezionati ({{n}})",
  },
  "Install core": {
    zh: "安装核心",
    ru: "Установить ядро",
    es: "Instalar núcleo",
    pt: "Instalar núcleo",
    de: "Kern installieren",
    ja: "コアをインストール",
    fr: "Installer le cœur",
    pl: "Zainstaluj rdzeń",
    ko: "코어 설치",
    it: "Installa nucleo",
  },
  "Working…": {
    zh: "正在处理…",
    ru: "Работаю…",
    es: "Trabajando…",
    pt: "Trabalhando…",
    de: "Arbeite…",
    ja: "処理中…",
    fr: "En cours…",
    pl: "Pracuję…",
    ko: "작업 중…",
    it: "In corso…",
  },
  "Uninstall mod": {
    zh: "卸载模组",
    ru: "Удалить мод",
    es: "Desinstalar mod",
    pt: "Desinstalar mod",
    de: "Mod deinstallieren",
    ja: "Modをアンインストール",
    fr: "Désinstaller le mod",
    pl: "Odinstaluj moda",
    ko: "모드 제거",
    it: "Disinstalla la mod",
  },
  "Like the patch?": {
    zh: "喜欢这个补丁？",
    ru: "Понравился патч?",
    es: "¿Te gusta el parche?",
    pt: "Gostou do patch?",
    de: "Gefällt dir der Patch?",
    ja: "パッチはお気に入りですか？",
    fr: "Le patch vous plaît ?",
    pl: "Podoba Ci się patch?",
    ko: "패치가 마음에 드시나요?",
    it: "Ti piace la patch?",
  },
  "Star on GitHub": {
    zh: "在 GitHub 点星",
    ru: "Звезда на GitHub",
    es: "Estrella en GitHub",
    pt: "Estrela no GitHub",
    de: "Stern auf GitHub",
    ja: "GitHub でスター",
    fr: "Étoile sur GitHub",
    pl: "Gwiazdka na GitHubie",
    ko: "GitHub에 별 주기",
    it: "Stella su GitHub",
  },
  "Steam guide": {
    zh: "Steam 指南",
    ru: "Гайд в Steam",
    es: "Guía de Steam",
    pt: "Guia da Steam",
    de: "Steam-Leitfaden",
    ja: "Steam ガイド",
    fr: "Guide Steam",
    pl: "Poradnik Steam",
    ko: "Steam 가이드",
    it: "Guida Steam",
  },
  "Report an issue": {
    zh: "报告问题",
    ru: "Сообщить о проблеме",
    es: "Informar de un problema",
    pt: "Relatar um problema",
    de: "Problem melden",
    ja: "問題を報告",
    fr: "Signaler un problème",
    pl: "Zgłoś problem",
    ko: "문제 신고",
    it: "Segnala un problema",
  },
  "Language": {
    zh: "界面语言",
    ru: "Язык интерфейса",
    es: "Idioma de la interfaz",
    pt: "Idioma da interface",
    de: "Sprache der Oberfläche",
    ja: "表示言語",
    fr: "Langue de l'interface",
    pl: "Język interfejsu",
    ko: "인터페이스 언어",
    it: "Lingua dell'interfaccia",
  },
  "Log": {
    zh: "日志",
    ru: "Лог",
    es: "Registro",
    pt: "Registro",
    de: "Protokoll",
    ja: "ログ",
    fr: "Journal",
    pl: "Dziennik",
    ko: "로그",
    it: "Log",
  },
  "detecting game…": {
    zh: "正在检测游戏…",
    ru: "ищу игру…",
    es: "detectando el juego…",
    pt: "detectando o jogo…",
    de: "Spiel wird gesucht…",
    ja: "ゲームを検出中…",
    fr: "détection du jeu…",
    pl: "wykrywanie gry…",
    ko: "게임 찾는 중…",
    it: "rilevamento del gioco…",
  },
  "game not found": {
    zh: "游戏未找到",
    ru: "игра не найдена",
    es: "juego no encontrado",
    pt: "jogo não encontrado",
    de: "Spiel nicht gefunden",
    ja: "ゲームが見つかりません",
    fr: "jeu introuvable",
    pl: "nie znaleziono gry",
    ko: "게임을 찾을 수 없음",
    it: "gioco non trovato",
  },
  "game not found: official Steam version is required (App ID 2166470)": {
    zh: "游戏未找到：需要 Steam 官方版本（App ID 2166470）",
    ru: "игра не найдена: нужна официальная Steam-версия (App ID 2166470)",
    es: "juego no encontrado: se requiere la versión oficial de Steam (App ID 2166470)",
    pt: "jogo não encontrado: é necessária a versão oficial da Steam (App ID 2166470)",
    de: "Spiel nicht gefunden: offizielle Steam-Version erforderlich (App-ID 2166470)",
    ja: "ゲームが見つかりません：Steam 公式版が必要です（App ID 2166470）",
    fr: "jeu introuvable : la version officielle Steam est requise (App ID 2166470)",
    pl: "nie znaleziono gry: wymagana oficjalna wersja ze Steam (App ID 2166470)",
    ko: "게임을 찾을 수 없습니다. 공식 Steam 버전이 필요합니다 (App ID 2166470)",
    it: "gioco non trovato: serve la versione ufficiale Steam (App ID 2166470)",
  },
  "done — launch the game and open the mod menu (badge in the top-right)": {
    zh: "完成 — 启动游戏并打开模组菜单（右上角的徽标）",
    ru: "готово — запустите игру и откройте меню мода (бейдж в правом верхнем углу)",
    es: "listo — inicia el juego y abre el menú del mod (insignia arriba a la derecha)",
    pt: "pronto — inicie o jogo e abra o menu do mod (selo no canto superior direito)",
    de: "fertig — starte das Spiel und öffne das Mod-Menü (Badge oben rechts)",
    ja: "完了 — ゲームを起動し、Modメニューを開いてください（右上のバッジ）",
    fr: "terminé — lancez le jeu et ouvrez le menu du mod (badge en haut à droite)",
    pl: "gotowe — uruchom grę i otwórz menu moda (plakietka w prawym górnym rogu)",
    ko: "완료 — 게임을 실행하고 모드 메뉴를 여세요 (오른쪽 위 배지)",
    it: "fatto — avvia il gioco e apri il menu della mod (badge in alto a destra)",
  },
  "installing {{i}}/{{n}}: {{what}}": {
    zh: "安装 {{i}}/{{n}}：{{what}}",
    ru: "устанавливаю {{i}}/{{n}}: {{what}}",
    es: "instalando {{i}}/{{n}}: {{what}}",
    pt: "instalando {{i}}/{{n}}: {{what}}",
    de: "installiere {{i}}/{{n}}: {{what}}",
    ja: "インストール中 {{i}}/{{n}}：{{what}}",
    fr: "installation {{i}}/{{n}} : {{what}}",
    pl: "instalowanie {{i}}/{{n}}: {{what}}",
    ko: "설치 중 {{i}}/{{n}}: {{what}}",
    it: "installazione {{i}}/{{n}}: {{what}}",
  },
  "Remove {{name}} ({{code}}) voice pack?": {
    zh: "移除 {{name}}（{{code}}）语音包？",
    ru: "Удалить голосовой пак {{name}} ({{code}})?",
    es: "¿Quitar el paquete de voz {{name}} ({{code}})?",
    pt: "Remover o pacote de voz {{name}} ({{code}})?",
    de: "Sprachpaket {{name}} ({{code}}) entfernen?",
    ja: "{{name}}（{{code}}）の音声パックを削除しますか？",
    fr: "Retirer le pack vocal {{name}} ({{code}}) ?",
    pl: "Usunąć pakiet głosowy {{name}} ({{code}})?",
    ko: "{{name}}({{code}}) 음성 팩을 제거할까요?",
    it: "Rimuovere il pacchetto vocale {{name}} ({{code}})?",
  },
  "Uninstall TSSR AI Voice Pack from {{path}}?": {
    zh: "从 {{path}} 卸载 TSSR AI Voice Pack？",
    ru: "Удалить TSSR AI Voice Pack из {{path}}?",
    es: "¿Desinstalar TSSR AI Voice Pack de {{path}}?",
    pt: "Desinstalar o TSSR AI Voice Pack de {{path}}?",
    de: "TSSR AI Voice Pack aus {{path}} deinstallieren?",
    ja: "{{path}} から TSSR AI Voice Pack を削除しますか？",
    fr: "Désinstaller TSSR AI Voice Pack de {{path}} ?",
    pl: "Odinstalować TSSR AI Voice Pack z {{path}}?",
    ko: "{{path}}에서 TSSR AI Voice Pack을 제거할까요?",
    it: "Disinstallare TSSR AI Voice Pack da {{path}}?",
  },
  "Other mods in mods/ ({{list}}) are kept, environment.txt stays.": {
    zh: "mods/ 中的其他模组（{{list}}）会保留，environment.txt 不动。",
    ru: "Другие моды в mods/ ({{list}}) не трогаем, environment.txt останется.",
    es: "Otros mods en mods/ ({{list}}) se conservan, environment.txt se queda.",
    pt: "Outros mods em mods/ ({{list}}) são mantidos, environment.txt fica.",
    de: "Andere Mods in mods/ ({{list}}) bleiben erhalten, environment.txt bleibt.",
    ja: "mods/ 内の他のMod（{{list}}）は残し、environment.txt もそのままにします。",
    fr: "Les autres mods dans mods/ ({{list}}) sont conservés, environment.txt reste.",
    pl: "Inne mody w mods/ ({{list}}) zostaną zachowane, environment.txt pozostanie.",
    ko: "mods/의 다른 모드({{list}})는 유지하고 environment.txt도 남깁니다.",
    it: "Le altre mod in mods/ ({{list}}) restano, environment.txt rimane.",
  },
};

const STORAGE_KEY = "tssr-installer-lang";
let lang: UiLang = "en";

const asLang = (code: string | undefined | null): UiLang | null => {
  const base = (code ?? "").slice(0, 2).toLowerCase();
  return (UI_LANGS as readonly string[]).includes(base) ? (base as UiLang) : null;
};

/**
 * Первичный язык: выбор пользователя (localStorage) → язык Windows →
 * `navigator.language` → английский.
 *
 * Почему Windows вперёд: в WebView2 `navigator.language` бывает `en-US` даже
 * на русской системе (проверено 2026-11-20) — и интерфейс стартовал не на том
 * языке. Системное значение приходит из Rust (`system_locale`).
 */
export const initLang = (systemLocale?: string | null): UiLang => {
  // localStorage может быть недоступен (приватный режим/тесты): выбор языка —
  // удобство, а не условие работы приложения.
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  const nav = typeof navigator === "undefined" ? "" : navigator.language;
  lang = asLang(saved) ?? asLang(systemLocale) ?? asLang(nav) ?? "en";
  // В node (юнит-тесты) DOM нет — язык всего лишь синхронизация атрибута.
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  return lang;
};

export const getLang = (): UiLang => lang;

export const setLang = (next: UiLang): void => {
  lang = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
};

/** Перевод по ключу-английскому тексту с подстановкой `{{var}}`. */
export const t = (key: string, vars?: Record<string, string | number>): string => {
  const entry = CATALOGUE[key];
  let text = lang === "en" ? key : (entry?.[lang] ?? key);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return text;
};
