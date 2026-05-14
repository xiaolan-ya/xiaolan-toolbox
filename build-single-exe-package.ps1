$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$distDir = Join-Path $root "dist"
$workDir = "D:\codex\xiaolan\single-exe-work"
$payloadDir = Join-Path $workDir "payload"
$payloadZip = Join-Path $workDir "payload.zip"
$launcherSource = Join-Path $workDir "SingleExeLauncher.cs"
$launcherExe = Join-Path $workDir "xiaolan-toolbox-new.exe"
$finalExe = "D:\codex\xiaolan\xiaolan-toolbox-new.exe"

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "build-runnable-package.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Runnable package build failed with exit code $LASTEXITCODE"
}

$packageInfo = [System.IO.File]::ReadAllText((Join-Path $root "package.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$versionLabel = [string]$packageInfo.version
if ([string]::IsNullOrWhiteSpace($versionLabel)) {
  $versionLabel = "local"
}
$appName = -join @([char]23567, [char]34013, [char]24037, [char]20855, [char]31665)
$runnableLabel = -join @([char]21487, [char]36816, [char]34892, [char]21253)
$sourceDir = Join-Path $distDir "$appName-$versionLabel-$runnableLabel"

if (-not (Test-Path -LiteralPath (Join-Path $sourceDir "electron.exe"))) {
  throw "Missing runnable package: $sourceDir"
}

if (Test-Path -LiteralPath $workDir) {
  Remove-Item -LiteralPath $workDir -Recurse -Force
}

New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $finalExe) -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $sourceDir "electron.exe") -Destination $payloadDir -Force
$runtimeItems = @(
  "locales",
  "resources",
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "d3dcompiler_47.dll",
  "ffmpeg.dll",
  "icudtl.dat",
  "libEGL.dll",
  "libGLESv2.dll",
  "LICENSE",
  "LICENSES.chromium.html",
  "resources.pak",
  "snapshot_blob.bin",
  "v8_context_snapshot.bin",
  "version",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "vulkan-1.dll"
)

foreach ($item in $runtimeItems) {
  $sourcePath = Join-Path $sourceDir $item
  if (Test-Path -LiteralPath $sourcePath) {
    Copy-Item -LiteralPath $sourcePath -Destination $payloadDir -Recurse -Force
  }
}

if (Test-Path -LiteralPath $payloadZip) {
  Remove-Item -LiteralPath $payloadZip -Force
}
Compress-Archive -Path (Join-Path $payloadDir "*") -DestinationPath $payloadZip -CompressionLevel Optimal
$payloadHash = (Get-FileHash -LiteralPath $payloadZip -Algorithm SHA256).Hash

$launcherCode = @'
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

namespace XiaolanSingleExe
{
    internal static class Program
    {
        private static bool HasRequiredPayloadFiles(string appDir)
        {
            string[] requiredRelativePaths = new string[]
            {
                "electron.exe",
                Path.Combine("resources", "app", "main.js"),
                Path.Combine("resources", "app", "preload.js"),
                Path.Combine("resources", "app", "package.json"),
                Path.Combine("resources", "app", "core", "generation.js"),
                Path.Combine("resources", "app", "core", "image-api.js"),
                Path.Combine("resources", "app", "renderer", "index.html"),
                Path.Combine("resources", "app", "renderer", "renderer.js"),
                Path.Combine("resources", "app", "renderer", "styles.css"),
                Path.Combine("resources", "app", "renderer", "prompt-library.js"),
                Path.Combine("resources", "app", "tools", "reference-prompt.js")
            };

            foreach (string relativePath in requiredRelativePaths)
            {
                if (!File.Exists(Path.Combine(appDir, relativePath)))
                {
                    return false;
                }
            }

            return true;
        }

        [STAThread]
        private static int Main()
        {
            try
            {
                string version = "1.2.0509B";
                string payloadHash = "__PAYLOAD_HASH__";
                string appDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "XiaolanToolbox",
                    version
                );
                string markerPath = Path.Combine(appDir, ".ready");
                string hashPath = Path.Combine(appDir, ".payload.sha256");
                string exePath = Path.Combine(appDir, "electron.exe");

                string existingHash = File.Exists(hashPath) ? File.ReadAllText(hashPath).Trim() : "";
                if (!File.Exists(markerPath) || existingHash != payloadHash || !HasRequiredPayloadFiles(appDir))
                {
                    if (Directory.Exists(appDir))
                    {
                        Directory.Delete(appDir, true);
                    }

                    Directory.CreateDirectory(appDir);
                    string zipPath = Path.Combine(Path.GetTempPath(), "xiaolan-toolbox-" + version + ".zip");
                    using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
                    using (FileStream output = File.Create(zipPath))
                    {
                        if (input == null)
                        {
                            throw new InvalidOperationException("Payload resource is missing.");
                        }
                        input.CopyTo(output);
                    }
                    ZipFile.ExtractToDirectory(zipPath, appDir);
                    File.WriteAllText(markerPath, DateTimeOffset.Now.ToString("O"));
                    File.WriteAllText(hashPath, payloadHash);
                    try { File.Delete(zipPath); } catch { }
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = appDir,
                    UseShellExecute = true
                });
                return 0;
            }
            catch (Exception error)
            {
                string message = "Xiaolan Toolbox failed to start:" + Environment.NewLine + error.Message;
                try
                {
                    System.Windows.Forms.MessageBox.Show(message, "Xiaolan Toolbox", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
                }
                catch
                {
                    Console.Error.WriteLine(message);
                }
                return 1;
            }
        }
    }
'@

$launcherTail = @'
}
'@

[System.IO.File]::WriteAllText($launcherSource, ($launcherCode -replace "__PAYLOAD_HASH__", $payloadHash) + $launcherTail, [System.Text.Encoding]::UTF8)

$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $csc)) {
  $csc = "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path -LiteralPath $csc)) {
  throw "C# compiler not found."
}

& $csc /nologo /target:winexe /optimize+ /out:$launcherExe /resource:$payloadZip,payload.zip /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll $launcherSource
if ($LASTEXITCODE -ne 0) {
  throw "Single exe compiler failed with exit code $LASTEXITCODE"
}

Copy-Item -LiteralPath $launcherExe -Destination $finalExe -Force
Write-Host "Single executable created:"
Write-Host $finalExe
