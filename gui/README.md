# VIP GUI

Desktop GUI for managing DayZ VIP entries through the bot HTTP API.

## Features
- Connection diagnostics (`/api/health`) with API time, version, latency and last check time.
- VIP list with search, sorting, status badges and status filters:
  - `Все`, `Активные`, `Навсегда`, `Истекшие`, `Без Discord`.
- Inline VIP expiry editor directly in table rows.
- Statistics panel from `/api/vip/stats` (including links and upcoming expirations).
- Log viewer from `/api/logs` with:
  - search,
  - level filter (`all/error/warn/vip/api`),
  - selectable line limit.
- Safer API client: timeout + retry for `GET` requests.

## API Requirements
Enable API in `bot/config.json`:

```json
"api": {
  "enabled": true,
  "host": "0.0.0.0",
  "port": 8787,
  "token": "CHANGE_ME",
  "maxLogLines": 1000,
  "maxPageSize": 100
}
```

## Run Locally
```bash
cd gui
npm install
npm start
```

Then configure API URL (example: `http://SERVER_IP:8787`) and API token in the GUI.

## Build Portable EXE
```bash
cd gui
npm run build
```

Output artifacts are written to `gui/dist`.
