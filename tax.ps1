param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet("up", "ui", "workbook", "down", "status")]
  [string]$Action,

  [Parameter(Position = 1)]
  [string]$CsvPath,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$GeneratorOptions = @()
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repoRoot

function Invoke-Compose([string[]]$ComposeArgs) {
  & docker compose @ComposeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($ComposeArgs -join ' ') failed."
  }
}

function Get-AppUrl {
  $port = $env:APP_PORT
  if (-not $port -and (Test-Path ".env")) {
    $portLine = Get-Content ".env" | Where-Object { $_ -match '^\s*APP_PORT\s*=' } | Select-Object -Last 1
    if ($portLine -match '^\s*APP_PORT\s*=\s*(\d+)\s*$') {
      $port = $Matches[1]
    }
  }
  if (-not $port) { $port = "8080" }
  return "http://localhost:$port"
}

function Wait-ForApi([string]$appUrl) {
  $probeUrl = "$appUrl/api/tax/realized-gains"
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $probeUrl -Method Get -TimeoutSec 3 -UseBasicParsing
      if ($response.StatusCode -eq 405) { return }
    } catch {
      $response = $_.Exception.Response
      if ($response -and [int]$response.StatusCode -eq 405) { return }
    }
    Start-Sleep -Seconds 2
  }
  throw "The API did not become ready at $probeUrl. Check Docker with '.\tax.ps1 status'."
}

function Start-Stack([string]$appUrl) {
  Invoke-Compose @("up", "-d", "--build")
  Wait-ForApi $appUrl
}

try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker Desktop is required. Install or start Docker, then retry."
  }

  $Action = $Action.ToLowerInvariant()
  $appUrl = Get-AppUrl

  switch ($Action) {
    "up" {
      Start-Stack $appUrl
      Write-Host "TaxCalculator is running at $appUrl"
    }
    "ui" {
      Start-Stack $appUrl
      Start-Process $appUrl
    }
    "workbook" {
      if (-not $CsvPath) { throw "Usage: .\tax.ps1 workbook <activity.csv> [generator options]" }
      if (-not (Test-Path -LiteralPath $CsvPath -PathType Leaf)) {
        throw "CSV file not found: $CsvPath"
      }
      if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "Node.js and npm are required for CLI workbook generation."
      }
      if (-not (Test-Path "frontend/node_modules/xlsx-js-style/package.json")) {
        Write-Host "Installing frontend dependencies for the workbook generator..."
        & npm ci --prefix frontend
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
      }

      Start-Stack $appUrl
      $resolvedCsv = (Resolve-Path -LiteralPath $CsvPath).Path
      $npmArgs = @(
        "--prefix", "frontend", "run", "generate-workbook", "--",
        $resolvedCsv, "--api", "$appUrl/api/tax/realized-gains"
      ) + $GeneratorOptions
      & npm @npmArgs
      if ($LASTEXITCODE -ne 0) { throw "Workbook generation failed." }
    }
    "down" {
      Invoke-Compose @("down")
    }
    "status" {
      Invoke-Compose @("ps")
    }
  }
} finally {
  Pop-Location
}