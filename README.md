# icarus-wgsm-discord-panel

Bot Discord (discord.js v14) qui sert de panneau de contrôle pour un serveur
Icarus géré via [WindowsGSM](https://github.com/WindowsGSM/WindowsGSM).

## Fonctionnalités

- **Panel serveur** : boutons Start / Stop / Restart / Update / Info qui
  envoient la commande correspondante au bot WindowsGSM dans un salon
  "backlog", puis renvoient sa réponse à l'utilisateur.
- **Panel backups** : liste les maps sauvegardées, permet de choisir un
  backup à restaurer (avec confirmation), journalise l'opération dans un
  salon de logs et redémarre automatiquement le serveur après restauration.
- Accès restreint aux membres ayant la permission Discord `Administrator`.

## Prérequis

- Node.js 18+
- Un bot Discord créé sur le [Developer Portal](https://discord.com/developers/applications)
  avec les intents `Guilds`, `Guild Messages` et `Message Content` activés.
- Un serveur géré par WindowsGSM (ou compatible) qui répond aux commandes
  textuelles dans un salon dédié.

## Installation

```bash
npm install
cp .env.example .env
```

Renseigne les variables dans `.env` :

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Token du bot Discord |
| `PANEL_CHANNEL_ID` | Salon où s'affiche le panel de contrôle serveur |
| `BACKLOG_CHANNEL_ID` | Salon où les commandes sont envoyées au bot WindowsGSM |
| `SERVER_ID` | ID du serveur géré par WindowsGSM |
| `CMD_PREFIX` | Préfixe de commande du bot WindowsGSM (par défaut `!wgsm`) |
| `WGSM_BOT_ID` | ID du bot WindowsGSM (pour identifier ses réponses) |
| `WAIT_MS` | Délai d'attente d'une réponse avant timeout (ms) |
| `BACKUPS_CHANNEL_ID` | Salon du panel de gestion des backups (optionnel) |
| `BACKUPS_LOG_CHANNEL_ID` | Salon de log des restaurations |
| `PROSPECTS_DIR` | Chemin local vers le dossier des sauvegardes Icarus |

## Lancement

```bash
npm start
```

## ⚠️ Sécurité

Ne commite jamais ton fichier `.env` : il contient le token du bot. Si un
token a déjà été exposé (dépôt public, capture d'écran, etc.), régénère-le
immédiatement depuis le Developer Portal Discord.
