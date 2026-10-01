param([Parameter(Mandatory=$true)][uri]$AppUrl, [switch]$Setup)
# Use a separate browser profile so existing Edge windows do not ignore the printing flag.
if ($AppUrl.Scheme -notin @('https','http')) { throw 'Use the POS website URL.' }
$edgeCandidates = @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")
$edgePath = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edgePath) { throw 'Microsoft Edge is not installed.' }
$receiptProfile = Join-Path $env:LOCALAPPDATA 'LaCasaReceiptEdge'
$receiptArguments = @(('--user-data-dir="' + $receiptProfile + '"'), ('--app="' + $AppUrl.AbsoluteUri + '"'))
if (-not $Setup) { $receiptArguments += '--kiosk-printing' }
Start-Process -FilePath $edgePath -ArgumentList $receiptArguments -WindowStyle Normal
