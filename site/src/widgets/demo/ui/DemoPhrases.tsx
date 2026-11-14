import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LANGS } from "@/shared/config/i18n";
import { Section } from "@/shared/ui";

import manifest from "../manifest.json";

// 3 крючковые реплики (Сара / Кейт / король Орвэл), порядок = demo.phrases всех
// локалей = manifest.json (uid = md5(en-текста) = игровой uid). Аудио лежит в
// public/demo/{lang}/{uid}.opus для ВСЕХ 11 языков.
const PHRASES = manifest.phrases;

// Порядок языков — ЕДИНЫЙ источник: config/language-priority.json (через LANGS).
const AUDIO_LANGS = LANGS.map((code) => ({ code, label: code.toUpperCase() }));

type Phrase = { speaker: string; text: string };

const fmt = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const styles = stylex.create({
  lead: { color: "var(--muted)", margin: "0 0 18px", maxWidth: 760 },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: {
    backgroundColor: "var(--panel)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 14,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  top: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  play: {
    "appearance": "none",
    "border": "none",
    "borderRadius": "50%",
    "width": 38,
    "height": 38,
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
    ":hover": { borderColor: "var(--link)" },
    ":active": { transform: "scale(0.95)" },
    ":focus-visible": { outline: "2px solid var(--text)", outlineOffset: 2 },
  },
  playOn: {
    "backgroundColor": "var(--accent)",
    "borderColor": "var(--accent)",
    "color": "#ffffff",
    ":hover": { backgroundColor: "var(--accent)", borderColor: "var(--accent)" },
  },
  who: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
  time: {
    fontSize: 12,
    color: "var(--muted)",
    fontVariantNumeric: "tabular-nums",
    marginLeft: "auto",
  },
  text: { margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--text)" },
  wave: {
    width: "100%",
    height: 44,
    display: "block",
    cursor: "pointer",
    touchAction: "none",
    borderRadius: 8,
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: {
    "appearance": "none",
    "cursor": "pointer",
    "borderRadius": 7,
    "padding": "5px 9px",
    "fontSize": 12,
    "fontWeight": 600,
    "letterSpacing": "0.04em",
    "lineHeight": 1.2,
    "backgroundColor": "var(--panel-2)",
    "color": "var(--muted)",
    "borderWidth": 1,
    "borderStyle": "solid",
    "borderColor": "var(--border)",
    "transition": "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
    ":hover": { color: "var(--text)", borderColor: "var(--link)" },
    ":focus-visible": { outline: "2px solid var(--text)", outlineOffset: 2 },
  },
  chipOn: {
    "backgroundColor": "var(--accent)",
    "borderColor": "var(--accent)",
    "color": "#ffffff",
    ":hover": { backgroundColor: "var(--accent)", borderColor: "var(--accent)", color: "#ffffff" },
  },
});

const PlayIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

/** Кэш разбора (uid+lang → пики 0..1 + длительность), чтобы не декодировать повторно. */
const peaksCache = new Map<string, { peaks: number[]; duration: number }>();

const BUCKETS = 160;

async function loadPeaks(uid: string, lang: string): Promise<{ peaks: number[]; duration: number } | null> {
  const key = `${lang}/${uid}`;
  const cached = peaksCache.get(key);
  if (cached) return cached;
  try {
    const url = `${import.meta.env.BASE_URL}demo/${lang}/${uid}.opus`;
    const res = await fetch(url);
    const bytes = await res.arrayBuffer();
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(bytes);
    await ctx.close();
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / BUCKETS));
    const out: number[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      let max = 0;
      for (let j = 0; j < step; j += 16) {
        const v = Math.abs(data[i * step + j] ?? 0);
        if (v > max) max = v;
      }
      out.push(max);
    }
    const top = Math.max(...out, 0.01);
    const norm = out.map((v) => v / top);
    const result = { peaks: norm, duration: buf.duration };
    peaksCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

type WaveProps = {
  uid: string;
  lang: string;
  progress: number;
  onSeek: (ratio: number) => void;
  onDuration: (seconds: number) => void;
  testId: string;
};

/** Волна: пики из декодированного аудио + прогресс; клик/драг = перемотка. */
const Waveform = ({ uid, lang, progress, onSeek, onDuration, testId }: WaveProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async (): Promise<void> => {
      const data = await loadPeaks(uid, lang);
      if (alive && data) {
        setPeaks(data.peaks);
        onDuration(data.duration);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [uid, lang, onDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const bars = peaks ?? Array.from<number>({ length: BUCKETS }).fill(0.12);
    const gap = 1.5;
    const bw = Math.max(1, w / bars.length - gap);
    const mid = h / 2;
    const playedX = progress * w;

    bars.forEach((p, i) => {
      const x = i * (bw + gap);
      const amp = Math.max(1.5, p * (h - 6));
      ctx.fillStyle = x + bw / 2 <= playedX ? "var(--accent, #e2725b)" : "rgba(148,148,160,0.45)";
      ctx.fillRect(x, mid - amp / 2, bw, amp);
    });
  }, [peaks, progress]);

  const seekFrom = (clientX: number, el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  };

  return (
    <canvas
      ref={canvasRef}
      className={stylex.props(styles.wave).className}
      data-testid={testId}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFrom(e.clientX, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekFrom(e.clientX, e.currentTarget);
      }}
    />
  );
};

type CardProps = {
  index: number;
  uid: string;
  phrase: Phrase;
  uiLang: string;
  playing: { uid: string; lang: string } | null;
  progress: number;
  time: { cur: number; dur: number };
  onToggle: (uid: string, lang: string) => void;
  onSeek: (uid: string, lang: string, ratio: number) => void;
};

const PhraseCard = ({ index, uid, phrase, uiLang, playing, progress, time, onToggle, onSeek }: CardProps) => {
  const { t } = useTranslation();
  const isPlaying = playing?.uid === uid;
  const activeLang = isPlaying ? playing.lang : uiLang;
  const ownProgress = isPlaying ? progress : 0;
  const [knownDuration, setKnownDuration] = useState(0);
  const shownDuration = isPlaying && time.dur > 0 ? time.dur : knownDuration;

  return (
    <article className={stylex.props(styles.card).className} data-testid={`demo-row-${index}`}>
      <div className={stylex.props(styles.top).className}>
        <button
          type="button"
          className={stylex.props(styles.play, isPlaying && styles.playOn).className}
          aria-label={isPlaying ? t("demo.pause", { name: phrase.speaker }) : t("demo.play", { name: phrase.speaker })}
          data-testid={`demo-play-${index}`}
          data-playing={isPlaying}
          onClick={() => onToggle(uid, uiLang)}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className={stylex.props(styles.who).className} data-testid={`demo-speaker-${index}`}>
          {phrase.speaker}
        </span>
        <span className={stylex.props(styles.time).className} data-testid={`demo-time-${index}`}>
          {`${fmt(isPlaying ? time.cur : 0)} / ${fmt(shownDuration)}`}
        </span>
      </div>

      <p className={stylex.props(styles.text).className} data-testid={`demo-text-${index}`}>
        {phrase.text}
      </p>

      <Waveform
        uid={uid}
        lang={activeLang}
        progress={ownProgress}
        onSeek={(ratio) => onSeek(uid, activeLang, ratio)}
        onDuration={setKnownDuration}
        testId={`demo-wave-${index}`}
      />

      <div
        className={stylex.props(styles.chips).className}
        role="group"
        aria-label={t("demo.lead")}
        data-testid={`demo-chips-${index}`}
      >
        {AUDIO_LANGS.map((l) => {
          const on = isPlaying && playing.lang === l.code;
          return (
            <button
              key={l.code}
              type="button"
              className={stylex.props(styles.chip, on && styles.chipOn).className}
              aria-pressed={on}
              aria-label={`${l.label}: ${phrase.speaker}`}
              data-testid={`demo-chip-${index}-${l.code}`}
              onClick={() => onToggle(uid, l.code)}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </article>
  );
};

/**
 * Демо-фразы: 3 крючковые реплики (Сара, Кейт, король Орвэл).
 * Текст — на языке интерфейса; чипы проигрывают фразу на любом из 11 языков.
 * Один плеер на страницу, волна = реальные пики из аудио, клик/драг по волне
 * перематывает.
 */
export const DemoPhrases = () => {
  const { t, i18n } = useTranslation();
  const uiLangRaw = (i18n.resolvedLanguage ?? "en").slice(0, 2);
  const uiLang = AUDIO_LANGS.some((l) => l.code === uiLangRaw) ? uiLangRaw : "en";
  const phrases = t("demo.phrases", { returnObjects: true }) as Phrase[];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<{ uid: string; lang: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState({ cur: 0, dur: 0 });

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    const onTime = (): void => {
      setTime({ cur: audio.currentTime, dur: audio.duration || 0 });
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    const onEnd = (): void => {
      setPlaying(null);
      setProgress(0);
      setTime({ cur: 0, dur: audio.duration || 0 });
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onTime);
    audio.addEventListener("ended", onEnd);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = useCallback((uid: string, lang: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing?.uid === uid && playing.lang === lang) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = `${import.meta.env.BASE_URL}demo/${lang}/${uid}.opus`;
    audio.currentTime = 0;
    setProgress(0);
    audio.play().then(
      () => setPlaying({ uid, lang }),
      () => setPlaying(null),
    );
  }, [playing]);

  const seek = useCallback(
    (uid: string, lang: string, ratio: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (playing?.uid !== uid || playing.lang !== lang) {
        audio.src = `${import.meta.env.BASE_URL}demo/${lang}/${uid}.opus`;
        audio.play().then(
          () => setPlaying({ uid, lang }),
          () => setPlaying(null),
        );
      }
      const apply = (): void => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = ratio * audio.duration;
          setProgress(ratio);
          setTime({ cur: audio.currentTime, dur: audio.duration });
        }
      };
      if (audio.readyState >= 1) apply();
      else audio.addEventListener("loadedmetadata", apply, { once: true });
    },
    [playing],
  );

  return (
    <Section title={t("demo.title")} testId="demo">
      <p className={stylex.props(styles.lead).className} data-testid="demo-lead">
        {t("demo.lead")}
      </p>
      <div className={stylex.props(styles.list).className} data-testid="demo-grid">
        {PHRASES.map((row, i) => {
          const phrase: Phrase | undefined = phrases[i];
          if (!phrase) return null;
          return (
            <PhraseCard
              key={row.uid}
              index={i}
              uid={row.uid}
              phrase={phrase}
              uiLang={uiLang}
              playing={playing}
              progress={progress}
              time={time}
              onToggle={toggle}
              onSeek={seek}
            />
          );
        })}
      </div>
    </Section>
  );
};
