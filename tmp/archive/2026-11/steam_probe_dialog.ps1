$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$winCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window)
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)
foreach ($w in $wins) {
    $t = $w.Current.Name
    if ($t -notmatch "Sarah Rose|Установить") { continue }
    Write-Host "WINDOW: $t  pid=$($w.Current.ProcessId)"
    $btnCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button)
    $btns = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    foreach ($b in $btns) {
        $r = $b.Current.BoundingRectangle
        Write-Host ("  BUTTON name='{0}' x={1} y={2} w={3} h={4}" -f $b.Current.Name, [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height)
    }
}
