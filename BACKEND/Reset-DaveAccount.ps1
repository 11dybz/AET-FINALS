param(
    [ValidateSet('supabase', 'local')][string]$Database = 'supabase',
    [switch]$CreateIfMissing
)
& (Join-Path $PSScriptRoot 'Reset-ProfileAccount.ps1') -Member dave -Database $Database -CreateIfMissing:$CreateIfMissing
