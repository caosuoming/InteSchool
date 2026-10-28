# Windows PowerShell 5.1 ships with Windows 10/11; no additional runtime is required.
param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$stateDir = Join-Path $env:LOCALAPPDATA 'InteSchool\Scanner'
$logFile = Join-Path $stateDir 'tray.log'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

function Write-ScannerLog([string]$message) {
    try {
        Add-Content -LiteralPath $logFile -Encoding UTF8 -Value ("{0:u} {1}" -f (Get-Date), $message)
    } catch {}
}

# A named event lets the uninstaller stop only our tray, not arbitrary PowerShell processes.
$stopEvent = [System.Threading.EventWaitHandle]::new($false, [System.Threading.EventResetMode]::AutoReset, 'Local\InteSchoolScannerTrayStop')
if ($Stop) {
    $stopEvent.Set() | Out-Null
    $stopEvent.Dispose()
    exit 0
}
$mutex = [System.Threading.Mutex]::new($false, 'Local\InteSchoolScannerTray')
$ownsMutex = $false
try {
    $ownsMutex = $mutex.WaitOne(0)
    if (-not $ownsMutex) { exit 0 }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $context = New-Object System.Windows.Forms.ApplicationContext
    $tray = New-Object System.Windows.Forms.NotifyIcon
    $tray.Icon = [System.Drawing.Icon]::new((Join-Path $PSScriptRoot 'scanner.ico'))
    $tray.Text = 'InteSchool Scanner'
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $statusItem = $menu.Items.Add('正在检查扫描服务……')
    $statusItem.Enabled = $false
    $menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
    $openItem = $menu.Items.Add('打开扫描网页')
    $startItem = $menu.Items.Add('启动 / 修复扫描服务')
    $logItem = $menu.Items.Add('查看诊断日志')
    $napsItem = $menu.Items.Add('下载 NAPS2（TWAIN 扫描）')
    $menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
    $exitItem = $menu.Items.Add('退出托盘（服务继续运行）')
    $tray.ContextMenuStrip = $menu
    $tray.Visible = $true

    function Get-ScannerOrigins {
        $path = Join-Path $env:APPDATA 'InteSchool\Scanner\origins.json'
        if (-not (Test-Path -LiteralPath $path)) { return @() }
        try {
            $origins = @(Get-Content -Raw -LiteralPath $path -Encoding UTF8 | ConvertFrom-Json)
            return @($origins | Where-Object { $_ -is [string] -and $_ -match '^(https://[^/]+|http://(localhost|127\.0\.0\.1)(:\d+)?)$' })
        } catch {
            Write-ScannerLog "Failed to read website configuration: $($_.Exception.Message)"
            return @()
        }
    }

    function Test-ScannerService {
        $origins = @(Get-ScannerOrigins)
        $origin = if ($origins.Count -gt 0) { $origins[0] } else { 'https://not-paired.invalid' }
        try {
            $request = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:17380/health')
            $request.Method = 'GET'
            $request.Timeout = 1200
            $request.ReadWriteTimeout = 1200
            $request.Headers.Add('Origin', $origin)
            $request.Headers.Add('X-InteSchool-Scanner', 'scanner-v1')
            $response = $request.GetResponse()
            try {
                if ([int]$response.StatusCode -eq 200) { return 'ready' }
            } finally { $response.Dispose() }
        } catch [System.Net.WebException] {
            if ($_.Exception.Response -ne $null) {
                try {
                    if ([int]$_.Exception.Response.StatusCode -eq 403 -and $origins.Count -eq 0) {
                        return 'unpaired'
                    }
                } finally { $_.Exception.Response.Dispose() }
            }
        } catch {}
        return 'offline'
    }

    $script:lastStart = [datetime]::MinValue
    function Start-ScannerService {
        if ((Get-Date) - $script:lastStart -lt [timespan]::FromSeconds(12)) { return }
        $script:lastStart = Get-Date
        try {
            $node = Join-Path $PSScriptRoot 'node.exe'
            $launcher = Join-Path $PSScriptRoot 'scripts\scanner-launcher.mjs'
            Start-Process -FilePath $node -ArgumentList ('"' + $launcher + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
            Write-ScannerLog 'Requested scanner bridge startup.'
        } catch {
            Write-ScannerLog "Scanner bridge could not start: $($_.Exception.Message)"
        }
    }

    function Update-ScannerStatus {
        switch (Test-ScannerService) {
            'ready' {
                $statusItem.Text = '扫描服务正常'
                $tray.Text = 'InteSchool 扫描服务正常'
            }
            'unpaired' {
                $statusItem.Text = '服务已运行，请授权连接网站'
                $tray.Text = 'InteSchool 扫描网站尚未授权'
            }
            default {
                $statusItem.Text = '扫描服务离线，正在重试'
                $tray.Text = 'InteSchool 扫描服务离线'
                Start-ScannerService
            }
        }
    }

    $openItem.Add_Click({
        $origins = @(Get-ScannerOrigins)
        if ($origins.Count -eq 0) {
            [System.Windows.Forms.MessageBox]::Show('请先在浏览器打开 InteSchool 网站，进入「我要扫描」，点击「授权连接本站」。', 'InteSchool Scanner') | Out-Null
        } else {
            Start-Process ($origins[0] + '/scanner')
        }
    })
    $tray.Add_DoubleClick({ $openItem.PerformClick() })
    $startItem.Add_Click({ Start-ScannerService; Update-ScannerStatus })
    $logItem.Add_Click({
        if (-not (Test-Path -LiteralPath $logFile)) { Write-ScannerLog 'Diagnostics opened.' }
        Start-Process 'notepad.exe' -ArgumentList ('"' + $logFile + '"')
    })
    $napsItem.Add_Click({ Start-Process 'https://www.naps2.com/' })
    $exitItem.Add_Click({ $context.ExitThread() })
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 10000
    $timer.Add_Tick({
        if ($stopEvent.WaitOne(0)) { $context.ExitThread(); return }
        Update-ScannerStatus
    })
    Start-ScannerService
    Update-ScannerStatus
    $timer.Start()
    [System.Windows.Forms.Application]::Run($context)
} catch {
    Write-ScannerLog "Tray failed: $($_.Exception.ToString())"
} finally {
    if ($timer) { $timer.Stop(); $timer.Dispose() }
    if ($tray) { $tray.Visible = $false; $tray.Dispose() }
    if ($menu) { $menu.Dispose() }
    if ($context) { $context.Dispose() }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
    $stopEvent.Dispose()
}
