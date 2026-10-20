param(
  [ValidateSet('List','Scan')][string]$Action = 'List',
  [string]$DeviceId,
  [string]$OutputFile
)
$ErrorActionPreference = 'Stop'
$manager = New-Object -ComObject WIA.DeviceManager
if ($Action -eq 'List') {
  $devices = @()
  foreach ($info in $manager.DeviceInfos) {
    if ($info.Type -ne 1) { continue }
    $name = $info.DeviceID
    foreach ($property in $info.Properties) {
      if ($property.Name -eq 'Name') { $name = [string]$property.Value; break }
    }
    $devices += @{ id = [string]$info.DeviceID; name = $name }
  }
  [Console]::Out.Write((ConvertTo-Json -InputObject @($devices) -Compress -Depth 3))
  exit 0
}
if (!$DeviceId -or !$OutputFile) { throw '缺少扫描设备和输出路径' }
$info = @($manager.DeviceInfos | Where-Object { $_.Type -eq 1 -and $_.DeviceID -eq $DeviceId }) | Select-Object -First 1
if (!$info) { throw '没有找到所选 WIA 扫描仪' }
$device = $info.Connect()
$dialog = New-Object -ComObject WIA.CommonDialog
# Single-page WIA only; duplex feeders should use NAPS2/TWAIN.
$image = $dialog.ShowTransfer($device.Items.Item(1), '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}', $false)
if (!$image) { throw '扫描操作已取消' }
$image.SaveFile($OutputFile)
