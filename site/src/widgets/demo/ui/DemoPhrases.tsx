import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Section } from "@/shared/ui";

import manifest from "../manifest.json";

// Связка текст+опус ЯВНАЯ (владелец 2026-11-11: «связка обязательна»):
// manifest.json — uid = md5(en-текста реплики) = игровой uid, порядок =
// demo.phrases всех локалей; E2E (site/e2e/demo.spec.ts) проверяет инвариант
// md5 и наличие опусов. Аудио-языки: свои папки в public/demo/{lang}/
// (контракт {uid}.opus); язык без папки получает en (не молчание).
const PHRASE_UIDS = manifest.phrases.map((p) => p.uid);

const AUDIO_LANGS = ["ru", "en", "de", "es", "fr", "it"] as const;
type AudioLang = (typeof AUDIO_LANGS)[number];

type Phrase = { speaker: string; text: string };

const styles = stylex.create({
  lead: {
    color: "var(--muted)",
    margin: "0 0 16px",
    maxWidth: 720,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: 10,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    backgroundColor: "var(--panel)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 12,
    padding: "12px 16px",
  },
  play: {
    "appearance": "none",
    "border": "none",
    "borderRadius": "50%",
    "width": 44,
    "height": 44,
    "flexShrink": 0,
    "display": "inline-flex",
    "alignItems": "center",
    "justifyContent": "center",
    "cursor": "pointer",
    "backgroundColor": "var(--panel-2)",
    "color": "var(--text)",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "transition": "background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease",
    ":hover": {
      borderColor: "var(--link)",
      backgroundColor: "var(--panel)",
    },
    ":active": { transform: "scale(0.95)" },
    // Нейтральное кольцо: кнопка бывает красной (playing) — синий диссонировал бы
    ":focus-visible": { outline: "2px solid var(--text)", outlineOffset: 2 },
  },
  playOn: {
    "backgroundColor": "var(--accent)",
    "borderColor": "var(--accent)",
    "color": "#ffffff",
    // Играющая кнопка должна оставаться акцентной и под курсором:
    // play:hover (специфичность 0,2,0) перебивал бы playOn (0,1,0).
    ":hover": {
      backgroundColor: "var(--accent)",
      borderColor: "var(--accent)",
    },
  },
  body: {
    minWidth: 0,
  },
  text: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.45,
  },
  speaker: {
    fontSize: 13,
    color: "var(--muted)",
    marginTop: 4,
    display: "block",
  },
});

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

/**
 * Демо-фразы: 7 реплик с AI-озвучкой как крючок для скачивания.
 * Локаль определяет и текст, и аудио: RU-локаль → русские фразы, EN → английские.
 * Один проигрыватель на странице (новая фраза останавливает предыдущую).
 */
export const DemoPhrases = () => {
  const { t, i18n } = useTranslation();
  const resolved = i18n.resolvedLanguage ?? "en";
  const lang: AudioLang = (AUDIO_LANGS as readonly string[]).includes(resolved) ? (resolved as AudioLang) : "en";
  const phrases = t("demo.phrases", { returnObjects: true }) as Phrase[];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  // Смена языка меняет и аудио — текущую фразу останавливаем.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
    }
  }, [lang]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const handlePlay = (uid: string) => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener("ended", () => setPlaying(null));
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (playing === uid) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = `${import.meta.env.BASE_URL}demo/${lang}/${uid}.opus`;
    audio.play().catch(() => setPlaying(null));
    setPlaying(uid);
  };

  return (
    <Section title={t("demo.title")} testId="demo">
      <p className={stylex.props(styles.lead).className} data-testid="demo-lead">
        {t("demo.lead")}
      </p>
      <div className={stylex.props(styles.grid).className} data-testid="demo-grid">
        {PHRASE_UIDS.map((uid, i) => {
          const phrase: Phrase | undefined = phrases[i];
          if (!phrase) return null;
          const isPlaying = playing === uid;
          return (
            <div key={uid} className={stylex.props(styles.row).className} data-testid={`demo-row-${i}`}>
              <button
                type="button"
                className={stylex.props(styles.play, isPlaying && styles.playOn).className}
                aria-label={
                  isPlaying ? t("demo.pause", { name: phrase.speaker }) : t("demo.play", { name: phrase.speaker })
                }
                data-testid={`demo-play-${i}`}
                data-playing={isPlaying}
                onClick={() => handlePlay(uid)}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <div className={stylex.props(styles.body).className}>
                <p className={stylex.props(styles.text).className} data-testid={`demo-text-${i}`}>
                  {phrase.text}
                </p>
                <span className={stylex.props(styles.speaker).className} data-testid={`demo-speaker-${i}`}>
                  {phrase.speaker}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
};
