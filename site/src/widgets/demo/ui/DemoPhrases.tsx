import * as stylex from '@stylexjs/stylex'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Section } from '@/shared/ui'

// uid = md5(old) — файлы site/public/demo/{ru,en}/{uid}.opus (прямые копии из
// ai_voice/**/*.opus — нативный opus как в моде, линки 1:1; 7 реплик по темам
// из demo-grid, одинаковые uid в обоих языках). Порядок = demo.phrases в локалях.
const PHRASE_UIDS = [
  '3a192b42302d0aa088a23e7fab29983b', // интрига — Sarah
  'f956b1ec4bd1df104cf2ffef7b74c2ac', // откровение — Thomas
  '40e1ba10148e47ddb91fa28114270349', // флирт — Carolyn
  '6424451692e133352a89e3703fd872c6', // драма — Sarah
  '01f7f305172f580ac28500645a639854', // жёсткость — Garret
  'fa03c1667916774e3eb9381ac88fba3f', // страсть 18+ — Sarah
  '8a58d3fa060638a81c3642a046e5d2b5', // нарратор
] as const

type Phrase = { speaker: string; text: string }

const styles = stylex.create({
  lead: {
    color: 'var(--muted)',
    margin: '0 0 16px',
    maxWidth: 720,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: 10,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'var(--panel)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 12,
    padding: '12px 16px',
  },
  play: {
    appearance: 'none',
    border: 'none',
    borderRadius: '50%',
    width: 44,
    height: 44,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backgroundColor: 'var(--panel-2)',
    color: 'var(--text)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease',
    ':hover': {
      borderColor: 'var(--link)',
      backgroundColor: 'var(--panel)',
    },
    ':active': { transform: 'scale(0.95)' },
    // Нейтральное кольцо: кнопка бывает красной (playing) — синий диссонировал бы
    ':focus-visible': { outline: '2px solid var(--text)', outlineOffset: 2 },
  },
  playOn: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: '#ffffff',
    // Играющая кнопка должна оставаться акцентной и под курсором:
    // play:hover (специфичность 0,2,0) перебивал бы playOn (0,1,0).
    ':hover': {
      backgroundColor: 'var(--accent)',
      borderColor: 'var(--accent)',
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
    color: 'var(--muted)',
    marginTop: 4,
    display: 'block',
  },
})

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
)

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
)

/**
 * Демо-фразы: 7 реплик с AI-озвучкой как крючок для скачивания.
 * Локаль определяет и текст, и аудио: RU-локаль → русские фразы, EN → английские.
 * Один проигрыватель на странице (новая фраза останавливает предыдущую).
 */
export const DemoPhrases = () => {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
  const phrases = t('demo.phrases', { returnObjects: true }) as Phrase[]
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  // Смена языка меняет и аудио — текущую фразу останавливаем.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setPlaying(null)
    }
  }, [lang])

  useEffect(() => () => audioRef.current?.pause(), [])

  const handlePlay = (uid: string) => {
    if (!audioRef.current) {
      const audio = new Audio()
      audio.addEventListener('ended', () => setPlaying(null))
      audioRef.current = audio
    }
    const audio = audioRef.current
    if (playing === uid) {
      audio.pause()
      setPlaying(null)
      return
    }
    audio.src = `${import.meta.env.BASE_URL}demo/${lang}/${uid}.opus`
    audio.play().catch(() => setPlaying(null))
    setPlaying(uid)
  }

  return (
    <Section title={t('demo.title')} testId="demo">
      <p className={stylex.props(styles.lead).className} data-testid="demo-lead">
        {t('demo.lead')}
      </p>
      <div className={stylex.props(styles.grid).className} data-testid="demo-grid">
        {PHRASE_UIDS.map((uid, i) => {
          const phrase: Phrase | undefined = phrases[i]
          if (!phrase) return null
          const isPlaying = playing === uid
          return (
            <div
              key={uid}
              className={stylex.props(styles.row).className}
              data-testid={`demo-row-${i}`}
            >
              <button
                type="button"
                className={stylex.props(styles.play, isPlaying && styles.playOn).className}
                aria-label={
                  isPlaying
                    ? t('demo.pause', { name: phrase.speaker })
                    : t('demo.play', { name: phrase.speaker })
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
                <span
                  className={stylex.props(styles.speaker).className}
                  data-testid={`demo-speaker-${i}`}
                >
                  {phrase.speaker}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
