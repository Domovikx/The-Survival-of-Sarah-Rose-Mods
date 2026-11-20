import { useEffect, useState } from "react";

/**
 * Края прокрутки документа: `top` — страница прокручена (контент ушёл под
 * шапку), `bottom` — до конца ещё есть запас (контент уходит под панель
 * действий). Нужны, чтобы разделительные линии появлялись ТОЛЬКО когда они
 * что-то разделяют: в начале страницы линия под шапкой — просто «шов».
 */
export const useScrollEdges = (): { top: boolean; bottom: boolean } => {
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const measure = (): void => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      // Обновляем состояние только при СМЕНЕ булевых: иначе каждый scroll-
      // тик перерисовывал бы шапку и панель действий впустую.
      const next = { top: y > 2, bottom: max - y > 2 };
      setEdges((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next));
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return edges;
};
