/**
 * Закрыть нативное окно Chrome («Перезагрузить сайт?» и подобные) через Win32:
 * активировать окно и послать ESC (или Enter при --accept).
 */
const accept = process.argv.includes("--accept");

const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$p = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { 'нет окна Chrome'; exit 1 }
[W]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
[W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 600
[System.Windows.Forms.SendKeys]::SendWait('${accept ? "{ENTER}" : "{ESC}"}')
Start-Sleep -Milliseconds 400
'ok'
`;

const { spawnSync } = await import("node:child_process");
const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf-8" });
console.log((r.stdout || "").trim() || (r.stderr || "").trim().slice(0, 200));
