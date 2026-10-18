$ErrorActionPreference = 'Continue'
$PY = "C:\tools\cosyvoice3\.venv\Scripts\python.exe"
$LOG = "output/voice/gen_all_en.log"
$ARCS = @("Prologue","StoryBeginnings","Other","WarriorPath","MagePath","BlackMonolith","UnionKingdom","HollowWorld","SailorPath","AlfredArc","HassarPath","SailorArc","LifeInRahayal","VargaMarionPath","Training","PrisonArc","HyralArc","DemonArc","WarArc")
foreach ($arc in $ARCS) {
  Add-Content $LOG "=== START en $arc $(Get-Date -Format HH:mm) ==="
  & $PY tools/voice_batch.py --arc $arc --lang en 2>&1 | Out-File -FilePath $LOG -Append -Encoding utf8
  Add-Content $LOG "=== DONE en $arc $(Get-Date -Format HH:mm) ==="
}
Add-Content $LOG "=== ALL DONE en $(Get-Date -Format HH:mm) ==="
