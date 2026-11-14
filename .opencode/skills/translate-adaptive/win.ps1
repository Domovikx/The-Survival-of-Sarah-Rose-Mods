# win.ps1 — тонкая обёртка над Windows API, нужная translate-adaptive.
#
# Живёт отдельным файлом, чтобы C#-вставка (GetLastInputInfo) не уезжала в
# командную строку: node зовёт `powershell -File win.ps1 -Cmd <команда>` без
# shell, поэтому кавычки/локали не участвуют.
#
# Команды:
#   idle                    -> IDLE_MS=<мс с последнего ввода пользователя>
#   procs                   -> JSON [{pid,name,cmd}] всех процессов
#   stats <pid>             -> JSON {pid,prio,cpu,ws} или null
#   prio <pid> <class>      -> выставить приоритет (Normal/AboveNormal/...)
#   kill <pid>              -> Stop-Process -Force
#   sys                     -> JSON {cpu,ramTotalMiB,ramFreeMiB}
param(
  [Parameter(Mandatory = $true)][string]$Cmd,
  [string]$A1,
  [string]$A2
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TssrIdle {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static long IdleMs() {
    LASTINPUTINFO l = new LASTINPUTINFO();
    l.cbSize = (uint)Marshal.SizeOf(l);
    if (!GetLastInputInfo(ref l)) return -1;
    uint tick = unchecked((uint)Environment.TickCount);
    return unchecked(tick - l.dwTime);
  }
}
"@

switch ($Cmd) {
  'idle' {
    # Тик-счётчик заворачивается через 49.7 суток; вычитание в uint это переживает.
    Write-Output ("IDLE_MS=" + [TssrIdle]::IdleMs())
  }
  'procs' {
    $list = foreach ($p in Get-CimInstance Win32_Process) {
      [pscustomobject]@{ pid = [int]$p.ProcessId; name = [string]$p.Name; cmd = [string]$p.CommandLine }
    }
    ConvertTo-Json -InputObject @($list) -Compress -Depth 3
  }
  'stats' {
    $p = Get-Process -Id ([int]$A1) -ErrorAction SilentlyContinue
    if ($null -eq $p) {
      Write-Output 'null'
    }
    else {
      [pscustomobject]@{
        pid  = [int]$p.Id
        prio = [string]$p.PriorityClass
        cpu  = [double]$p.CPU
        ws   = [long]$p.WorkingSet64
      } | ConvertTo-Json -Compress
    }
  }
  'prio' {
    $p = Get-Process -Id ([int]$A1) -ErrorAction SilentlyContinue
    if ($null -eq $p) { Write-Output 'missing'; exit 0 }
    $p.PriorityClass = $A2
    Write-Output ([string]$p.PriorityClass)
  }
  'kill' {
    Stop-Process -Id ([int]$A1) -Force -ErrorAction SilentlyContinue
    Write-Output 'killed'
  }
  'sys' {
    $o = Get-CimInstance Win32_OperatingSystem
    $c = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
    [pscustomobject]@{
      cpu         = [int]$c.PercentProcessorTime
      ramTotalMiB = [int]($o.TotalVisibleMemorySize / 1024)
      ramFreeMiB  = [int]($o.FreePhysicalMemory / 1024)
    } | ConvertTo-Json -Compress
  }
  default { Write-Error "unknown -Cmd: $Cmd"; exit 2 }
}
