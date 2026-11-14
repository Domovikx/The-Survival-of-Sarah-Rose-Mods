Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$winCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window)
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)
foreach ($w in $wins) {
    $r = $w.Current.BoundingRectangle
    $p = Get-Process -Id $w.Current.ProcessId -ErrorAction SilentlyContinue
    Write-Host ("[{0}] pid={1} '{2}' rect={3},{4} {5}x{6}" -f $p.ProcessName, $w.Current.ProcessId, $w.Current.Name, [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height)
}
