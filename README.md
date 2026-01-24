# SWAGA-Beta

DayZ VIP manager consisting of a Discord bot and a desktop GUI.

## Repo structure
- `bot/` - Discord bot that manages the VIP whitelist and exposes an API.
- `gui/` - Electron + React desktop UI that talks to the bot API.

## Requirements
- Node.js >= 16.9 (bot)
- Node.js + npm (GUI/Electron)

## Bot setup
1) `cd bot`
2) `npm install`
3) Copy `config.example.json` to `config.json`
4) Fill in Discord credentials, CFTools settings, servers, and API options
5) `npm start`

## GUI setup
1) `cd gui`
2) `npm install`
3) In one terminal: `npm run dev:renderer`
4) In another terminal: `npm start`

Build a portable Windows app:
- `npm run build`

## Notes
- `bot/config.json` contains secrets and should not be committed.
- The GUI expects the bot API to be enabled and reachable.