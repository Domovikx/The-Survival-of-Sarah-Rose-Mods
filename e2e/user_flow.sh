#!/bin/bash
# user_flow.sh — путь ПОЛЬЗОВАТЕЛЯ на чистой Steam-установке (без хелперов репы).
# Каждый шаг = то же, что делает человек: скачал из Releases, распаковал
# архиватором, двойным кликом запустил install.cmd, запустил игру.
#
# Требование: игра чистая (нет mods/ и environment.txt) — иначе скрипт
# останавливается: он проверяет именно установку с нуля. После прогона в игре
# останется установленный мод (это ожидаемо); для повторного прогона удали
# mods/ + environment.txt (+ install.*, README.txt, log/errors/traceback).
#
# Запуск: bash e2e/user_flow.sh
set -u
cd "$(dirname "$0")/.." || exit 1
G="/c/Program Files (x86)/Steam/steamapps/common/The Survival of Sarah Rose"
GW=$(cygpath -w "$G")
W="tmp/user_flow"
LOGDIR="$PWD/$W"
REL="v1.0.0"
FAIL=0
# 7z — тот же архиватор, что у пользователя (Win11 умеет .7z из коробки; Win10 = 7-Zip).
Z="${TSSR_7Z:-/c/Program Files/7-Zip/7z.exe}"
[ -x "$Z" ] || { echo "нет 7z ($Z): поставь 7-Zip или задай TSSR_7Z"; exit 1; }
ok()   { echo "  ✓ $1"; }
bad()  { echo "  ✗ $1"; FAIL=1; }

echo "== 0. ЧИСТАЯ ИГРА (Steam переустановил заново)"
[ -d "$G/game" ] || { bad "нет game/ — игра не установлена"; exit 1; }
[ -e "$G/mods" ] && { bad "в игре уже есть mods/ — не чисто"; exit 1; }
[ -e "$G/environment.txt" ] && { bad "environment.txt уже есть — не чисто"; exit 1; }
ok "игра чистая: $(du -sm "$G" | cut -f1) MB, mods/ и environment.txt отсутствуют"

echo "== 1. СКАЧИВАНИЕ ИЗ РЕЛИЗА (как пользователь: main + voice-ru)"
rm -rf "$W" && mkdir -p "$W/dl" "$W/main" "$W/voice"
gh release download "$REL" --pattern "TSSR-AI-Voice-Pack-main.7z" -D "$W/dl" >/dev/null 2>&1 \
  && gh release download "$REL" --pattern "TSSR-AI-Voice-Pack-voice-ru.7z" -D "$W/dl" >/dev/null 2>&1
ls -la "$W/dl" | tail -3
[ -f "$W/dl/TSSR-AI-Voice-Pack-main.7z" ] && ok "main.7z скачан" || bad "main.7z не скачался"
[ -f "$W/dl/TSSR-AI-Voice-Pack-voice-ru.7z" ] && ok "voice-ru.7z скачан" || bad "voice-ru.7z не скачался"

echo "== 2. СВЕРКА КОНТРОЛЬНЫХ СУММ (с тем, что видит пользователь в описании релиза)"
BODY=$(gh release view "$REL" --json body --jq .body)
SUM=$(sha256sum "$W/dl/TSSR-AI-Voice-Pack-main.7z" | cut -d' ' -f1)
echo "$BODY" | grep -q "$SUM" && ok "main.7z: sha256 совпал с описанием релиза" || bad "main.7z: sha256 НЕ совпал"
SUM=$(sha256sum "$W/dl/TSSR-AI-Voice-Pack-voice-ru.7z" | cut -d' ' -f1)
echo "$BODY" | grep -q "$SUM" && ok "voice-ru.7z: sha256 совпал" || bad "voice-ru.7z: sha256 НЕ совпал"

