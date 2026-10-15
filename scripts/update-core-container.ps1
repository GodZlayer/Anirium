param(
  [Parameter(Mandatory)][ValidatePattern('^anirium-core:[A-Za-z0-9._-]+$')][string]$Image,
  [Parameter(Mandatory)][string]$ExpectedCurrentImage,
  [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'

# This launcher deliberately targets the verified, currently deployed topology.
# It reads credentials from Docker in memory, never writes them to disk/logs,
# never recreates PostgreSQL and retains the previous Core for rollback.
function Invoke-DockerChecked([string[]]$Arguments) {
  $result = & docker @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Docker operation failed: $($Arguments[0])" }
  return $result
}
function Read-Container([string]$Name) {
  return (Invoke-DockerChecked @('inspect', $Name) | ConvertFrom-Json)[0]
}
function Assert-Preserved($Before, $After) {
  if (@(Compare-Object ($Before.Config.Env | Sort-Object) ($After.Config.Env | Sort-Object)).Count) {
    throw 'Environment changed; refusing replacement'
  }
  $a = @($Before.Mounts | ForEach-Object { "$($_.Type)|$($_.Name)|$($_.Destination)|$($_.RW)" } | Sort-Object)
  $b = @($After.Mounts | ForEach-Object { "$($_.Type)|$($_.Name)|$($_.Destination)|$($_.RW)" } | Sort-Object)
  if (@(Compare-Object $a $b).Count) { throw 'Persistent mounts changed' }
}
$before = Read-Container 'anirium_core'
if (-not $before.State.Running -or $before.Config.Image -ne $ExpectedCurrentImage) {
  throw 'Unexpected current Core state/image; inspect before deployment'
}
$networks = @($before.NetworkSettings.Networks.PSObject.Properties)
if ($networks.Count -ne 1 -or $networks[0].Name -ne 'animeflix_anirium_network') { throw 'Unsupported network topology' }
$ports = @($before.HostConfig.PortBindings.PSObject.Properties)
if ($ports.Count -ne 1 -or $ports[0].Name -ne '3000/tcp' -or $ports[0].Value.Count -ne 1 -or $ports[0].Value[0].HostPort -ne '3050' -or $ports[0].Value[0].HostIp -notin @('', '0.0.0.0')) { throw 'Unsupported port topology' }
if ($before.HostConfig.RestartPolicy.Name -ne 'unless-stopped') { throw 'Unexpected restart policy' }
$mounts = @($before.Mounts)
if ($mounts.Count -ne 2 -or @($mounts | Where-Object { $_.Type -ne 'volume' }).Count) { throw 'Unsupported mount topology' }
if (-not ($mounts | Where-Object { $_.Name -eq 'animeflix_anirium_data' -and $_.Destination -eq '/app/data' -and $_.RW })) { throw 'Data volume missing' }
if (-not ($mounts | Where-Object { $_.Name -eq 'anirium_integration_secrets' -and $_.Destination -eq '/run/anirium' -and -not $_.RW })) { throw 'Read-only keyring/CA volume missing' }
if ('ANIRIUM_DB_TLS=required' -notin $before.Config.Env) { throw 'Verified database TLS configuration missing' }
$null = Invoke-DockerChecked @('image', 'inspect', $Image)
if ($ValidateOnly) { Write-Output 'Core image/topology validated; no changes made.'; return }

$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$candidate = "anirium_core_candidate_$suffix"
$rollback = "anirium_core_previous_$suffix"
$argsList = @('create', '--name', $candidate, '--restart', 'unless-stopped', '--network', 'animeflix_anirium_network', '--network-alias', 'anirium-core', '-p', '3050:3000')
foreach ($entry in $before.Config.Env) { $argsList += @('--env', $entry) }
foreach ($mount in $mounts) {
  $value = "type=volume,src=$($mount.Name),dst=$($mount.Destination)"
  if (-not $mount.RW) { $value += ',readonly' }
  $argsList += @('--mount', $value)
}
$argsList += $Image
$null = Invoke-DockerChecked $argsList
Assert-Preserved $before (Read-Container $candidate)
$oldRenamed = $false
$candidateRenamed = $false
try {
  $null = Invoke-DockerChecked @('stop', 'anirium_core')
  $null = Invoke-DockerChecked @('rename', 'anirium_core', $rollback)
  $oldRenamed = $true
  $null = Invoke-DockerChecked @('rename', $candidate, 'anirium_core')
  $candidateRenamed = $true
  $null = Invoke-DockerChecked @('start', 'anirium_core')
  $healthy = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $response = Invoke-WebRequest 'http://127.0.0.1:3050/' -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $healthy) { throw 'Replacement failed HTTP readiness' }
  Assert-Preserved $before (Read-Container 'anirium_core')
  Write-Output "Core updated: $Image; rollback retained: $rollback; environment/mounts preserved."
} catch {
  if ($candidateRenamed) {
    $null = Invoke-DockerChecked @('stop', 'anirium_core')
    $null = Invoke-DockerChecked @('rename', 'anirium_core', $candidate)
  }
  if ($oldRenamed) { $null = Invoke-DockerChecked @('rename', $rollback, 'anirium_core') }
  $null = Invoke-DockerChecked @('start', 'anirium_core')
  throw 'Deployment failed; previous Core restored; candidate retained for inspection.'
}
