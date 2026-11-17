# Thin wrapper — deploy the nebi setup into ~/.claude on Windows.
# Requires Node 18+. Runs the real work in deploy.mjs.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js is required but not on PATH. Install Node 18+ and re-run."
  exit 1
}
& node deploy.mjs @args
exit $LASTEXITCODE