echo "== 3. РАСПАКОВКА main.7z И ДВОЙНОЙ КЛИК install.cmd"
"$Z" x -bd -y -o"$(cygpath -w "$W/main")" "$W/dl/TSSR-AI-Voice-Pack-main.7z" > /dev/null
ls "$W/main" | head -5
( cd "$W/main" && cmd //c install.cmd < /dev/null > "$LOGDIR/install_main.log" 2>&1 )
E=$?
[ "$E" = "0" ] && ok "install.cmd (main): exit=0" || bad "install.cmd (main): exit=$E"
sed -n '1,6p' "$W/install_main.log" | sed 's/^/      /'

echo "== 4. ЧТО ПОЯВИЛОСЬ В ИГРЕ"
for f in environment.txt mods/tssr-ai-voice-pack/voice_config.rpy mods/tssr-ai-voice-pack/zzz_ui.rpy \
         mods/tssr-ai-voice-pack/fonts/Literata-Regular.ttf \
         mods/tssr-ai-voice-pack/fonts/NotoSansCJKsc-Regular.otf \
         mods/tssr-ai-voice-pack/catalog/voice_list.json mods/tssr-ai-voice-pack/tl; do
  [ -e "$G/$f" ] && ok "есть ${f#mods/tssr-ai-voice-pack/}" || bad "НЕТ $f"
done
[ -e "$G/mods/tssr-ai-voice-pack/ai_voice" ] && bad "main залез в ai_voice" || ok "аудио в ядре нет (как заявлено)"

echo "== 5. РАСПАКОВКА voice-ru.7z И ДВОЙНОЙ КЛИК ЕГО install.cmd"
"$Z" x -bd -y -o"$(cygpath -w "$W/voice")" "$W/dl/TSSR-AI-Voice-Pack-voice-ru.7z" > /dev/null
ls "$W/voice" | head -5
( cd "$W/voice" && cmd //c install.cmd < /dev/null > "$LOGDIR/install_voice.log" 2>&1 )
E=$?
[ "$E" = "0" ] && ok "install.cmd (voice-ru): exit=0" || bad "install.cmd (voice-ru): exit=$E"
sed -n '1,6p' "$W/install_voice.log" | sed 's/^/      /'
N=$(find "$G/mods/tssr-ai-voice-pack/ai_voice/ru" -name '*.opus' 2>/dev/null | wc -l)
[ "$N" -gt 1000 ] && ok "голоса ru на месте: $N опусов" || bad "голосов мало: $N"
[ -d "$G/mods/tssr-ai-voice-pack/ai_voice/en" ] && bad "пакет ru поставил ещё и en" || ok "пакет ru поставил только свой язык"

echo "== 6. ПОВТОРНЫЙ КЛИК install.cmd (обновление поверх) — не должно ломать"
( cd "$W/main" && cmd //c install.cmd < /dev/null > "$LOGDIR/install_main2.log" 2>&1 )
E1=$?
( cd "$W/voice" && cmd //c install.cmd < /dev/null > "$LOGDIR/install_voice2.log" 2>&1 )
E2=$?
N2=$(find "$G/mods/tssr-ai-voice-pack/ai_voice/ru" -name '*.opus' 2>/dev/null | wc -l)
[ "$E1" = "0" ] && [ "$E2" = "0" ] && [ "$N2" = "$N" ] \
  && ok "повторный прогон: exit=$E1/$E2, голоса целы ($N2)" \
  || bad "повторный прогон: exit=$E1/$E2, было $N стало $N2"

echo "== 7. ЗАПУСК ИГРЫ КАК ПОЛЬЗОВАТЕЛЬ (двойной клик по exe)"
rm -f "$G/log.txt" "$G/errors.txt" "$G/mods/tssr-ai-voice-pack/voice_debug.log"
start=$(date +%s)
powershell -NoProfile -Command "Start-Process -FilePath '$GW\\TheSurvivalofSarahRose.exe' -WorkingDirectory '$GW'"
sleep 45
powershell -NoProfile -Command "Get-Process TheSurvivalofSarahRose -ErrorAction SilentlyContinue | Stop-Process -Force" 2>/dev/null
sleep 3
DUR=$(( $(date +%s) - start ))
[ -s "$G/log.txt" ] && ok "игра стартовала, log.txt пишется (ждали ${DUR}с)" || bad "игра не стартовала"
grep -qi "traceback\|script error\|exception" "$G/log.txt" 2>/dev/null && bad "в log.txt ошибки" || ok "log.txt без ошибок"
[ -s "$G/errors.txt" ] && { bad "errors.txt непустой"; head -3 "$G/errors.txt"; } || ok "errors.txt пустой"
if [ -f "$G/mods/tssr-ai-voice-pack/voice_debug.log" ]; then
  grep -q "\[init\]" "$G/mods/tssr-ai-voice-pack/voice_debug.log" \
    && ok "мод поднялся: [init] записан" || bad "моду не удалось инициализироваться"
  grep -q "catalog_loadable=True" "$G/mods/tssr-ai-voice-pack/voice_debug.log" \
    && ok "каталог и searchpath работают (catalog_loadable=True)" || bad "каталог не загрузился"
  grep -q "label_arc=[1-9]" "$G/mods/tssr-ai-voice-pack/voice_debug.log" \
    && ok "карта label→арка загружена" || bad "карта арок пустая"
else
  bad "voice_debug.log нет (мод не поднялся?)"
fi

echo
[ "$FAIL" = "0" ] && echo "ИТОГ: ПУТЬ ПОЛЬЗОВАТЕЛЯ ЗЕЛЁНЫЙ ✓" || echo "ИТОГ: ЕСТЬ ДЕФЕКТЫ ✗"
exit $FAIL
