import * as stylex from '@stylexjs/stylex'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Section } from '@/shared/ui'

const SHOTS_BASE = `${import.meta.env.BASE_URL}shots/`

/**
 * Скриншоты: сетка превью + лайтбокс (канон для VN-лендингов).
 *
 * BP-источники: WAI-ARIA APG Dialog(Modal) — фокус внутрь при открытии,
 * возврат фокуса на вызвавший элемент, Esc, фокус-ловушка Tab, видимая
 * кнопка закрытия; PhotoSwipe/GLightbox — ‹ › у самой картинки (на мобиле
 * накладываются на неё), счётчик рядом с подписью, свайп, превью-препресс.
 *
 * Клик-баг v1: onClick оверлея ловил всплытие кликов стрелок → модалка
 * закрывалась вместо листания. Стрелки теперь — ВНУТРИ viewer, а закрытие
 * по фону работает только при прямом клике (e.target === currentTarget).
 */
const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 12,
  },
  figure: {
    margin: 0,
  },
  // Кликабельная миниатюра: hover — affordance (лёгкий зум + яркость).
  imgButton: {
    display: 'block',
    width: '100%',
    padding: 0,
    margin: 0,
    // ВАЖНО: StyleX молча выбрасывает shorthand `background:`/`border:` —
    // только backgroundColor/backgroundImage и borderWidth/Style/Color.
    // Явно гасим и UA-обводку кнопки.
    backgroundColor: 'transparent',
    borderWidth: 0,
    cursor: 'pointer',
    borderRadius: 10,
    ':focus-visible': { outline: '2px solid var(--link)', outlineOffset: 2 },
  },
  img: {
    width: '100%',
    height: 'auto',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    display: 'block',
    transition: 'transform .18s ease, filter .18s ease',
    ':hover': {
      transform: 'scale(1.02)',
      filter: 'brightness(1.08)',
    },
  },
  caption: {
    fontSize: 13,
    color: 'var(--muted)',
    marginTop: 6,
  },
  // ——— Лайтбокс ———
  overlay: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    // Тон в гамме --bg тёмной темы (#141824): слой лайтбокса всегда тёмный
    // (как Steam-кнопка — фиксированные цвета независимо от темы страницы).
    backgroundColor: 'rgba(16, 20, 32, .9)',
    // Размытие фона — мягче, чем сплошная чернота («не страшно»).
    WebkitBackdropFilter: 'blur(10px)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overscrollBehavior: 'contain',
    touchAction: 'pan-y',
    userSelect: 'none',
    // Фокус-контейнер (APG: tabindex=-1, фокус при открытии).
    ':focus': { outline: 'none' },
  },
  overlayHidden: {
    opacity: 0,
    transition: 'opacity .18s ease',
  },
  overlayShown: {
    opacity: 1,
    transition: 'opacity .18s ease',
  },
  viewer: {
    // Относительный контейнер — стрелки ‹ › живут у самой картинки.
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: 'min(96vw, calc(76vh * 1.78))', // 16:9 ограничение по высоте
    ':focus': { outline: 'none' },
  },
  overlayImg: {
    maxWidth: '100%',
    maxHeight: '72vh',
    width: 'auto',
    height: 'auto',
    objectFit: 'contain',
    borderRadius: 10,
    // Без обводки вообще — фото «плавает» на размытом фоне (канон PhotoSwipe);
    // отделение даёт только тень.
    display: 'block',
    boxShadow: '0 20px 56px rgba(0, 0, 0, .55)',
    '@media (max-width: 759px)': { maxHeight: '64vh' },
  },
  // Счётчик + подпись — одна строкой ПОД картинкой (как в PhotoSwipe),
  // без «плавающих» угловых элементов.
  metaRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 10,
    fontSize: 14,
    maxWidth: '100%',
  },
  counter: {
    color: '#9aa4bc', // --muted тёмной темы (слой всегда тёмный)
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  overlayCaption: {
    color: '#9aa4bc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: 999,
    borderWidth: 0,
    // Тёмная пилюля как в Segmented (panel-2), только без обводки: хром
    // лайтбокса живёт на тёмном слое — светлые --border/--muted световой
    // темы дали бы «белое кольцо» (кринж v2). Цвета — из тёмной темы.
    backgroundColor: 'rgba(35, 43, 63, .82)',
    WebkitBackdropFilter: 'blur(6px)',
    backdropFilter: 'blur(6px)',
    color: '#e8ebf2',
    fontSize: 26,
    lineHeight: '42px',
    cursor: 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease, box-shadow 150ms ease',
    ':hover': {
      backgroundColor: 'var(--accent)',
      color: '#fff',
      boxShadow: '0 4px 16px color-mix(in srgb, var(--accent) 45%, transparent)',
    },
    ':focus-visible': { outline: '2px solid #9aa6f5', outlineOffset: 2 },
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 52,
    height: 52,
    padding: 0,
    borderRadius: 999,
    borderWidth: 0,
    // Как close: тёмная пилюля без белых обводок, hover — акцент сайта.
    backgroundColor: 'rgba(35, 43, 63, .82)',
    WebkitBackdropFilter: 'blur(6px)',
    backdropFilter: 'blur(6px)',
    color: '#e8ebf2',
    fontSize: 32,
    lineHeight: '48px',
    cursor: 'pointer',
    transition: 'background-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
    ':hover': {
      backgroundColor: 'var(--accent)',
      color: '#fff',
      boxShadow: '0 4px 16px color-mix(in srgb, var(--accent) 45%, transparent)',
      transform: 'translateY(-50%) scale(1.06)',
    },
    ':focus-visible': { outline: '2px solid #9aa6f5', outlineOffset: 2 },
  },
  arrowLeft: {
    left: -68,
    // На узких экранах стрелки накладываются на края картинки.
    '@media (max-width: 759px)': { left: 8 },
  },
  arrowRight: {
    right: -68,
    '@media (max-width: 759px)': { right: 8 },
  },
})

