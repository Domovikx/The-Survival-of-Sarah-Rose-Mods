#!/bin/bash
# Чанковый коммит аудио-корпуса: партиями по ~1000 файлов (владелец 2026-11-11:
# «иначе потом может не влезть»). Запуск: bash tmp/audio_chunk_commit.sh [партий]
set -u
cd "$(dirname "$0")/.." || exit 1
BATCH=1000
N=${1:-1000}
LIST="tmp/.audio_chunk_list.txt"

while true; do
  git ls-files --others --exclude-standard patches/ai-voice-pack/audio | grep -vE '\.(part|tmp)$' | head -n "$BATCH" > "$LIST"
  [ -s "$LIST" ] || { echo "незакоммиченного аудио нет"; rm -f "$LIST"; break; }
  # pathspec-from-file: длинные пути Windows не влезают в argv (Argument list too long)
  git add --pathspec-from-file="$LIST"
  COUNT=$(git diff --cached --name-only | wc -l)
  git commit -q -m "chore(audio): демо-озвучка Vox — партия (~${COUNT} клипов)" && echo "партия закоммичена: $COUNT файлов"
  N=$((N-1)); [ "$N" -le 0 ] && { echo "лимит партий за запуск исчерпан"; rm -f "$LIST"; break; }
done
