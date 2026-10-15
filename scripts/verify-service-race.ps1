param([string]$CompilerPath)
$ErrorActionPreference = 'Stop'
if (-not $CompilerPath) {
    $compilerCommand = Get-Command gcc.exe -ErrorAction SilentlyContinue
    if ($compilerCommand) { $CompilerPath = $compilerCommand.Source }
}
if (-not $CompilerPath -or -not (Test-Path -LiteralPath $CompilerPath -PathType Leaf)) {
    throw 'Specify CompilerPath to a supported Windows GCC; scripts/setup-service-race-toolchain.ps1 prepares a local portable compiler.'
}
$CompilerPath = (Resolve-Path -LiteralPath $CompilerPath).Path
$synchronization = (& $CompilerPath --print-file-name libsynchronization.a).Trim()
if ($LASTEXITCODE -ne 0 -or -not [IO.Path]::IsPathRooted($synchronization) -or
    -not (Test-Path -LiteralPath $synchronization -PathType Leaf)) { throw 'Compiler lacks the required mingw-w64 synchronization runtime' }
$previousCC = $env:CC
$previousCGO = $env:CGO_ENABLED
$previousPath = $env:PATH
Push-Location (Join-Path (Split-Path $PSScriptRoot -Parent) 'anirium-service')
try {
    $env:CC = $CompilerPath
    $env:CGO_ENABLED = '1'
    $env:PATH = (Split-Path $CompilerPath -Parent) + ';' + $previousPath
    go test -race -count=1 -timeout=3m -v ./...
    if ($LASTEXITCODE -ne 0) { throw 'Service concurrency validation failed; no release was published' }
} finally {
    $env:CC = $previousCC
    $env:CGO_ENABLED = $previousCGO
    $env:PATH = $previousPath
    Pop-Location
}
