<#
  À exécuter UNE FOIS sur le Windows Server qui héberge le bot, dans une
  PowerShell lancée en tant qu'Administrateur.

  Crée une tâche planifiée qui :
  - démarre le bot au démarrage de Windows (avant même toute session ouverte)
  - le relance automatiquement s'il crashe (jusqu'à 999 fois, toutes les 1 min)
  - n'a pas de limite de durée d'exécution (par défaut Windows tue une tâche
    après 3 jours, ce qui couperait le bot sans raison apparente)

  Usage :
    cd chemin\vers\wgsmd-panel-bot\scripts
    .\setup-autostart-task.ps1
#>

$ErrorActionPreference = "Stop"

$TaskName = "WGSM-Discord-Panel-Bot"
$BotDir = (Resolve-Path "$PSScriptRoot\..").Path
$LauncherBat = Join-Path $BotDir "run-bot.bat"

Write-Host "Dossier du bot : $BotDir"

if (-not (Test-Path (Join-Path $BotDir "index.js"))) {
    throw "index.js introuvable dans $BotDir - lance ce script depuis le dossier scripts/ du projet."
}
if (-not (Test-Path (Join-Path $BotDir ".env"))) {
    throw ".env introuvable dans $BotDir - configure-le avant de mettre en place l'auto-démarrage."
}
if (-not (Test-Path $LauncherBat)) {
    throw "run-bot.bat introuvable dans $BotDir."
}

# On passe par run-bot.bat plutot que d'appeler node.exe directement : ca
# redirige la sortie (logs, erreurs) vers bot.log, sinon elle serait perdue
# puisqu'aucune console n'est attachee a une tache planifiee.
$Action = New-ScheduledTaskAction -Execute $LauncherBat -WorkingDirectory $BotDir
$Trigger = New-ScheduledTaskTrigger -AtStartup

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

# Tourne en tant que SYSTEM : pas de mot de passe à gérer, et accès complet
# aux fichiers locaux du serveur (dossier de sauvegardes Icarus, etc.).
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force

Write-Host ""
Write-Host "Tache planifiee '$TaskName' creee." -ForegroundColor Green
Write-Host "Elle demarrera au prochain redemarrage de Windows."
Write-Host ""
Write-Host "Pour la lancer immediatement sans redemarrer :"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Pour voir si elle tourne / consulter son etat :"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
