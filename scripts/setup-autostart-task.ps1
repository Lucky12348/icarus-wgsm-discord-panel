<#
  À exécuter UNE FOIS sur le Windows Server qui héberge le bot, dans une
  PowerShell (ou invite de commandes) lancée en tant qu'Administrateur.

  Crée une tâche planifiée qui :
  - démarre le bot au démarrage de Windows, sans qu'aucun utilisateur soit connecté
  - le relance automatiquement s'il crashe (jusqu'à 999 fois, toutes les 1 min)
  - n'a pas de limite de durée d'exécution (par défaut Windows tue une tâche
    après 3 jours, ce qui couperait le bot sans raison apparente)
  Puis démarre immédiatement le bot, sans attendre un redémarrage.

  On passe par schtasks.exe plutôt que par la cmdlet Register-ScheduledTask :
  cette dernière renvoie parfois un "Accès refusé" trompeur quand elle est
  lancée depuis une session non interactive (SSH, RDP en arrière-plan, etc.),
  alors que la tâche est en réalité bien créée. schtasks.exe parle
  directement au service Planificateur de tâches et n'a pas ce défaut.

  Usage (depuis la racine du projet) :
    npm run setup:autostart
  ou directement :
    cd scripts
    .\setup-autostart-task.ps1
#>

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
    throw "Ce script doit etre lance depuis une invite PowerShell (ou cmd) ouverte 'en tant qu'Administrateur'. Sans elevation, schtasks refuse de creer une tache qui s'execute en SYSTEM et renvoie une erreur XML trompeuse au lieu d'un message d'acces refuse clair."
}

$TaskName = "WGSM-Discord-Panel-Bot"
$BotDir = (Resolve-Path "$PSScriptRoot\..").Path
$LauncherBat = Join-Path $BotDir "run-bot.bat"

Write-Host "Dossier du bot : $BotDir"

if (-not (Test-Path (Join-Path $BotDir "index.js"))) {
    throw "index.js introuvable dans $BotDir - lance ce script depuis le dossier scripts/ du projet."
}
if (-not (Test-Path (Join-Path $BotDir ".env"))) {
    throw ".env introuvable dans $BotDir - configure-le avant de mettre en place l'auto-demarrage."
}
if (-not (Test-Path $LauncherBat)) {
    throw "run-bot.bat introuvable dans $BotDir."
}

function Escape-Xml([string]$s) {
    return $s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
}

$xmlLauncher = Escape-Xml $LauncherBat
$xmlBotDir = Escape-Xml $BotDir

# RestartOnFailure / ExecutionTimeLimit / LogonType ServiceAccount ne sont
# pas exposés par la syntaxe simple de schtasks /Create : on passe par une
# définition XML complète (équivalente aux réglages qu'on utilisait avant
# avec Register-ScheduledTask).
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Demarre le bot Discord WGSM au demarrage de Windows et le relance s'il crashe.</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$xmlLauncher</Command>
      <WorkingDirectory>$xmlBotDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = Join-Path $env:TEMP "wgsm-autostart-task.xml"
Set-Content -Path $xmlPath -Value $xml -Encoding Unicode

try {
    schtasks /Create /TN "$TaskName" /XML "$xmlPath" /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "schtasks /Create a echoue (code $LASTEXITCODE)."
    }
} finally {
    Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Tache planifiee '$TaskName' creee (demarrage automatique, sans connexion utilisateur)." -ForegroundColor Green

Write-Host "Demarrage immediat du bot..."
schtasks /Run /TN "$TaskName" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Impossible de demarrer la tache immediatement (code $LASTEXITCODE). Elle demarrera au prochain redemarrage de Windows."
} else {
    Write-Host "Bot demarre." -ForegroundColor Green
}

Write-Host ""
Write-Host "Pour verifier son etat :"
Write-Host "  schtasks /Query /TN `"$TaskName`" /V /FO LIST"
Write-Host ""
Write-Host "Logs : $BotDir\bot.log"
