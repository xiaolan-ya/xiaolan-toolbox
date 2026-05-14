$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$distDir = Join-Path $root "dist"
$runtimeDir = Join-Path $root "node_modules\electron\dist"
$packageJsonPath = Join-Path $root "package.json"

if (-not (Test-Path -LiteralPath $runtimeDir)) {
  throw "Missing runtime folder: $runtimeDir"
}

if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  throw "Missing package.json: $packageJsonPath"
}

$packageInfo = [System.IO.File]::ReadAllText($packageJsonPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$versionLabel = [string]$packageInfo.version
if ([string]::IsNullOrWhiteSpace($versionLabel)) {
  $versionLabel = "local"
}

$appName = -join @([char]23567, [char]34013, [char]24037, [char]20855, [char]31665)
$runnableLabel = -join @([char]21487, [char]36816, [char]34892, [char]21253)
$launchFileName = -join @([char]21551, [char]21160, [char]23567, [char]34013, [char]24037, [char]20855, [char]31665) + ".cmd"
$readmeFileName = -join @([char]20351, [char]29992, [char]35828, [char]26126) + ".txt"

$bundleName = "$appName-$versionLabel-$runnableLabel"
$stagingDir = Join-Path $distDir $bundleName
$zipPath = Join-Path $distDir "$bundleName.zip"
$resourcesDir = Join-Path $stagingDir "resources"
$appDir = Join-Path $resourcesDir "app"

if (Test-Path -LiteralPath $stagingDir) {
  Remove-Item -LiteralPath $stagingDir -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
New-Item -ItemType Directory -Path $resourcesDir -Force | Out-Null
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

# Copy the Electron runtime, including the resources folder Electron needs at startup.
Get-ChildItem -Force -LiteralPath $runtimeDir | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination $stagingDir -Recurse -Force
}

$appItems = @(
  "main.js",
  "preload.js",
  "package.json",
  "core",
  "renderer",
  "build",
  "tools"
)

foreach ($item in $appItems) {
  $sourcePath = Join-Path $root $item
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing app item: $sourcePath"
  }

  Copy-Item -LiteralPath $sourcePath -Destination $appDir -Recurse -Force
}

$launcherContent = @'
@echo off
setlocal
cd /d "%~dp0"
start "" "%~dp0electron.exe"
'@

$readmeContent = @(
  (-join @([char]20351, [char]29992, [char]35828, [char]26126)),
  "",
  "1. " + (-join @([char]20808, [char]23436, [char]25972, [char]35299, [char]21387, [char]26412, [char]21387, [char]32553, [char]21253, [char]65292, [char]19981, [char]35201, [char]30452, [char]25509, [char]22312, [char]21387, [char]32553, [char]21253, [char]37324, [char]21452, [char]20987, [char]36816, [char]34892, [char]12290)),
  "2. " + (-join @([char]21452, [char]20987, [char]8220, [char]21551, [char]21160, [char]23567, [char]34013, [char]24037, [char]20855, [char]31665, [char]46, [char]99, [char]109, [char]100, [char]8221, [char]21363, [char]21487, [char]25171, [char]24320, [char]12290)),
  "3. " + (-join @([char]22914, [char]26524, [char]31995, [char]32479, [char]25552, [char]31034, [char]23433, [char]20840, [char]39564, [char]35777, [char]65292, [char]35831, [char]36873, [char]25321, [char]32487, [char]32493, [char]36816, [char]34892, [char]12290)),
  "4. " + (-join @([char]39318, [char]27425, [char]21551, [char]21160, [char]36739, [char]24930, [char]26102, [char]65292, [char]31561, [char]24453, [char]20960, [char]31186, [char]21363, [char]21487, [char]12290))
) -join [Environment]::NewLine

[System.IO.File]::WriteAllText((Join-Path $stagingDir $launchFileName), $launcherContent, [System.Text.Encoding]::ASCII)
[System.IO.File]::WriteAllText((Join-Path $stagingDir $readmeFileName), $readmeContent, [System.Text.Encoding]::UTF8)

if (-not (Test-Path -LiteralPath (Join-Path $stagingDir "electron.exe"))) {
  throw "electron.exe was not copied into the runnable package."
}

Copy-Item -LiteralPath (Join-Path $stagingDir "electron.exe") -Destination (Join-Path $stagingDir "$appName.exe") -Force

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Runnable package folder:"
Write-Host $stagingDir
Write-Host "Runnable package zip:"
Write-Host $zipPath
