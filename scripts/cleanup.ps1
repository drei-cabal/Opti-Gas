param(
    [switch]$IncludeArchive
)

$ErrorActionPreference = "SilentlyContinue"

$root = Split-Path -Parent $PSScriptRoot

$targets = @(
    ".tmp",
    "__pycache__",
    "scripts\__pycache__",
    "tests\__pycache__",
    "utils\__pycache__",
    ".pytest_cache"
)

$directoryPatterns = @(
    "pytest-cache-files-*",
    "tmp*"
)

if ($IncludeArchive) {
    $targets += "archive"
}

foreach ($relativePath in $targets) {
    $fullPath = Join-Path $root $relativePath
    if (Test-Path -LiteralPath $fullPath) {
        Remove-Item -LiteralPath $fullPath -Recurse -Force
        Write-Host "Removed $relativePath"
    }
}

foreach ($pattern in $directoryPatterns) {
    Get-ChildItem -LiteralPath $root -Directory -Force -Filter $pattern | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
        Write-Host "Removed $($_.Name)"
    }
}

Write-Host "Cleanup complete."
