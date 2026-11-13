#!/bin/bash
# user_e2e.sh — пользовательский сценарий на ЧИСТОЙ steam-установке.
# Архитектура (владелец 2026-11-12): main-установщик ставит ядро, затем
# ОТДЕЛЬНО аудио-установщик каждого пакета — каждый атомарно. Предохранитель:
# аудио-установщик без ядра просит поставить main.
# Шаги:
#   1. чистота (нет mods/); 2. предохранитель (голоса без main -> отказ);
#   3. main-установщик (ядро: тексты+шрифты+меню); 4. voice-установщик ru;
#   5. запуск игры: резолвы голоса существуют; 6. повторный прогон обоих
#   установщиков (атомарное обновление) — ничего не ломается.
# Запуск: bash tmp/user_e2e.sh
set -u
cd "$(dirname "$0")/.." || exit 1
G="/c/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose"
GW=$(cygpath -w "$G")
DIST="dist"
WORK="tmp/user_e2e_work"
FAIL=0
ok()   { echo "  ✓ $1"; }
bad()  { echo "  ✗ $1"; FAIL=1; }

echo "== 1. ЧИСТАЯ ЛИ УСТАНОВКА"
[ -d "$G/game" ] || { bad "нет папки игры — Steam не установил"; exit 1; }
# Хвосты прошлых прогонов: харнесс мог оставить живой процесс игры, а он
# держит локи на шрифтах мода (поймано 2026-11-12).
taskkill //IM TheSurvivalofSarahRose.exe //F >/dev/null 2>&1
if [ -e "$G/mods" ] || [ -e "$G/environment.txt" ]; then
  echo "  … убираю остатки прошлых тестов (ожидаемо)"
  rm -rf "$G/mods" "$G/environment.txt" "$G/INSTALL.txt" "$G/install.cmd" "$G/install.ps1"
fi
ok "игра чистая: $(du -sm "$G" | cut -f1) MB, без mods/"

echo "== 2. ПРЕДОХРАНИТЕЛЬ: голоса без main -> отказ (exit 3)"
rm -rf "$WORK" && mkdir -p "$WORK/voice"
unzip -oq "$DIST/TSSR-AI-Voice-Pack-voice-ru.zip" -d "$WORK/voice"
powershell -NoProfile -ExecutionPolicy Bypass -File "$WORK/voice/install.ps1" -GameDir "$GW" >/dev/null 2>&1
E=$?
[ "$E" = "3" ] && ok "установщик пакета отказал без ядра (exit=3)" || bad "предохранитель не сработал: exit=$E"

echo "== 3. MAIN-УСТАНОВЩИК (ядро)"
mkdir -p "$WORK/main"
unzip -oq "$DIST/TSSR-AI-Voice-Pack-main.zip" -d "$WORK/main"
powershell -NoProfile -ExecutionPolicy Bypass -File "$WORK/main/install.ps1" -GameDir "$GW" >/dev/null 2>&1
[ "$?" = "0" ] && ok "ядро установлено" || bad "main-установщик упал"
for f in environment.txt mods/tssr-ai-voice-pack/voice_config.rpy mods/tssr-ai-voice-pack/zzz_ui.rpy \
         mods/tssr-ai-voice-pack/fonts/Literata-Regular.ttf \
         mods/tssr-ai-voice-pack/fonts/NotoSansCJKsc-Regular.otf \
         mods/tssr-ai-voice-pack/catalog/voice_list.json; do
  [ -e "$G/$f" ] && ok "есть: ${f##*/}" || bad "нет: $f"
done
[ -e "$G/mods/tssr-ai-voice-pack/ai_voice" ] && bad "main залез в ai_voice (не должен)" || ok "main не тронул ai_voice"

echo "== 4. VOICE-УСТАНОВЩИК ru (атомарно, поверх ядра)"
powershell -NoProfile -ExecutionPolicy Bypass -File "$WORK/voice/install.ps1" -GameDir "$GW" >/dev/null 2>&1
[ "$?" = "0" ] && ok "пакет ru установлен" || bad "voice-установщик упал"
N1=$(find "$G/mods/tssr-ai-voice-pack/ai_voice/ru" -name '*.opus' 2>/dev/null | wc -l)
[ "$N1" -gt 1000 ] && ok "голоса ru: $N1 опусов" || bad "голосов мало: $N1"

echo "== 5. ЗАПУСК ИГРЫ (реплики пролога с голосом)"
rm -f "$G/mods/tssr-ai-voice-pack/voice_debug.log" "$G/log.txt" "$G/errors.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File \
  "patches/ai-voice-pack/tools/generate/scripts/shots_capture.ps1" \
  -GameDir "$G" -Mode game -Lang ru >/dev/null 2>&1
VD="$G/mods/tssr-ai-voice-pack/voice_debug.log"
grep -q "\[init\]" "$VD" 2>/dev/null && ok "voice_debug: [init] мод поднят" || bad "нет [init]"
RESOLVES=$(grep -c "path=ai_voice/ru/" "$VD" 2>/dev/null || echo 0)
[ "$RESOLVES" -gt 5 ] && ok "резолвы голоса: $RESOLVES строк" || bad "резолвов мало: $RESOLVES"
MISSING=0
while IFS= read -r p; do
  [ -f "$G/mods/tssr-ai-voice-pack/$p" ] || MISSING=$((MISSING+1))
done < <(grep -oP "path=\Kai_voice/.+?(?= arcs=|$)" "$VD" 2>/dev/null | sort -u | head -40)
[ "$MISSING" -eq 0 ] && ok "все резолвленные файлы существуют" || bad "файлов нет: $MISSING"
grep -qi "traceback\|script error" "$G/log.txt" 2>/dev/null && bad "в log.txt traceback" || ok "log.txt чистый"
[ -s "$G/errors.txt" ] && bad "errors.txt непустой" || ok "errors.txt пустой"

echo "== 6. ПОВТОРНЫЙ ПРОГОН ОБОИХ (атомарное обновление)"
powershell -NoProfile -ExecutionPolicy Bypass -File "$WORK/main/install.ps1" -GameDir "$GW" >/dev/null 2>&1
E1=$?
powershell -NoProfile -ExecutionPolicy Bypass -File "$WORK/voice/install.ps1" -GameDir "$GW" >/dev/null 2>&1
E2=$?
N2=$(find "$G/mods/tssr-ai-voice-pack/ai_voice/ru" -name '*.opus' 2>/dev/null | wc -l)
[ "$E1" = "0" ] && [ "$E2" = "0" ] && [ "$N2" = "$N1" ] \
  && ok "повторный прогон: exit=$E1/$E2, голоса целы ($N2)" \
  || bad "повторный прогон: exit=$E1/$E2, было $N1 стало $N2"

echo
[ "$FAIL" = "0" ] && echo "ИТОГ: ПОЛЬЗОВАТЕЛЬСКИЙ СЦЕНАРИЙ ЗЕЛЁНЫЙ ✓" || echo "ИТОГ: ЕСТЬ ДЕФЕКТЫ ✗"
exit $FAIL
