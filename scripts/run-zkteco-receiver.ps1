$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot "apps\api"
$python = Join-Path $apiRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    throw "API virtual environment not found: $python"
}

Set-Location $apiRoot
& $python -m uvicorn main:app --host 0.0.0.0 --port 7074
