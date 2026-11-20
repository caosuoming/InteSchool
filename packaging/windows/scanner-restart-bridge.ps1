# Restart only an InteSchool bridge launched from this installation directory.
# An old bridge otherwise survives an in-place upgrade and keeps the old pairing logic.
$ErrorActionPreference = 'Stop'
$expectedScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'scripts\scanner-bridge.mjs'))
$expectedRuntime = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'node.exe'))
foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'")) {
    if (-not $process.CommandLine -or -not $process.ExecutablePath) { continue }
    if (-not [string]::Equals($process.ExecutablePath, $expectedRuntime, [StringComparison]::OrdinalIgnoreCase)) { continue }
    # Require the exact quoted or unquoted script argument; never kill an unrelated Node process.
    $scriptPattern = '(?i)(?:^|\s)["'']?' + [regex]::Escape($expectedScript) + '(?:["'']?(?:\s|$))'
    if ($process.CommandLine -notmatch $scriptPattern) { continue }
    # Only terminate processes owned by the user running this installer.
    $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwner
    if ($owner.ReturnValue -ne 0 -or $owner.User -ne $env:USERNAME) { continue }
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
}
