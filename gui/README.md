# VIP GUI

Desktop GUI for managing VIP lists through the bot HTTP API.

## Setup
1. Enable the API in `bot/config.json`:

```
"api": {
  "enabled": true,
  "host": "0.0.0.0",
  "port": 8787,
  "token": "CHANGE_ME",
  "maxLogLines": 500,
  "maxPageSize": 100
}
```

2. Open the API port on the server firewall (e.g. 8787).
3. Install and run the GUI:

```
cd gui
npm install
npm start
```

4. In the GUI, set API URL (e.g. `http://SERVER_IP:8787`) and the token.

## Build (.exe)
```
cd gui
npm run build
```
The portable executable will be in `gui/dist`.
