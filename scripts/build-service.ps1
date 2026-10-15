param(
    [switch]$RequireSignature,
	[switch]$StageOnly,
    [ValidatePattern('^\d+\.\d+\.\d+(\.\d+)?$')][string]$ReleaseVersion = '2.2.0',
    [string]$CertificateThumbprint,
    [string]$SignToolPath,
    [string]$CCompilerPath,
    [string]$TimestampURL = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-certificate.ps1')
& (Join-Path $PSScriptRoot 'verify-release-certificate.ps1')
if ($RequireSignature -and -not $CertificateThumbprint) {
    throw 'Specify the real publisher CertificateThumbprint for a signed release. Download was not updated.'
}
if ($CertificateThumbprint) {
    $CertificateThumbprint = $CertificateThumbprint.Replace(' ', '')
    if ($CertificateThumbprint -notmatch '^[0-9a-fA-F]{40}$') { throw 'Invalid certificate thumbprint' }
    $publisherCertificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$CertificateThumbprint"
    Assert-ReleaseCertificate $publisherCertificate
    if (-not $SignToolPath) {
        $signToolCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
        if ($signToolCommand) { $SignToolPath = $signToolCommand.Source }
    }
    if (-not $SignToolPath -or -not (Test-Path -LiteralPath $SignToolPath -PathType Leaf)) {
        throw 'Specify SignToolPath pointing to the Windows SDK signtool.exe'
    }
    $timestampUri = $null
    if (-not [Uri]::TryCreate($TimestampURL, [UriKind]::Absolute, [ref]$timestampUri) -or
        $timestampUri.Scheme -notin @('http', 'https')) { throw 'Invalid timestamp URL' }
}
$releaseRoot = Split-Path $PSScriptRoot -Parent
Push-Location $releaseRoot
try {
    node scripts/verify-media-boundaries.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Architecture verification failed' }
    node scripts/verify-installer-boundaries.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Installer publication boundary verification failed' }
    node scripts/verify-service-tokens.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Token verification failed' }
    node scripts/verify-official-sources.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Official source verification failed' }
    if ($RequireSignature -or $CertificateThumbprint -or $env:DATABASE_URL) {
        node scripts/verify-service-leases.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Persistent session verification failed' }
    }
    Push-Location (Join-Path $releaseRoot 'anirium-service')
    try {
        go vet ./...
        if ($LASTEXITCODE -ne 0) { throw 'Service static analysis failed' }
        go test -count=1 -timeout=3m -v ./...
        if ($LASTEXITCODE -ne 0) { throw 'Service tests failed' }
        if ($RequireSignature -or $CertificateThumbprint) {
            & (Join-Path $PSScriptRoot 'verify-service-race.ps1') -CompilerPath $CCompilerPath
        }
        go build -trimpath -ldflags "-H=windowsgui -X main.serviceVersion=$ReleaseVersion" -o anirium-service.exe .
        if ($LASTEXITCODE -ne 0) { throw 'Service build failed' }
    } finally { Pop-Location }
    $releaseBinary = Join-Path $releaseRoot 'anirium-service/anirium-service.exe'
    if ($CertificateThumbprint) {
        & $SignToolPath sign /sha1 $CertificateThumbprint /s My /fd SHA256 /tr $TimestampURL /td SHA256 $releaseBinary
        if ($LASTEXITCODE -ne 0) { throw 'Publisher signing failed. Download was not updated.' }
        & $SignToolPath verify /pa /all $releaseBinary
        if ($LASTEXITCODE -ne 0) { throw 'Publisher signature verification failed. Download was not updated.' }
    }
    $releaseSignature = Get-AuthenticodeSignature -LiteralPath $releaseBinary
    if (($RequireSignature -or $CertificateThumbprint) -and
        ($releaseSignature.Status -ne 'Valid' -or -not $releaseSignature.TimeStamperCertificate)) {
        throw 'Release requires a valid publisher signature. Download was not updated.'
    }
    $releaseHash = (Get-FileHash -LiteralPath $releaseBinary -Algorithm SHA256).Hash
    if (-not $CertificateThumbprint) {
        Write-Output "Development build only. SHA256=$releaseHash Signature=$($releaseSignature.Status). Public download was not updated."
        return
    }
    # Signing a component is not media acceptance, installer validation or
    # Microsoft certification. Keep every build staged; publication must use
    # the approved installer through a separate verified release workflow.
    Write-Output "Signed staging build only. SHA256=$releaseHash. Public download was not updated."
} finally { Pop-Location }
