param(
    [switch]$IncludeArchive
)

$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot

$targets = @(
    ".tmp\runtime",
    ".tmp\pycache",
    ".tmp\pytest-cache",
    ".tmp\pytest-current",
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
        Remove-Item -LiteralPath $fullPath -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $fullPath) {
            Write-Warning "Could not remove $relativePath"
        } else {
            Write-Host "Removed $relativePath"
        }
    }
}

foreach ($pattern in $directoryPatterns) {
    Get-ChildItem -LiteralPath $root -Directory -Force -Filter $pattern |
        Where-Object { $_.Name -ne ".tmp" } |
        ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $_.FullName) {
            Write-Warning "Could not remove $($_.Name)"
        } else {
            Write-Host "Removed $($_.Name)"
        }
    }
}

Write-Host "Cleanup complete."
