# Озвучка EN: пауза на несколько дней → как продолжить

**Статус:** PAUSED (2026-11-22, владелец отдал ПК другому агенту; возобновление —
по его команде).
**Прогресс на момент паузы:** **9 274 / 68 357** реплик EN (13,6 %), закрыто
3/19 арок; корпус `patches/ai-voice-pack/audio/en/`, имена строго по контракту
`{en12}-{state6} {variant}.opus`.

## Что остановлено (и почему не запустится само)

- `voice_batch` (инференс) — убит, VRAM освобождена;
- `voice_adaptive` (сторож простоев) — остановлен, в логе «останавливаюсь»;
- `voice_autocommit` (порции коммитов) — остановлен.

Автозапуска нет: нет ни Windows-задачи, ни демона. `vox-start` из пульта никто
не вызывает.

## Как продолжить (одна команда)

```bash
npm run voice:resume          # идемпотентно: сторож + автокоммит (если уже идут — не дублирует)
npm run voice:resume:stop     # остановить оба
```

```bash
# полный режим: 1 воркер пока владелец за ПК, 2 — если отошёл на 15 мин
# (то же самое, что npm run voice:resume)
node .opencode/skills/tssr-voice-status/voice_adaptive.mts \
  --lang en --idle 900 --poll 60 --full 2 --max-temp 82 --max-vram 99

# стартовать немедленно (не ждать простоя), если ПК свободен
node .opencode/skills/tssr-voice-status/voice_adaptive.mts --lang en --idle 0 --full 2

# коммиты порциями раз в 30 минут с пушем
node .opencode/skills/tssr-voice-status/voice_autocommit.mts --every 30 --push
```

Проверка: `node patches/ai-voice-pack/tools/generate/scripts/voice_ctl.mts status`
(должно быть `EN: RUNNING`), `tail -f patches/ai-voice-pack/tools/generate/output/voice/batch.log`.

**Перед стартом:** `nvidia-smi` — VRAM свободна (>8 ГБ для одного воркера);
LM Studio/Strata не подняты (иначе 2 воркера не влезут).

**После сессии:** `npm run stats:update` (снимок чисел), `git push`.

## Что дальше по плану (когда вернёмся)

1. **Rust-индекс, этап 2:** полный каталог (arc/category/who/emotion/текст) →
   `voice_status` с 7,9 до ~4 с (−47 %); этап 1 (счётчики) уже в `78dfeba75`.
2. **Prompt cache** (`generate_with_prompt_cache`) — оценка +20–30 % без VRAM,
   нужен тест на 10 репликах (эмоциональный префикс может конфликтовать).
3. **3 воркера — нельзя:** 15,8 / 16,3 ГБ, GPU 99 %, темп падает до 2,1 репл/мин.
   Потолок — 2 воркера, ~5 репл/мин с health-guard.

## Факты для быстрого старта

- скорость: ~3,4–4,5 репл/мин на одном воркере, ~5–8 на двух;
- ETA полного EN при 2 воркерах ночью: ~7–9 суток;
- вахта: `max-temp 82 °C`, `max-vram 99 %` (96 % — норма двух воркеров, порог 96
  раньше вызывал мигание), зависание 15 мин без файлов → перезапуск.
