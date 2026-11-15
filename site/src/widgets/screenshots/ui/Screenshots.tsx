import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import { useTranslation } from "react-i18next";

import { cx, Section } from "@/shared/ui";

import { styles } from "./Screenshots.styles";

const SHOTS_BASE = `${import.meta.env.BASE_URL}shots/`;

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

// Файлы: {stem}_{russian|english}.jpg. lang задан — кадр всегда в этом языке
// (показываем перевод в обе стороны); lang нет — версия под язык лендинга.
// 9 кадров: 5 «под язык» + 4 фиксированных (EN/RU вперемешку = доказательство
// перевода). Дубли (dialogue_2/3 в EN и RU совпадают байт-в-байт) не дублируем.
// Кадры, снятые с игры и лежащие на Nexus (9 штук после чистки, разные языки интерфейса).
// Файлы: site/public/shots/nexus_NN.jpg. Порядок = порядок галереи.
const SHOTS = [
  "nexus_01",
  "nexus_02",
  "nexus_03",
  "nexus_05",
  "nexus_06",
  "nexus_07",
  "nexus_08",
  "nexus_09",
  "nexus_10",
] as const;

const shotSrc = (file: string) => `${SHOTS_BASE}${file}.jpg`;

export const Screenshots = () => {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [shown, setShown] = useState(false); // fade-in после монтирования

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastIdx = useRef(0); // индекс вызвавшего тюмба — возврат фокуса (APG)
  const touchX = useRef<number | null>(null);
  const swipeGuard = useRef(false); // глушит клик-после-свайпа

  const count = SHOTS.length;

  const close = useCallback(() => {
    setOpenIndex(null);
    setShown(false);
    const idx = lastIdx.current;
    // APG: при закрытии фокус возвращается на вызвавший элемент.
    requestAnimationFrame(() => thumbRefs.current[idx]?.focus());
  }, []);
  const next = useCallback(() => setOpenIndex((i) => (i === null ? i : (i + 1) % count)), [count]);
  const prev = useCallback(() => setOpenIndex((i) => (i === null ? i : (i - 1 + count) % count)), [count]);

  const open = (i: number) => {
    lastIdx.current = i;
    setOpenIndex(i);
  };

  // Открыт лайтбокс: клавиатура (Esc/стрелки/Tab-ловушка), блок прокрутки,
  // фокус внутрь диалога, fade-in, препресс соседних кадров.
  useEffect(() => {
    if (openIndex === null) {
      return;
    }

    const raf = requestAnimationFrame(() => setShown(true));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      } else if (e.key === "Tab") {
        // Фокус-ловушка (APG): Tab не выходит за пределы диалога.
        const focusables = overlayRef.current?.querySelectorAll("button");
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === overlayRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus({ preventScroll: true });

    const preload = (i: number) => {
      const im = new Image();
      im.src = shotSrc(SHOTS[i]);
    };
    preload((openIndex + 1) % count);
    preload((openIndex - 1 + count) % count);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
    };
  }, [openIndex, close, next, prev, count]);

  // Свайп влево/вправо (50px порог) + защита от «клика после свайпа».
  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    touchX.current = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx > 50) {
      prev();
      swallowNextClick();
    } else if (dx < -50) {
      next();
      swallowNextClick();
    }
  };
  const swallowNextClick = () => {
    swipeGuard.current = true;
    setTimeout(() => {
      swipeGuard.current = false;
    }, 350);
  };
  // Закрытие — ТОЛЬКО прямой клик по фону (не по дочерним элементам).
  const onOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (swipeGuard.current) return;
    if (e.target === e.currentTarget) close();
  };

  const shot = openIndex !== null ? SHOTS[openIndex] : null;

  return (
    <Section title={t("Screenshots")} testId="screenshots">
      <div className={cx(styles.grid)} data-testid="screenshots-grid">
        {SHOTS.map((s, i) => (
          <figure key={s} className={cx(styles.figure)} data-testid={`screenshot-${i}`}>
            <button
              type="button"
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              className={cx(styles.imgButton)}
              onClick={() => open(i)}
              aria-label={`${t("Screenshot from the game")} — ${t("open full size")}`}
              data-testid={`screenshot-img-${i}`}
            >
              <img className={cx(styles.img)} src={shotSrc(s)} alt={t("Screenshot from the game")} loading="lazy" />
            </button>
            <figcaption className={cx(styles.caption)} data-testid={`screenshot-caption-${i}`}>
              {t("Screenshot from the game")}
            </figcaption>
          </figure>
        ))}
      </div>

      {openIndex !== null && shot !== null && (
        <div
          ref={overlayRef}
          tabIndex={-1}
          className={[cx(styles.overlay), cx(shown ? styles.overlayShown : styles.overlayHidden)]
            .filter(Boolean)
            .join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label={t("Screenshots")}
          onClick={onOverlayClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          data-testid="lightbox"
        >
          <button
            type="button"
            className={cx(styles.close)}
            onClick={close}
            aria-label={t("Close")}
            data-testid="lightbox-close"
          >
            ×
          </button>

          <div className={cx(styles.viewer)}>
            <button
              type="button"
              className={[cx(styles.arrow), cx(styles.arrowLeft)].filter(Boolean).join(" ")}
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label={t("Previous screenshot")}
              data-testid="lightbox-prev"
            >
              ‹
            </button>

            <img
              className={cx(styles.overlayImg)}
              src={shotSrc(shot)}
              alt={t("Screenshot from the game")}
              draggable={false}
              data-testid="lightbox-img"
            />

            <button
              type="button"
              className={[cx(styles.arrow), cx(styles.arrowRight)].filter(Boolean).join(" ")}
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label={t("Next screenshot")}
              data-testid="lightbox-next"
            >
              ›
            </button>

            <div className={cx(styles.metaRow)}>
              <span className={cx(styles.counter)} data-testid="lightbox-counter">
                {openIndex + 1} / {count}
              </span>
              <span className={cx(styles.overlayCaption)}>{t("Screenshot from the game")}</span>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
};
