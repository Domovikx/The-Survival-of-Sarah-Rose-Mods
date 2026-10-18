$ErrorActionPreference = 'Continue'
$PY = "C:\tools\cosyvoice3\.venv\Scripts\python.exe"
$LOG = "output/voice/gen_all_ru.log"
$ARCS = @("Prologue","StoryBeginnings","Other","WarriorPath","MagePath","BlackMonolith","UnionKingdom","HollowWorld","SailorPath","AlfredArc","HassarPath","SailorArc","LifeInRahayal","VargaMarionPath","Training","PrisonArc","HyralArc","DemonArc","WarArc")
foreach ($arc in $ARCS) {
  Add-Content $LOG "=== START ru $arc $(Get-Date -Format HH:mm) ==="
  & $PY tools/voice_batch.py --arc $arc --lang ru 2>&1 | Out-File -FilePath $LOG -Append -Encoding utf8
  Add-Content $LOG "=== DONE ru $arc $(Get-Date -Format HH:mm) ==="
}
Add-Content $LOG "=== ALL DONE ru $(Get-Date -Format HH:mm) ==="
