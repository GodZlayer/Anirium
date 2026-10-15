$ErrorActionPreference = 'Stop'
# Pinned upstream WinLibs asset/digest, not a moving latest download.
$toolchainTag = '16.2.0posix-14.0.0-ucrt-r2'
$archiveName = 'winlibs-x86_64-posix-seh-gcc-16.2.0-mingw-w64ucrt-14.0.0-r2.zip'
$expectedSHA256 = 'd5dbafc4a170e762ca6143151ec918fb9e2c72736fb14cd704abebc6bdd5276a'
$workspaceRoot = Split-Path $PSScriptRoot -Parent
$cacheRoot = Join-Path $workspaceRoot '.toolcache'
New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
$archive = Join-Path $cacheRoot $archiveName
if (-not (Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest -Uri "https://github.com/brechtsanders/winlibs_mingw/releases/download/$toolchainTag/$archiveName" -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedSHA256) {
    throw 'Compiler archive hash mismatch. Nothing was extracted or executed; inspect the local archive before retrying.'
}
$destination = Join-Path $cacheRoot "winlibs-$toolchainTag"
$compiler = Join-Path $destination 'mingw64/bin/gcc.exe'
if (-not (Test-Path -LiteralPath $destination)) {
    $entries = & tar.exe -tf $archive
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list compiler archive' }
    foreach ($entry in $entries) {
        if ($entry -notmatch '^mingw64/' -or $entry -match '(^|[/\\])\.\.([/\\]|$)|^[A-Za-z]:') {
            throw "Unsafe compiler archive entry: $entry"
        }
    }
    New-Item -ItemType Directory -Path $destination | Out-Null
    & tar.exe -xf $archive -C $destination
    if ($LASTEXITCODE -ne 0) { throw 'Compiler extraction failed; partial cache retained for inspection' }
}
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'Incomplete compiler cache; inspect it rather than overwriting automatically' }
$synchronization = (& $compiler --print-file-name libsynchronization.a).Trim()
if ($LASTEXITCODE -ne 0 -or -not [IO.Path]::IsPathRooted($synchronization) -or
    -not (Test-Path -LiteralPath $synchronization -PathType Leaf)) { throw 'Compiler does not meet the Go Windows race runtime requirement' }
& $compiler --version
if ($LASTEXITCODE -ne 0) { throw 'Compiler execution failed' }
Write-Output "Portable compiler ready: $compiler"
Write-Output 'No machine/user PATH or persistent Go configuration was changed.'
