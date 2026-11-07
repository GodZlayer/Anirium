$env:ANIRIUM_CORE_URL = "http://127.0.0.1:8080"
$env:ANIRIUM_PROVIDER_LOCAL_ORIGINS = "http://127.0.0.1:4001"
Start-Process -FilePath "c:\Users\santo\Documents\Anirium-App\anirium-service\anirium-service.exe" -ArgumentList "-port 4004 -headless -data-dir C:\Users\santo\AppData\Local\Anirium\data" -WindowStyle Hidden
Start-Sleep -Seconds 2
Get-Process -Name "anirium-service" | Select-Object Id, ProcessName, Path
