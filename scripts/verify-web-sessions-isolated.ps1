param([switch]$PrivateDataOnly,[switch]$CoreFlowOnly,[switch]$RuntimeOnly,[switch]$RestoreOnly,[switch]$ScheduleOnly,[switch]$MediaRefreshOnly,[switch]$ImdbOnly)
$ErrorActionPreference = 'Stop'
if ($ImdbOnly -and ($PrivateDataOnly -or $CoreFlowOnly -or $RuntimeOnly -or $RestoreOnly -or $ScheduleOnly -or $MediaRefreshOnly)) { throw 'Choose one isolated test scope' }
if ($MediaRefreshOnly -and ($PrivateDataOnly -or $CoreFlowOnly -or $RuntimeOnly -or $RestoreOnly -or $ScheduleOnly)) { throw 'Choose one isolated test scope' }
if ($ScheduleOnly -and ($PrivateDataOnly -or $CoreFlowOnly -or $RuntimeOnly -or $RestoreOnly)) { throw 'Choose one isolated test scope' }
if ($PrivateDataOnly -and $CoreFlowOnly) { throw 'Choose one isolated test scope' }
if ($RuntimeOnly -and ($PrivateDataOnly -or $CoreFlowOnly)) { throw 'Choose one isolated test scope' }
if ($RestoreOnly -and ($PrivateDataOnly -or $CoreFlowOnly -or $RuntimeOnly)) { throw 'Choose one isolated test scope' }
$fixtureName = 'anirium-session-fixture-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$fixturePassword = [Guid]::NewGuid().ToString('N')
$priorDatabase = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
$priorDataKeyring = [Environment]::GetEnvironmentVariable('ANIRIUM_DATA_KEYRING_FILE', 'Process')
$priorIdentityKeyring = [Environment]::GetEnvironmentVariable('ANIRIUM_IDENTITY_KEYRING_FILE', 'Process')
$fixtureIdentityKeyring = Join-Path ([IO.Path]::GetTempPath()) ('anirium-identity-fixture-' + [Guid]::NewGuid().ToString('N') + '.json')
$fixtureIdentityKeyBytes = New-Object byte[] 32
$fixtureDataKeyring = Join-Path ([IO.Path]::GetTempPath()) ('anirium-fixture-keyring-' + [Guid]::NewGuid().ToString('N') + '.json')
$fixtureKeyBytes = New-Object byte[] 32
try {
    $fixtureKeyRng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $fixtureKeyRng.GetBytes($fixtureKeyBytes); $fixtureKeyRng.GetBytes($fixtureIdentityKeyBytes) } finally { $fixtureKeyRng.Dispose() }
    $fixtureKeyJson = @{activeKeyId='fixture'; keys=@(@{id='fixture';key=[Convert]::ToBase64String($fixtureKeyBytes)})} | ConvertTo-Json -Depth 4 -Compress
    [IO.File]::WriteAllText($fixtureDataKeyring, $fixtureKeyJson, (New-Object Text.UTF8Encoding $false))
    $fixtureKeySid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $fixtureDataKeyring /inheritance:r /grant:r ('*' + $fixtureKeySid + ':F') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Fixture key ACL failed' }
    [Environment]::SetEnvironmentVariable('ANIRIUM_DATA_KEYRING_FILE', $fixtureDataKeyring, 'Process')
    $identityKeyJson = @{activeKeyId='fixture'; keys=@(@{id='fixture';key=[Convert]::ToBase64String($fixtureIdentityKeyBytes)})} | ConvertTo-Json -Depth 4 -Compress
    [IO.File]::WriteAllText($fixtureIdentityKeyring, $identityKeyJson, (New-Object Text.UTF8Encoding $false))
    & icacls $fixtureIdentityKeyring /inheritance:r /grant:r ('*' + $fixtureKeySid + ':F') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Fixture identity key ACL failed' }
    [Environment]::SetEnvironmentVariable('ANIRIUM_IDENTITY_KEYRING_FILE', $fixtureIdentityKeyring, 'Process')
    docker run --rm -d --name $fixtureName --label 'anirium.test=session-isolated' --tmpfs /var/lib/postgresql/data -p '127.0.0.1::5432' -e "POSTGRES_PASSWORD=$fixturePassword" -e 'POSTGRES_DB=anirium_security_fixture' postgres:16-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated PostgreSQL' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        docker exec $fixtureName pg_isready -U postgres -d anirium_security_fixture *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Isolated PostgreSQL did not become ready' }
    $fixtureInfo = (docker inspect $fixtureName | ConvertFrom-Json)[0]
    $fixturePort = $fixtureInfo.NetworkSettings.Ports.'5432/tcp'[0].HostPort
    [Environment]::SetEnvironmentVariable('DATABASE_URL', "postgresql://postgres:$fixturePassword@127.0.0.1:$fixturePort/anirium_security_fixture", 'Process')
    if ($ImdbOnly) {
      node scripts/verify-imdb-process.mjs
      if ($LASTEXITCODE -ne 0) { throw 'IMDb process tests failed' }
      return
    }
    if ($MediaRefreshOnly) {
      node scripts/verify-media-refresh-process.mjs
      if ($LASTEXITCODE -ne 0) { throw 'Metadata refresh process tests failed' }
      return
    }
    if ($ScheduleOnly) {
      node scripts/verify-airing-schedule-process.mjs
      if ($LASTEXITCODE -ne 0) { throw 'Periodic schedule process tests failed' }
      return
    }
    if ($RuntimeOnly -or $RestoreOnly) {
      if ($RestoreOnly) { node scripts/verify-canonical-runtime.mjs --sql-seed-only }
      else { node scripts/verify-canonical-runtime.mjs }
      if ($LASTEXITCODE -ne 0) { throw 'Canonical runtime tests failed' }
      if ($RestoreOnly) {
        node scripts/seed-unified-restore-fixture.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Unified restore fixture failed' }
        docker exec $fixtureName pg_dump -U postgres -d anirium_security_fixture --format=custom --file=/tmp/anirium-fixture.dump
        if ($LASTEXITCODE -ne 0) { throw 'Fixture backup failed' }
        docker exec $fixtureName createdb -U postgres anirium_restore_fixture
        if ($LASTEXITCODE -ne 0) { throw 'Restore fixture creation failed' }
        docker exec $fixtureName pg_restore -U postgres -d anirium_restore_fixture --exit-on-error /tmp/anirium-fixture.dump
        if ($LASTEXITCODE -ne 0) { throw 'Fixture restore failed' }
        node scripts/verify-canonical-restore.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Canonical restore comparison failed' }
      }
      return
    }
    if ($CoreFlowOnly) {
    node scripts/verify-core-playback-flow.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Playback authorization regression failed' }
    }
    if (-not $PrivateDataOnly -and -not $CoreFlowOnly) {
    node scripts/verify-web-sessions.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Session integration tests failed' }
    node scripts/verify-core-playback-flow.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Playback authorization regression failed' }
    node scripts/verify-service-tokens.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Service token reasons failed' }
    node scripts/verify-service-leases.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Service lease regression failed' }
    }
    if (-not $CoreFlowOnly) {
    node scripts/verify-private-data-db.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Private data integration tests failed' }
    }
    if (-not $PrivateDataOnly -and -not $CoreFlowOnly) {
    node scripts/verify-write-budget-db.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Distributed write budgets failed' }
    node scripts/verify-database-limits-db.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Database operation limits failed' }
    }
} finally {
    [Environment]::SetEnvironmentVariable('DATABASE_URL', $priorDatabase, 'Process')
    [Environment]::SetEnvironmentVariable('ANIRIUM_DATA_KEYRING_FILE', $priorDataKeyring, 'Process')
    [Environment]::SetEnvironmentVariable('ANIRIUM_IDENTITY_KEYRING_FILE', $priorIdentityKeyring, 'Process')
    [Array]::Clear($fixtureIdentityKeyBytes, 0, $fixtureIdentityKeyBytes.Length)
    if (Test-Path -LiteralPath $fixtureIdentityKeyring) { Remove-Item -LiteralPath $fixtureIdentityKeyring }
    [Array]::Clear($fixtureKeyBytes, 0, $fixtureKeyBytes.Length)
    if (Test-Path -LiteralPath $fixtureDataKeyring) { Remove-Item -LiteralPath $fixtureDataKeyring }
    $cleanupInfo = docker inspect $fixtureName 2>$null | ConvertFrom-Json
    if ($cleanupInfo -and $cleanupInfo[0].Name -eq "/$fixtureName" -and $cleanupInfo[0].Config.Labels.'anirium.test' -eq 'session-isolated') {
        docker rm -f $fixtureName | Out-Null
    }
}
