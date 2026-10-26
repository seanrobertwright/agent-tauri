# PowerShell helper wrapper for agent-tauri
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path "$PSScriptRoot/../../.."
$CliPath = Join-Path $RepoRoot "bin/agent-tauri.js"

if (-not (Test-Path $CliPath)) {
    Write-Error "Could not find agent-tauri CLI at $CliPath"
    exit 1
}

node $CliPath @args
