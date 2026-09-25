<#
  Assemble the portable desktop client without electron-packager:
    copy the Electron runtime -> write resources/app -> stamp icon and version with rcedit.

  Usage: powershell -ExecutionPolicy Bypass -File .\build.ps1
  (ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.)
#>

$ErrorActionPreference = 'Stop'

$desktop = 'E:\DeepSeekHarness\desktop'
$electronDist = Join-Path $desktop 'node_modules\electron\dist'
$out = Join-Path $desktop 'dist\DeepSeek Harness-win32-x64'
$exeName = 'DeepSeek Harness.exe'

if (-not (Test-Path (Join-Path $electronDist 'electron.exe'))) {
  throw "Electron runtime not found: $electronDist (run npm install first)"
}
if ($out -notlike "$desktop\dist\*") {
  throw "Refusing to write outside the dist folder: $out"
}

if (Test-Path $out) {
  Write-Host "Cleaning previous build: $out"
  Remove-Item -LiteralPath $out -Recurse -Force
}

Write-Host 'Copying Electron runtime...'
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item -Path (Join-Path $electronDist '*') -Destination $out -Recurse -Force

# Localise the executable name
$exe = Join-Path $out $exeName
Move-Item -LiteralPath (Join-Path $out 'electron.exe') -Destination $exe -Force

# Drop Electron's bundled sample app
$defaultApp = Join-Path $out 'resources\default_app.asar'
if (Test-Path $defaultApp) { Remove-Item -LiteralPath $defaultApp -Force }

Write-Host 'Writing application files...'
$appDir = Join-Path $out 'resources\app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
foreach ($item in @('src', 'assets')) {
  Copy-Item -LiteralPath (Join-Path $desktop $item) -Destination $appDir -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $desktop 'config.json') -Destination $appDir -Force

$appManifest = @'
{
  "name": "dsh-desktop",
  "productName": "DeepSeek Harness",
  "version": "1.0.0",
  "private": true,
  "description": "DeepSeek Harness desktop client wrapping the local dsh runtime",
  "main": "src/main.js",
  "license": "MIT"
}
'@
Set-Content -LiteralPath (Join-Path $appDir 'package.json') -Value $appManifest -Encoding UTF8

# Keep an editable copy of the config next to the executable
Copy-Item -LiteralPath (Join-Path $desktop 'config.json') -Destination (Join-Path $out 'config.json') -Force

Write-Host 'Stamping icon and version info...'
$rcedit = Join-Path $desktop 'node_modules\rcedit\bin\rcedit-x64.exe'
if (Test-Path $rcedit) {
  & $rcedit $exe `
    --set-icon (Join-Path $desktop 'assets\icon.ico') `
    --set-version-string ProductName 'DeepSeek Harness' `
    --set-version-string FileDescription 'DeepSeek Harness Desktop' `
    --set-version-string CompanyName 'DeepSeek Harness (local install)' `
    --set-version-string LegalCopyright 'MIT' `
    --set-file-version '1.0.0.0' `
    --set-product-version '1.0.0'
  if ($LASTEXITCODE -ne 0) { Write-Warning "rcedit exited with $LASTEXITCODE; the icon may be missing" }
} else {
  Write-Warning 'rcedit not found; skipping icon stamping'
}

$size = [math]::Round((Get-ChildItem $out -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-Host ''
Write-Host "Done: $exe"
Write-Host "Size: $size MB"
