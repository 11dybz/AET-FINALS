param(
    [Parameter(Mandatory=$true)][ValidateSet('dave', 'justin')][string]$Member,
    [ValidateSet('supabase', 'local')][string]$Database = 'supabase',
    [switch]$CreateIfMissing
)
$ErrorActionPreference = 'Stop'
$backendDirectory = $PSScriptRoot
$driverDirectory = if ($Database -eq 'supabase') {
    Join-Path $env:USERPROFILE '.m2/repository/org/postgresql/postgresql'
} else {
    Join-Path $env:USERPROFILE '.m2/repository/com/h2database/h2'
}
$driverPattern = if ($Database -eq 'supabase') { '^postgresql-[0-9.]+\.jar$' } else { '^h2-[0-9.]+\.jar$' }
$driver = Get-ChildItem -LiteralPath $driverDirectory -Recurse -File |
    Where-Object { $_.Name -match $driverPattern } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$driver) { throw 'Database driver not found. Run the backend once to download its dependencies.' }
$buildDirectory = Join-Path $backendDirectory 'target/account-reset-tool'
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
Push-Location $backendDirectory
try {
    & javac -cp $driver.FullName -d $buildDirectory 'src/main/java/com/pitchr/backend/PasswordHasher.java' 'tools/ResetProfileAccount.java'
    if ($LASTEXITCODE -ne 0) { throw 'Could not compile the reset tool. A Java 17+ JDK is required.' }
    $arguments = @($Member, $Database)
    if ($CreateIfMissing) { $arguments += '--create-if-missing' }
    & java -cp ($buildDirectory + [IO.Path]::PathSeparator + $driver.FullName) com.pitchr.backend.ResetProfileAccount @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Account reset did not complete. See the message above. No success was confirmed.' }
} finally { Pop-Location }
