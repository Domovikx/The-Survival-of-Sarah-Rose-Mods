import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LANGS, tPhrase } from "@/shared/config";
import type { Lang } from "@/shared/config";
import { cx, PauseIcon, PlayIcon, Section } from "@/shared/ui";

import { DEMO_PHRASES } from "./DemoPhrases.phrases";
import { styles } from "./DemoPhrases.styles";

// Демо-фразы — ОТДЕЛЬНЫЙ кейс переводов: их тексты и имена спикеров берутся из
// po игры (сгенерированы в ./DemoPhrases.phrases.ts, uid = md5(en-текста) = игровой uid).
// В общем каталоге сайта (t()) их нет намеренно — чтобы не путать UI-переводы
// с игровыми репликами. Аудио: public/demo/{lang}/{uid}.opus (все 11 языков).
const PHRASES = DEMO_PHRASES;

// Порядок языков — ЕДИНЫЙ источник: config/language-priority.json (через LANGS).
const AUDIO_LANGS = LANGS.map((code) => ({ code, label: code.toUpperCase() }));

type Phrase = { speaker: string; text: string };

const fmt = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

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
      className={cx(styles.wave)}
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
  const isPlaying = playing?.uid === uid;
  const activeLang = isPlaying ? playing.lang : uiLang;
  const ownProgress = isPlaying ? progress : 0;
  const [knownDuration, setKnownDuration] = useState(0);
  const shownDuration = isPlaying && time.dur > 0 ? time.dur : knownDuration;

  return (
    <article className={cx(styles.card)} data-testid={`${ROOT}--row-${index}`}>
      <div className={cx(styles.top)}>
        <button
          type="button"
          className={cx(styles.play, isPlaying && styles.playOn)}
          aria-label={
            isPlaying
              ? tPhrase("Pause: {{name}}", { name: phrase.speaker })
              : tPhrase("Play: {{name}}", { name: phrase.speaker })
          }
          data-testid={`${ROOT}--play-${index}`}
          data-playing={isPlaying}
          onClick={() => onToggle(uid, uiLang)}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className={cx(styles.who)} data-testid={`${ROOT}--speaker-${index}`}>
          {phrase.speaker}
        </span>
        <span className={cx(styles.time)} data-testid={`${ROOT}--time-${index}`}>
          {`${fmt(isPlaying ? time.cur : 0)} / ${fmt(shownDuration)}`}
        </span>
      </div>

      <p className={cx(styles.text)} data-testid={`${ROOT}--text-${index}`}>
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
        className={cx(styles.chips)}
        role="group"
        aria-label={tPhrase(
          "Real in-game lines with AI voice acting: cloned voices, live emotions. Hit a line — and hear the result.",
        )}
        data-testid={`${ROOT}--chips-${index}`}
      >
        {AUDIO_LANGS.map((l) => {
          const on = isPlaying && playing.lang === l.code;
          return (
            <button
              key={l.code}
              type="button"
              className={cx(styles.chip, on && styles.chipOn)}
              aria-pressed={on}
              aria-label={`${l.label}: ${phrase.speaker}`}
              data-testid={`${ROOT}--chip-${index}-${l.code}`}
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
export const ROOT = "DemoPhrases";

export const DemoPhrases = () => {
  const { i18n } = useTranslation();
  const uiLangRaw = (i18n.resolvedLanguage ?? "en").slice(0, 2);
  const uiLang = AUDIO_LANGS.some((l) => l.code === uiLangRaw) ? uiLangRaw : "en";

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

  const toggle = useCallback(
    (uid: string, lang: string) => {
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
    },
    [playing],
  );

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
    <Section title={tPhrase("Hear it in action")} testId={ROOT}>
      <p className={cx(styles.lead)} data-testid={`${ROOT}--lead`}>
        {tPhrase(
          "Real in-game lines with AI voice acting: cloned voices, live emotions. Hit a line — and hear the result.",
        )}
      </p>
      <div className={cx(styles.list)} data-testid={`${ROOT}--grid`}>
        {PHRASES.map((row, i) => {
          // Текст и имя спикера — из перевода игры (po), а не из каталога сайта.
          const phrase: Phrase = {
            speaker: row.speaker[uiLang as Lang] ?? row.speaker.en,
            text: row.text[uiLang as Lang] ?? row.text.en,
          };
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
