# Script de Sincronização Diária e Geração de Parquets Modulares
# Executado no Core Server para regenerar e publicar o catálogo estático

$ErrorActionPreference = "Stop"
Write-Host "== [Anirium Core] Iniciando Sincronização e Geração de Parquets ==" -ForegroundColor Cyan

# 1. Executa o exportador canônico de Parquet
python scripts/export-catalog-parquet.py

# 2. Verifica se os arquivos foram gerados com sucesso
$popular = Get-Item "public/data/catalog-popular.parquet" -ErrorAction SilentlyContinue
$archive = Get-Item "public/data/catalog-archive.parquet" -ErrorAction SilentlyContinue

if ($popular -and $archive) {
    Write-Host "Parquet popular gerado: $($popular.Length / 1KB) KB" -ForegroundColor Green
    Write-Host "Parquet acervo gerado: $($archive.Length / 1KB) KB" -ForegroundColor Green
    Write-Host "== [Anirium Core] Sincronização e exportação finalizadas com sucesso! ==" -ForegroundColor Cyan
} else {
    Write-Error "Falha ao gerar os arquivos Parquet modulares."
}
