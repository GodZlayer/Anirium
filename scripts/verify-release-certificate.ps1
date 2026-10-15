$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'release-certificate.ps1')
function New-CertificateFixture {
    [pscustomobject]@{
        HasPrivateKey = $true
        NotBefore = (Get-Date).AddDays(-1)
        NotAfter = (Get-Date).AddDays(1)
        Subject = 'CN=Fixture Publisher'
        Issuer = 'CN=Fixture Issuer'
        Extensions = @([pscustomobject]@{
            Oid = [pscustomobject]@{ Value = '2.5.29.37' }
            EnhancedKeyUsages = @([pscustomobject]@{ Value = '1.3.6.1.5.5.7.3.3' })
        })
    }
}
Assert-ReleaseCertificate (New-CertificateFixture)
foreach ($invalid in @('development', 'development-spaced', 'self-issued', 'expired', 'future', 'no-key', 'no-usage', 'other-usage')) {
    $fixture = New-CertificateFixture
    switch ($invalid) {
        'development' { $fixture.Subject = 'CN=TGAnalyzerDevelopmentOnly' }
        'development-spaced' { $fixture.Subject = 'CN=Development Only' }
        'self-issued' { $fixture.Issuer = $fixture.Subject }
        'expired' { $fixture.NotAfter = (Get-Date).AddMinutes(-1) }
        'future' { $fixture.NotBefore = (Get-Date).AddMinutes(1) }
        'no-key' { $fixture.HasPrivateKey = $false }
        'no-usage' { $fixture.Extensions = @() }
        'other-usage' { $fixture.Extensions[0].EnhancedKeyUsages[0].Value = '1.3.6.1.5.5.7.3.1' }
    }
    $rejected = $false
    try { Assert-ReleaseCertificate $fixture } catch { $rejected = $true }
    if (-not $rejected) { throw "Certificate preflight accepted invalid fixture: $invalid" }
}
Write-Output 'Release certificate preflight verified with fixtures; no certificates were created or modified.'
