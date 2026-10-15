param(
    [ValidatePattern('^\d+\.\d+\.\d+\.0$')][string]$PackageVersion = '2.2.0.0',
    [Parameter(Mandatory)][string]$MediaToolsDir,
    [string]$MakeAppxPath = 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/makeappx.exe'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$media = (Resolve-Path -LiteralPath $MediaToolsDir).Path
foreach ($required in @('bin/ffmpeg.exe', 'bin/ffprobe.exe', 'LICENSE', 'README.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $media $required) -PathType Leaf)) {
        throw "Missing media package file: $required"
    }
}
$mediaHashes = @{
    'ffmpeg.exe' = '589E50B766D251AFDF181DD664D40BD94407E200B019989FD7468C7D118A28D0'
    'ffprobe.exe' = '02264DFA4F56BAAA31E443ECE8AA16D397F6B008200E7FD184D22B9009E75FD3'
}
foreach ($binary in $mediaHashes.Keys) {
    $actualHash = (Get-FileHash -LiteralPath (Join-Path $media "bin/$binary") -Algorithm SHA256).Hash
    if ($actualHash -ne $mediaHashes[$binary]) {
        throw "Unreviewed media binary: $binary. Update the inventory and third-party notice before packaging a different build."
    }
}
if (-not (Test-Path -LiteralPath $MakeAppxPath -PathType Leaf)) { throw 'Windows SDK MakeAppx missing' }
$version = [Version]$PackageVersion
foreach ($part in @($version.Major, $version.Minor, $version.Build, $version.Revision)) {
    if ($part -gt 65535) { throw 'MSIX version component exceeds 65535' }
}
$stage = Join-Path $repo "anirium-service/release/msix-$PackageVersion"
if (Test-Path -LiteralPath $stage) { throw 'Existing staging directory: use a new version; no overwrite' }
# This creates a staging candidate only. No certificate installation, Store
# submission, public download replacement or production deployment occurs.
& (Join-Path $PSScriptRoot 'build-service.ps1') -StageOnly -ReleaseVersion $PackageVersion
if ($LASTEXITCODE -ne 0) { throw 'Service build failed' }
$payload = Join-Path $stage 'payload'
$assets = Join-Path $payload 'Assets'
$tools = Join-Path $payload 'tools'
New-Item -ItemType Directory -Path $assets, $tools | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'anirium-service/anirium-service.exe') -Destination $payload
foreach ($binary in @('ffmpeg.exe', 'ffprobe.exe')) {
    Copy-Item -LiteralPath (Join-Path $media "bin/$binary") -Destination $tools
}
Copy-Item -LiteralPath (Join-Path $media 'LICENSE') -Destination (Join-Path $tools 'LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $media 'README.txt') -Destination $tools
Copy-Item -LiteralPath (Join-Path $repo 'anirium-service/msix/MEDIA-NOTICE.txt') -Destination $tools
# Exercise the newly built executable, not a Go helper or the host's tools.
# Diagnostics must exit before GUI/network initialization. No installation or
# certificate trust changes are performed by this staging gate.
$diagnosticStart = [Diagnostics.ProcessStartInfo]::new()
$diagnosticStart.FileName = Join-Path $payload 'anirium-service.exe'
$diagnosticStart.Arguments = '--diagnostics'
$diagnosticStart.UseShellExecute = $false
$diagnosticStart.CreateNoWindow = $true
$diagnosticStart.RedirectStandardOutput = $true
$diagnosticStart.RedirectStandardError = $true
$diagnosticProcess = [Diagnostics.Process]::new()
$diagnosticProcess.StartInfo = $diagnosticStart
try {
    if (-not $diagnosticProcess.Start()) { throw 'Staged executable diagnostics did not start' }
    $diagnosticOutput = $diagnosticProcess.StandardOutput.ReadToEndAsync()
    $diagnosticErrors = $diagnosticProcess.StandardError.ReadToEndAsync()
    if (-not $diagnosticProcess.WaitForExit(45000)) {
        $diagnosticProcess.Kill($true)
        throw 'Staged executable diagnostics timed out; packaging stopped'
    }
    if ($diagnosticProcess.ExitCode -ne 0) { throw 'Staged executable diagnostics failed; packaging stopped' }
    $diagnosticReport = $diagnosticOutput.GetAwaiter().GetResult() | ConvertFrom-Json
    if ($diagnosticReport.version -ne $PackageVersion -or
        $diagnosticReport.bundledTools -ne $true -or
        $diagnosticReport.mediaSmokeTest -ne $true -or
        $diagnosticReport.networkStarted -ne $false) {
        throw 'Staged executable diagnostics reported incomplete/wrong payload'
    }
    Write-Output 'Actual staged executable and bundled H.264/AAC media-tool smoke test passed; no network initialization.'
} finally { $diagnosticProcess.Dispose() }
[xml]$manifest = Get-Content -LiteralPath (Join-Path $repo 'anirium-service/msix/AppxManifest.xml') -Raw
$manifest.Package.Identity.Version = $PackageVersion
$manifest.Save((Join-Path $payload 'AppxManifest.xml'))
# Generate required package icon sizes from the existing Anirium icon.
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Image]::FromFile((Join-Path $repo 'public/assets/logos/Anirium-favicon.png'))
try {
    foreach ($entry in @(@('StoreLogo.png', 50), @('Square150x150Logo.png', 150), @('Square44x44Logo.png', 44))) {
        $size = [int]$entry[1]
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $canvas = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $canvas.Clear([System.Drawing.Color]::Transparent)
            $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $canvas.DrawImage($icon, 0, 0, $size, $size)
            $bitmap.Save((Join-Path $assets $entry[0]), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $canvas.Dispose(); $bitmap.Dispose() }
    }
} finally { $icon.Dispose() }
$package = Join-Path $stage "Anirium-Service-$PackageVersion-store.msix"
& $MakeAppxPath pack /d $payload /p $package
if ($LASTEXITCODE -ne 0) { throw 'MakeAppx validation/packaging failed' }
$hash = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash
Write-Output "MSIX staging candidate: $package SHA256=$hash"
Write-Output 'Not installed, submitted or certified. Media redistribution review and installed-package acceptance remain required.'
