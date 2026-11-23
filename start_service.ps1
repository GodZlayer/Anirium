$env:ANIRIUM_CORE_URL = "http://127.0.0.1:8080"
$env:ANIRIUM_PROVIDER_LOCAL_ORIGINS = "http://127.0.0.1:4001"
$env:ANIRIUM_CONTINUOUS_BUFFER = "1"
Start-Process -FilePath "$PSScriptRoot\anirium-service\anirium-service.exe"
Start-Sleep -Seconds 2
Get-Process -Name "anirium-service" | Select-Object Id, ProcessName, Path
