Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$winCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window)
$wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)
foreach ($w in $wins) {
    if ($w.Current.ProcessId -ne 2432) { continue }
    $r = $w.Current.BoundingRectangle
    Write-Host ("WINDOW pid={0} '{1}' rect={2},{3} {4}x{5}" -f $w.Current.ProcessId, $w.Current.Name, [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height)
    $btnCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button)
    $btns = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    Write-Host ("buttons: {0}" -f $btns.Count)
    foreach ($b in $btns) {
        $br = $b.Current.BoundingRectangle
        $nm = $b.Current.Name
        Write-Host ("  B '{0}' {1},{2} {3}x{4} offscreen={5} enabled={6}" -f $nm, [int]$br.X, [int]$br.Y, [int]$br.Width, [int]$br.Height, $b.Current.IsOffscreen, $b.Current.IsEnabled)
    }
}
