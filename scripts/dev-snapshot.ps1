<#
.SYNOPSIS
  Copie les données de développement de DocEase vers C:\src\docease_snapshots\AAAA-MM-JJ_HHMM_<libellé>.

.EXAMPLE
  powershell -File scripts\dev-snapshot.ps1 avant-recette

  Refuse de s'exécuter si DocEase est ouvert (les fichiers pourraient être copiés en cours d'écriture).
  Ne supprime jamais rien : ni dans les données, ni dans les copies existantes.
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidatePattern('^[A-Za-z0-9._-]{1,60}$')]
    [string]$Label
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $env:LOCALAPPDATA 'com.docease.desktop'
$root = 'C:\src\docease_snapshots'

if (-not (Test-Path -LiteralPath $source)) { throw "Dossier de données introuvable : $source" }

# DocEase installé (Docease.exe) ou lancé par « tauri dev » (app.exe dans le dépôt).
$running = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -ieq 'docease' -or ($_.ProcessName -ieq 'app' -and $_.Path -and $_.Path -match 'docease')
}
if ($running) {
    Write-Error "DocEase est en cours d'exécution (processus : $(($running | ForEach-Object { $_.ProcessName + ' #' + $_.Id }) -join ', ')). Fermez-le puis relancez ce script."
    exit 1
}

$dest = Join-Path $root ("{0}_{1}" -f (Get-Date -Format 'yyyy-MM-dd_HHmm'), $Label)
if (Test-Path -LiteralPath $dest) { throw "La copie existe déjà : $dest (aucune écriture)." }

New-Item -ItemType Directory -Path $dest | Out-Null
# /E : sous-dossiers ; jamais /MIR ni /PURGE : rien n'est supprimé.
robocopy $source $dest /E /COPY:DAT /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Échec de la copie (code robocopy $LASTEXITCODE). Copie partielle laissée dans $dest." }

$bytes = (Get-ChildItem -LiteralPath $dest -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum
"Copie créée : $dest"
"Taille      : {0:N1} Mo" -f ($bytes / 1MB)
exit 0
