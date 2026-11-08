#!/usr/bin/env bash
# dl_models.sh — докачка GGUF в ~/.lmstudio/models с resume/retry.
# Фолбэк по веб-поиску (HF discuss + LM Studio docs): downloader LM Studio
# падает («aborted») — качаем сами, потом `lms import`/скан папки.
# Запуск: bash tmp/dl_models.sh   (последовательно: сначала GLM, потом 27B)
set -u

dl() {
  local url="$1" dir="$2" name="$3" expect="$4"
  mkdir -p "$HOME/.lmstudio/models/$dir"
  local final="$HOME/.lmstudio/models/$dir/$name"
  local part="$HOME/.lmstudio/models/$dir/downloading_$name.part"
  if [ -f "$final" ] && [ "$(stat -c%s "$final")" = "$expect" ]; then
    echo "УЖЕ ЕСТЬ: $name"; return 0
  fi
  echo "СТАРТ: $name (ожидаем $expect байт, уже есть: $(stat -c%s "$part" 2>/dev/null || echo 0))"
  local i
  for i in $(seq 1 1000); do
    local sz; sz=$(stat -c%s "$part" 2>/dev/null || echo 0)
    if [ "$sz" = "$expect" ]; then break; fi
    # Защита от порчи: .part больше ожидаемого (старый .part от LM Studio
    # downloader'а или гонка) — файл не спасти, начинаем с нуля.
    if [ "$sz" -gt "$expect" ]; then
      echo "ПОРЧА: $sz > $expect — удаляю и качаю заново"
      rm -f "$part"; sleep 1; continue
    fi
    # --speed-limit/--speed-time: мёртвый поток рвём за 60с (<20 КБ/с), луп докачает
    curl -L -C - --connect-timeout 30 --speed-time 60 --speed-limit 20000 \
      --retry 3 --retry-delay 5 --retry-all-errors \
      -o "$part" "$url" >/dev/null 2>&1
    sleep 2
  done
  local sz; sz=$(stat -c%s "$part" 2>/dev/null || echo 0)
  if [ "$sz" = "$expect" ]; then
    mv "$part" "$final"
    echo "ГОТОВО: $final ($sz)"
  else
    echo "НЕ ДОКАЧАЛ: $name size=$sz expect=$expect — нужен повтор"
    return 1
  fi
}

dl "https://huggingface.co/lmstudio-community/GLM-4-9B-0414-GGUF/resolve/main/GLM-4-9B-0414-Q4_K_M.gguf" \
   "lmstudio-community/GLM-4-9B-0414-GGUF" \
   "GLM-4-9B-0414-Q4_K_M.gguf" \
   "6166574208"

dl "https://huggingface.co/unsloth/Qwen3.5-27B-GGUF/resolve/main/Qwen3.5-27B-Q3_K_M.gguf" \
   "unsloth/Qwen3.5-27B-GGUF" \
   "Qwen3.5-27B-Q3_K_M.gguf" \
   "13505116064"

echo "ИТОГ:"
ls -la "$HOME/.lmstudio/models/lmstudio-community/GLM-4-9B-0414-GGUF/" 2>/dev/null | tail -3
ls -la "$HOME/.lmstudio/models/unsloth/Qwen3.5-27B-GGUF/" 2>/dev/null | tail -3
