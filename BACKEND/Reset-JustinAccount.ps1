param(
    [ValidateSet('supabase', 'local')][string]$Database = 'supabase',
    [switch]$CreateIfMissing
)
& (Join-Path $PSScriptRoot 'Reset-ProfileAccount.ps1') -Member justin -Database $Database -CreateIfMissing:$CreateIfMissing
