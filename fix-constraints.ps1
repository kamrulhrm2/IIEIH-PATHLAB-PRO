# PowerShell Script to Fix Medical Services Workflow Constraints
#
# This script executes the required SQL migrations in Supabase
#
# Requirements:
# - VITE_SUPABASE_URL environment variable (or set it below)
# - VITE_SUPABASE_PUBLISHABLE_KEY environment variable (or set it below)
# - curl command available (part of Windows 10+)
#
# Usage: .\fix-constraints.ps1

# Get Supabase credentials from .env file
$env_file = ".env"
if (Test-Path $env_file) {
    Get-Content $env_file | ForEach-Object {
        if ($_ -match '^\s*VITE_SUPABASE_URL\s*=\s*(.+)\s*$') {
            $SUPABASE_URL = $Matches[1].Trim() -replace '"', ''
        }
        if ($_ -match '^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.+)\s*$') {
            $SUPABASE_KEY = $Matches[1].Trim() -replace '"', ''
        }
    }
}

# Use environment variables as fallback
if (-not $SUPABASE_URL) { $SUPABASE_URL = $env:VITE_SUPABASE_URL }
if (-not $SUPABASE_KEY) { $SUPABASE_KEY = $env:VITE_SUPABASE_PUBLISHABLE_KEY }

# Validate credentials
if (-not $SUPABASE_URL -or -not $SUPABASE_KEY) {
    Write-Host "[ERROR] Missing Supabase credentials" -ForegroundColor Red
    Write-Host "Please set environment variables or create .env.local with:" -ForegroundColor Yellow
    Write-Host "  VITE_SUPABASE_URL=your_url"
    Write-Host "  VITE_SUPABASE_PUBLISHABLE_KEY=your_key"
    exit 1
}

Write-Host "[SETUP] PathLab Pro - Medical Services Workflow Constraint Fixes" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Supabase Project: $($SUPABASE_URL.Split('/') | Select-Object -Last 1)" -ForegroundColor Gray
Write-Host "---" -ForegroundColor Gray
Write-Host ""

# Migration 1: Fix requests table status constraint
$migration1 = @"
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;

ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (
  status IN (
    'PENDING_DOCTOR',
    'DOCTOR_REJECTED',
    'PENDING_HR',
    'PENDING_HR_PARTIAL',
    'HR_RESTRICTED',
    'PENDING_ADMIN',
    'ADMIN_REJECTED',
    'PENDING_MEDICAL',
    'MEDICAL_REJECTED',
    'PENDING_PATHOLOGY',
    'PATH_PARTIAL',
    'COMPLETED'
  )
);
"@

# Migration 2: Fix request_timeline table stage constraint
$migration2 = @"
ALTER TABLE request_timeline DROP CONSTRAINT IF EXISTS request_timeline_stage_check;

ALTER TABLE request_timeline ADD CONSTRAINT request_timeline_stage_check CHECK (
  stage IN (
    'CREATED',
    'DOCTOR_APPROVED',
    'DOCTOR_PARTIAL_APPROVED',
    'DOCTOR_REJECTED',
    'HR_APPROVED',
    'HR_RESTRICTED',
    'ADMIN_APPROVED',
    'ADMIN_REJECTED',
    'MEDICAL_APPROVED',
    'MEDICAL_REJECTED',
    'PATH_PARTIAL',
    'COMPLETED'
  )
);
"@

function Execute-SQL {
    param(
        [string]$query,
        [string]$name
    )

    Write-Host "[RUNNING] $name..." -ForegroundColor Yellow

    try {
        # Create request body
        $body = @{
            query = $query
        } | ConvertTo-Json

        # Execute via Supabase REST API
        $headers = @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $SUPABASE_KEY"
            "apikey" = $SUPABASE_KEY
        }

        $response = Invoke-WebRequest `
            -Uri "$SUPABASE_URL/rest/v1/rpc/exec" `
            -Method POST `
            -Headers $headers `
            -Body $body `
            -ErrorAction Stop

        if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 201) {
            Write-Host "[SUCCESS] $name" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[FAILED] $name (HTTP $($response.StatusCode))" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "[ERROR] $name" -ForegroundColor Red
        Write-Host "   $($_.Exception.Message)" -ForegroundColor Gray
        return $false
    }
}

# Run migrations
Write-Host "Starting constraint migrations..." -ForegroundColor Cyan
Write-Host ""

$result1 = Execute-SQL $migration1 "Migration 1: requests table"
Write-Host ""

$result2 = Execute-SQL $migration2 "Migration 2: request_timeline table"
Write-Host ""

# Summary
if ($result1 -and $result2) {
    Write-Host "[COMPLETE] All migrations completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Refresh PathLab Pro app (Ctrl+Shift+R)" -ForegroundColor Gray
    Write-Host "2. Test HR approval -> Medical Services routing" -ForegroundColor Gray
    Write-Host "3. Test Medical approval -> Pathology routing" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "[WARNING] Some migrations failed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Manual fix: Go to Supabase SQL Editor and run the migrations:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Migration 1:" -ForegroundColor Gray
    Write-Host $migration1 -ForegroundColor Gray
    Write-Host ""
    Write-Host "Migration 2:" -ForegroundColor Gray
    Write-Host $migration2 -ForegroundColor Gray
    exit 1
}
