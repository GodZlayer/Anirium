function Assert-ReleaseCertificate {
    param([Parameter(Mandatory)]$Certificate)
    $now = Get-Date
    if (-not $Certificate.HasPrivateKey -or $Certificate.NotBefore -gt $now -or $Certificate.NotAfter -le $now) {
        throw 'Publisher certificate must have a private key and be currently valid'
    }
    if ($Certificate.Subject -match 'Development\s*Only' -or $Certificate.Subject -eq $Certificate.Issuer) {
        throw 'Development or self-issued certificates cannot sign a public release'
    }
    $usage = @($Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' })
    $codeSigning = @($usage | ForEach-Object { $_.EnhancedKeyUsages } | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' })
    if ($codeSigning.Count -eq 0) {
        throw 'Publisher certificate must explicitly permit code signing'
    }
    # This preflight is not proof of public CA trust. SignTool and Authenticode
    # verification of the timestamped executable remain mandatory afterward.
}
