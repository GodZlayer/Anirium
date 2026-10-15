param(
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Publisher,
    [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+(\.\d+)?$')][string]$ReleaseVersion,
    [Parameter(Mandatory)][string]$MediaToolsDir,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$CertificateThumbprint,
    [Parameter(Mandatory)][string]$SignToolPath,
    [Parameter(Mandatory)][string]$InnoCompilerPath,
    [string]$CCompilerPath,
    [string]$TimestampURL = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
# Inno's signing command is interpreted externally. Reject command metacharacters
# instead of interpolating an unsafe path, URL or publisher into that command.
foreach ($value in @($Publisher, $MediaToolsDir, $SignToolPath, $InnoCompilerPath, $TimestampURL)) {
    if ($value -match '["$&|<>^%!\r\n]') { throw 'Unsupported command metacharacter in installer configuration' }
}
if (-not (Test-Path -LiteralPath $InnoCompilerPath -PathType Leaf)) { throw 'Inno Setup compiler not found; nothing was published' }
if (-not (Test-Path -LiteralPath $SignToolPath -PathType Leaf)) { throw 'Windows SDK SignTool not found; nothing was published' }
$InnoCompilerPath = (Resolve-Path -LiteralPath $InnoCompilerPath).Path
$SignToolPath = (Resolve-Path -LiteralPath $SignToolPath).Path
$MediaToolsDir = (Resolve-Path -LiteralPath $MediaToolsDir).Path
foreach ($resolvedPath in @($MediaToolsDir, $SignToolPath, $InnoCompilerPath, $PSScriptRoot)) {
    if ($resolvedPath -match '["$&|<>^%!\r\n]') { throw 'Unsupported command metacharacter in resolved installer path' }
}
$timestampUri = $null
if (-not [Uri]::TryCreate($TimestampURL, [UriKind]::Absolute, [ref]$timestampUri) -or
    $timestampUri.Scheme -notin @('http', 'https')) { throw 'Invalid timestamp URL' }

function Assert-TrustedExecutable([string]$Path, [switch]$RequirePublisher) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required executable missing: $Path" }
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) {
        throw "Executable is not trusted/signed: $Path"
    }
    if ($RequirePublisher -and ($signature.SignerCertificate.Thumbprint -ne $CertificateThumbprint -or
        -not $signature.TimeStamperCertificate)) { throw "Publisher/timestamp signature mismatch: $Path" }
    & $SignToolPath verify /pa /all $Path
    if ($LASTEXITCODE -ne 0) { throw "SignTool verification failed: $Path" }
}

$license = Join-Path $MediaToolsDir 'LICENSE.txt'
if (-not (Test-Path -LiteralPath $license -PathType Leaf) -or (Get-Item -LiteralPath $license).Length -eq 0) {
    throw 'A redistribution-reviewed FFmpeg package with non-empty LICENSE.txt is required'
}
# Only these binaries are bundled. Do not silently sign third-party software
# using the publisher identity; supply reviewed, already trusted input binaries.
foreach ($name in @('ffmpeg.exe', 'ffprobe.exe')) {
    Assert-TrustedExecutable (Join-Path $MediaToolsDir $name)
}
$installerRoot = Split-Path $PSScriptRoot -Parent
$stageDir = Join-Path $installerRoot "anirium-service/release/$ReleaseVersion"
if (Test-Path -LiteralPath $stageDir) { throw 'Version staging directory already exists; use a new version or inspect the prior build' }

& (Join-Path $PSScriptRoot 'build-service.ps1') -RequireSignature -StageOnly `
    -ReleaseVersion $ReleaseVersion -CertificateThumbprint $CertificateThumbprint -SignToolPath $SignToolPath -CCompilerPath $CCompilerPath -TimestampURL $TimestampURL
$serviceBinary = Join-Path $installerRoot 'anirium-service/anirium-service.exe'
Assert-TrustedExecutable $serviceBinary -RequirePublisher
New-Item -ItemType Directory -Path $stageDir | Out-Null
# $q and $f are Inno placeholders, intentionally kept literal for its compiler.
$signCommand = '$q{0}$q sign /sha1 {1} /s My /fd SHA256 /tr $q{2}$q /td SHA256 $f' -f $SignToolPath, $CertificateThumbprint, $TimestampURL
$compilerArgs = @('/Q', "/DPublisher=$Publisher", "/DReleaseVersion=$ReleaseVersion",
    "/DMediaToolsDir=$MediaToolsDir", "/DStageDir=$stageDir", "/Sanirium=$signCommand",
    (Join-Path $installerRoot 'anirium-service/installer.iss'))
& $InnoCompilerPath @compilerArgs
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation/signing failed; staging retained, nothing was published' }
$installer = Join-Path $stageDir 'anirium-service-setup.exe'
Assert-TrustedExecutable $installer -RequirePublisher
$uninstallers = @(Get-ChildItem -LiteralPath $stageDir -Filter '*.e32' -File)
if ($uninstallers.Count -eq 0) {
    throw 'Signed uninstaller artifact missing; installer is not accepted, nothing was published'
}
foreach ($uninstaller in $uninstallers) {
    Assert-TrustedExecutable $uninstaller.FullName -RequirePublisher
}
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$versionedName = "anirium-service-setup-$ReleaseVersion-$($hash.Substring(0, 12)).exe"
$versionedPath = Join-Path $stageDir $versionedName
Move-Item -LiteralPath $installer -Destination $versionedPath
Write-Output "Signed installer staged: $versionedPath SHA256=$hash"
Write-Output 'Silent install parameters: /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-'
Write-Output 'No public download or Partner Center submission changed. Clean-Windows acceptance and Microsoft certification remain required.'
