param(
  [Parameter(Mandatory)][int]$ServiceProcessId
)
$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $ServiceProcessId
if (-not $taskProcess.Path -or [IO.Path]::GetFileName($taskProcess.Path) -notlike 'anirium-service*.exe') {
  throw 'O PID informado não corresponde ao Anirium Service.'
}
$taskStarted = $taskProcess.StartTime.ToUniversalTime()
$taskMatches = @()
foreach ($taskDirectory in Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'anirium-torrent-runtime-*') {
  if ($taskDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
  $taskOwnerPath = Join-Path $taskDirectory.FullName 'runtime-owner.json'
  if (-not (Test-Path -LiteralPath $taskOwnerPath -PathType Leaf)) { continue }
  try { $taskOwner = Get-Content -LiteralPath $taskOwnerPath -Raw | ConvertFrom-Json } catch { continue }
  if ($taskOwner.pid -ne $ServiceProcessId) { continue }
  $taskCreated = if ($taskOwner.createdAt -is [DateTime]) {
    $taskOwner.createdAt.ToUniversalTime()
  } else {
    [DateTimeOffset]::Parse($taskOwner.createdAt, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime
  }
  if ($taskCreated -lt $taskStarted -or $taskCreated -gt [DateTime]::UtcNow) { continue }
  $taskFiles = @(Get-ChildItem -LiteralPath $taskDirectory.FullName -Recurse -File |
    Where-Object { $_.Name -ne 'runtime-owner.json' })
  $taskBytes = ($taskFiles | Measure-Object -Property Length -Sum).Sum
  $taskMatches += @{ bytes = [long]$taskBytes; files = $taskFiles.Count; createdAt = $taskCreated.ToString('o') }
}
# No ownership record means no attribution, even if an old directory is large.
@{
  pid = $ServiceProcessId
  status = $(if ($taskMatches.Count) { 'owned-cache-observed' } else { 'ownership-unavailable' })
  caches = $taskMatches
  observedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json -Depth 4
