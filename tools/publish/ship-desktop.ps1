<#
  把 desktop\src 的改动送进"正在使用的"客户端并重启它。

  为什么要这一步：双击打开的是打包产物
    <安装>\desktop\dist\DeepSeek Harness-win32-x64\DeepSeek Harness.exe
  它读的是同目录下 resources\app\src\ 里的代码，
  而开发/编辑的是 <安装>\desktop\src\ —— 两份代码，必须同步（这个坑踩过）。

  用法：
    .\ship-desktop.ps1                 # 同步 + 重启
    .\ship-desktop.ps1 -NoRestart      # 只同步
#>
param([switch]$NoRestart)

$ErrorActionPreference = 'Stop'
$install = 'E:\DeepSeekHarness'
$srcDir = Join-Path $install 'desktop\src'
$distRoot = Join-Path $install 'desktop\dist\DeepSeek Harness-win32-x64'
$appDir = Join-Path $distRoot 'resources\app'
$exe = Join-Path $distRoot 'DeepSeek Harness.exe'

if (-not (Test-Path $exe)) { throw "找不到打包产物：$exe（先跑 desktop\build.ps1）" }

Write-Host '① 同步 src → resources\app\src'
$files = Get-ChildItem $srcDir -File
foreach ($file in $files) {
  $target = Join-Path (Join-Path $appDir 'src') $file.Name
  Copy-Item $file.FullName $target -Force
  Write-Host ('   ' + $file.Name)
}

Write-Host '② 同步 assets'
foreach ($name in @('icon.ico', 'icon.png')) {
  $from = Join-Path $install "desktop\assets\$name"
  if (Test-Path $from) { Copy-Item $from (Join-Path $appDir "assets\$name") -Force }
}

Write-Host '③ 校验打包版确实包含新代码'
$main = Get-Content (Join-Path $appDir 'src\main.js') -Raw -Encoding UTF8
foreach ($marker in @('preload.js', 'dsh:delete-session', 'session-store.js')) {
  if ($main -notmatch [regex]::Escape($marker)) { throw "打包版 main.js 里没有 $marker，同步失败" }
}
Write-Host '   ✓ preload / 删除 IPC / session-store 都在'

if ($NoRestart) { Write-Host '（-NoRestart：没有重启）'; return }

Write-Host '④ 重启客户端（计划任务，保证窗口出现在你的桌面上）'
Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
$action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $distRoot
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName 'DSH-Restart-Once' -Action $action -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'DSH-Restart-Once'
Start-Sleep -Seconds 26
Unregister-ScheduledTask -TaskName 'DSH-Restart-Once' -Confirm:$false
$proc = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) { Write-Host ('   ✓ 已重启，PID ' + $proc.Id) } else { Write-Host '   ⚠ 没看到进程，请手动双击桌面图标' }