const SHOTS = [
  // Файлы: {stem}_{russian|english}.jpg — суффикс = версия игры под язык
  // лендинга (снимаются отдельно: tools/shots_capture.ps1 -> shots_for_site.py).
  // Страница патча ПЕРВОЙ — главный продукт (требование владельца 2026-10-16),
  // затем бренд-меню и сцены с видимым диалоговым окном (маркетинг: текст =
  // доказательство перевода, эмоции = цепляют).
  { stem: 'language_settings', capKey: 'shots.cap3', altKey: 'shots.cap3' },
  { stem: 'main_menu', capKey: 'shots.cap1', altKey: 'shots.cap1' },
  { stem: 'dialogue_1', capKey: 'shots.cap6', altKey: 'shots.cap6' },
  { stem: 'dialogue_2', capKey: 'shots.cap4', altKey: 'shots.cap4' },
  { stem: 'dialogue_3', capKey: 'shots.cap2', altKey: 'shots.cap2' },
  { stem: 'dialogue_4', capKey: 'shots.cap5', altKey: 'shots.cap5' },
] as const

const shotSrc = (stem: string, lang: string) => `${SHOTS_BASE}${stem}_${lang}.jpg`

export const Screenshots = () => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('ru') ? 'russian' : 'english'
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [shown, setShown] = useState(false) // fade-in после монтирования

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lastIdx = useRef(0) // индекс вызвавшего тюмба — возврат фокуса (APG)
  const touchX = useRef<number | null>(null)
  const swipeGuard = useRef(false) // глушит клик-после-свайпа

  const count = SHOTS.length

  const close = useCallback(() => {
    setOpenIndex(null)
    setShown(false)
    const idx = lastIdx.current
    // APG: при закрытии фокус возвращается на вызвавший элемент.
    requestAnimationFrame(() => thumbRefs.current[idx]?.focus())
  }, [])
  const next = useCallback(
    () => setOpenIndex((i) => (i === null ? i : (i + 1) % count)),
    [count],
  )
  const prev = useCallback(
    () => setOpenIndex((i) => (i === null ? i : (i - 1 + count) % count)),
    [count],
  )

  const open = (i: number) => {
    lastIdx.current = i
    setOpenIndex(i)
  }

  // Открыт лайтбокс: клавиатура (Esc/стрелки/Tab-ловушка), блок прокрутки,
  // фокус внутрь диалога, fade-in, препресс соседних кадров.
  useEffect(() => {
    if (openIndex === null) {
      return
    }

    const raf = requestAnimationFrame(() => setShown(true))

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      } else if (e.key === 'ArrowRight') {
        next()
      } else if (e.key === 'ArrowLeft') {
        prev()
      } else if (e.key === 'Tab') {
        // Фокус-ловушка (APG): Tab не выходит за пределы диалога.
        const focusables = overlayRef.current?.querySelectorAll('button')
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === overlayRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    overlayRef.current?.focus({ preventScroll: true })

    const preload = (i: number) => {
      const im = new Image()
      im.src = shotSrc(SHOTS[i].stem, lang)
    }
    preload((openIndex + 1) % count)
    preload((openIndex - 1 + count) % count)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
    }
  }, [openIndex, close, next, prev, lang, count])

  // Свайп влево/вправо (50px порог) + защита от «клика после свайпа».
  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    touchX.current = e.changedTouches[0].clientX
  }
  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    touchX.current = null
    if (dx > 50) {
      prev()
      swallowNextClick()
    } else if (dx < -50) {
      next()
      swallowNextClick()
    }
  }
  const swallowNextClick = () => {
    swipeGuard.current = true
    setTimeout(() => {
      swipeGuard.current = false
    }, 350)
  }
  // Закрытие — ТОЛЬКО прямой клик по фону (не по дочерним элементам).
  const onOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (swipeGuard.current) return
    if (e.target === e.currentTarget) close()
  }

  const shot = openIndex !== null ? SHOTS[openIndex] : null

  return (
    <Section title={t('shots.title')} testId="screenshots">
      <div className={stylex.props(styles.grid).className} data-testid="screenshots-grid">
        {SHOTS.map((s, i) => (
          <figure
            key={s.stem}
            className={stylex.props(styles.figure).className}
            data-testid={`screenshot-${i}`}
          >
            <button
              type="button"
              ref={(el) => {
                thumbRefs.current[i] = el
              }}
              className={stylex.props(styles.imgButton).className}
              onClick={() => open(i)}
              aria-label={`${t(s.altKey)} — ${t('shots.open')}`}
              data-testid={`screenshot-img-${i}`}
            >
              <img
                className={stylex.props(styles.img).className}
                src={shotSrc(s.stem, lang)}
                alt={t(s.altKey)}
                loading="lazy"
              />
            </button>
            <figcaption
              className={stylex.props(styles.caption).className}
              data-testid={`screenshot-caption-${i}`}
            >
              {t(s.capKey)}
            </figcaption>
          </figure>
        ))}
      </div>

      {openIndex !== null && shot !== null && (
        <div
          ref={overlayRef}
          tabIndex={-1}
          className={[
            stylex.props(styles.overlay).className,
            stylex.props(shown ? styles.overlayShown : styles.overlayHidden).className,
          ]
            .filter(Boolean)
            .join(' ')}
          role="dialog"
          aria-modal="true"
          aria-label={t('shots.title')}
          onClick={onOverlayClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          data-testid="lightbox"
        >
          <button
            type="button"
            className={stylex.props(styles.close).className}
            onClick={close}
            aria-label={t('shots.close')}
            data-testid="lightbox-close"
          >
            ×
          </button>

          <div className={stylex.props(styles.viewer).className}>
            <button
              type="button"
              className={[stylex.props(styles.arrow).className, stylex.props(styles.arrowLeft).className]
                .filter(Boolean)
                .join(' ')}
              onClick={(e) => {
                e.stopPropagation()
                prev()
              }}
              aria-label={t('shots.prev')}
              data-testid="lightbox-prev"
            >
              ‹
            </button>

            <img
              className={stylex.props(styles.overlayImg).className}
              src={shotSrc(shot.stem, lang)}
              alt={t(shot.altKey)}
              draggable={false}
              data-testid="lightbox-img"
            />

            <button
              type="button"
              className={[stylex.props(styles.arrow).className, stylex.props(styles.arrowRight).className]
                .filter(Boolean)
                .join(' ')}
              onClick={(e) => {
                e.stopPropagation()
                next()
              }}
              aria-label={t('shots.next')}
              data-testid="lightbox-next"
            >
              ›
            </button>

            <div className={stylex.props(styles.metaRow).className}>
              <span className={stylex.props(styles.counter).className} data-testid="lightbox-counter">
                {openIndex + 1} / {count}
              </span>
              <span className={stylex.props(styles.overlayCaption).className}>{t(shot.capKey)}</span>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}
