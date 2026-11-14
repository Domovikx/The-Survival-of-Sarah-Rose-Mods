/**
 * profile.mts — чистая логика выбора профиля (без ФС/процессов) — тестируется
 * юнит-тестами без Windows и без запущенного перевода.
 *
 * Два профиля:
 *   background — владелец за ПК: щадящий (низкий приоритет переводчика,
 *                бэкенд с малым числом слотов);
 *   turbo      — владельца нет ≥ порога: ресурсы отдаются переводу.
 *
 * Гистерезис (защита от дребезга): выход из turbo — МГНОВЕННЫЙ (владелец
 * вернулся → ресурсы возвращаем сразу), вход — только после простоя ≥ порога
 * И не раньше `cooldownMs` после прошлого выхода из turbo. Если turbo требует
 * рестарта бэкенда (~90 с), дребезг «ушёл на 16 минут → вернулся» стоил бы
 * двух рестартов; кулдаун делает такие пары не чаще раза в N минут.
 */
export type Profile = "background" | "turbo";

export interface ProfileState {
  profile: Profile;
  /** Когда профиль последний раз менялся (ms epoch). */
  changedAt: number;
  /** Когда последний раз ВЫХОДИЛИ из turbo (ms epoch) — опора кулдауна. */
  lastTurboExitAt: number | null;
}

export interface DecisionInput {
  /** Простой пользователя, сек. null = детектор не ответил. */
  idleSec: number | null;
  state: ProfileState | null;
  now: number;
  /** Порог «отошёл», сек. */
  idleThresholdSec: number;
  /** Кулдаун входа в turbo после выхода из него, мс. */
  cooldownMs: number;
  /** turbo разрешён конфигурацией (может быть выключен: --turbo off). */
  turboEnabled: boolean;
}

export interface Decision {
  next: Profile;
  changed: boolean;
  reason: string;
  state: ProfileState;
}

export const DEFAULT_PROFILE: Profile = "background";

export function initialState(now: number): ProfileState {
  return { profile: DEFAULT_PROFILE, changedAt: now, lastTurboExitAt: null };
}

export function decideProfile(i: DecisionInput): Decision {
  const prev = i.state ?? initialState(i.now);
  const stay = (reason: string): Decision => ({
    next: prev.profile,
    changed: false,
    reason,
    state: prev,
  });

  // 1. Детектор не ответил — не гадаем, держим текущий профиль.
  if (i.idleSec === null) return stay("простой неизвестен — профиль держим");

  // 2. Ввод был только что → background немедленно (ресурсы владельцу).
  if (i.idleSec < i.idleThresholdSec) {
    if (prev.profile === "background") return stay("владелец за ПК");
    const state: ProfileState = {
      profile: "background",
      changedAt: i.now,
      lastTurboExitAt: i.now,
    };
    return { next: "background", changed: true, reason: "владелец вернулся — turbo выключен", state };
  }

  // 3. Владельца нет ≥ порога: turbo (если разрешён и не кулдаун).
  if (!i.turboEnabled) return stay("владельца нет, но turbo выключен (--turbo off)");
  if (prev.profile === "turbo") return stay("владельца нет — turbo держим");
  if (prev.lastTurboExitAt !== null && i.now - prev.lastTurboExitAt < i.cooldownMs) {
    const leftMin = Math.ceil((i.cooldownMs - (i.now - prev.lastTurboExitAt)) / 60_000);
    return stay(`кулдаун после недавнего turbo (ещё ${leftMin} мин)`);
  }
  return {
    next: "turbo",
    changed: true,
    reason: "владельца нет ≥ порога — turbo",
    state: { profile: "turbo", changedAt: i.now, lastTurboExitAt: prev.lastTurboExitAt },
  };
}

/** Скорость по истории сэмплов: строк/мин за окно (последние `windowMs`). */
export interface Sample {
  t: number;
  translated: number;
  profile?: Profile;
}

export interface Speed {
  perMin: number | null;
  windowMin: number;
  /** Сколько строк добавлено за окно (для отладки и отчётов). */
  delta: number;
}

export function speedOf(samples: Sample[], now: number, windowMs = 10 * 60_000, minSpanMs = 60_000): Speed {
  const win = samples.filter((s) => now - s.t <= windowMs).sort((a, b) => a.t - b.t);
  if (win.length < 2) return { perMin: null, windowMin: 0, delta: 0 };
  const first = win[0];
  const last = win[win.length - 1];
  const spanMs = last.t - first.t;
  const delta = last.translated - first.translated;
  if (spanMs < minSpanMs) return { perMin: null, windowMin: spanMs / 60_000, delta };
  return { perMin: (delta / spanMs) * 60_000, windowMin: spanMs / 60_000, delta };
}

/** ETA (мин) по остатку и скорости; null если скорости нет. */
export function etaMinutes(remaining: number, perMin: number | null): number | null {
  if (!perMin || perMin <= 0) return null;
  return remaining / perMin;
}
