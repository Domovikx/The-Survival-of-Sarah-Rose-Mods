' tssr_start_all.vbs — поднять фоновый контур TSSR без окон (двойной клик).
'
' Запускает только недостающее: страж здоровья, сторож слотов llama-server,
' пульт и очередь переводов. Повторный запуск дублей не создаёт — вся проверка
' внутри scripts/tssr_start_all.mts.
'
' Остановить всё: scripts\tssr_stop_all.cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.Run "node --experimental-strip-types scripts\tssr_start_all.mts", 0, False
