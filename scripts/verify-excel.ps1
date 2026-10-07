param([Parameter(Mandatory=$true)][string]$Workbook, [Parameter(Mandatory=$true)][string]$ExpectedCells)
# Optional, read-only verification in an independent hidden Excel instance.
# Never save or repair the source export; never log personal tax figures.
$ErrorActionPreference = 'Stop'
$taskExcel = $null
$taskBook = $null
try {
    $taskPath = (Resolve-Path -LiteralPath $Workbook).Path
    $taskExpected = Get-Content -Raw -LiteralPath $ExpectedCells | ConvertFrom-Json
    $taskExcel = New-Object -ComObject Excel.Application
    $taskExcel.Visible = $false
    $taskExcel.DisplayAlerts = $false
    $taskExcel.AutomationSecurity = 3
    $taskBook = $taskExcel.Workbooks.Open($taskPath, 0, $true)
    $taskExcel.CalculateFullRebuild()
    $taskFailed = 0
    foreach ($taskItem in $taskExpected) {
        $taskCell = $taskBook.Worksheets.Item($taskItem.sheet).Range($taskItem.address)
        if (!$taskCell.HasFormula -or $taskCell.Text -match '^#(REF|VALUE|NAME|DIV|NUM|N/A|SPILL|CALC)' -or [Math]::Abs([double]$taskCell.Value2 - [double]$taskItem.value) -gt 0.000001) { $taskFailed++ }
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskCell)
    }
    if ($taskFailed) { throw 'Excel recalculation does not match the preserved workbook cached values.' }
    Write-Output ('Excel read-only verification passed: ' + $taskExpected.Count + ' numeric formulas retained and matching after full recalculation.')
} finally {
    if ($taskBook) { $taskBook.Close($false); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskBook) }
    if ($taskExcel) { $taskExcel.Quit(); [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskExcel) }
}
