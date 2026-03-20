# SWAGA-Beta

Discord-бот для DayZ: управление VIP, синхронизация whitelist (local/FTP), API для GUI, лидерборды и аудит.

## Возможности

- Привязка Discord к SteamID64 (`/steamid`, `/link`, `/unlink`).
- VIP-логика с тарифами, сроками, авто-истечением и уведомлениями в DM.
- Поддержка ролей `VIP`, `newera`, `media`.
- Синхронизация whitelist между несколькими серверами (`local` и `ftp`).
- Лидерборд CF Cloud (`/top`, `/updatetop`, автообновление, автопост).
- REST API для GUI.
- Аудит в файл + аудит в Discord-канал.
- Ежедневный backup мета-данных в Discord-канал.
- Анти-`@everyone` (тайм-аут + очистка сообщений за час).
- Локализация RU/EN.

## Структура репозитория

- `bot/` — бот, API, модули leaderboard.
- `gui/` — GUI-клиент (Electron + React).

## Требования

- Node.js >= 16.9
- npm

## Быстрый старт (бот)

```bash
cd bot
npm install
copy config.example.json config.json
# заполнить config.json
npm start
```

## Основные команды Discord

- `/status`
- `/steamid`
- `/link`
- `/unlink`
- `/whois`
- `/viplist`
- `/stats`
- `/givevip`
- `/setvip`
- `/removevip`
- `/profile`
- `/serverinfo`
- `/top` (если включен leaderboard)
- `/updatetop` (если включен leaderboard)
- `/ticketpanel`
- `/close`
- `/delete` (admin only)

## Tickets

- Panel supports RU/EN ticket creation buttons.
- When a ticket is closed, the ticket owner loses access to the channel.
- `/delete` permanently removes ticket channel (admin only).

## REST API (кратко)

- `GET /api/health`
- `GET /api/vip/list`
- `GET /api/vip/stats`
- `GET /api/logs`
- `POST /api/vip/give`
- `POST /api/vip/remove`
- `POST /api/vip/set`

Авторизация:

- `x-api-token: <token>`
- или `Authorization: Bearer <token>`

## Ключевые блоки config.json

### База

- `token`, `clientId`, `guildId`
- `logPath`
- `checkIntervalSeconds`
- `notifyBeforeHours`
- `language`
- `auditChannelId`
- `backupChannelId`

### Серверы

- `primaryServer`
- `servers[]`:
  - `name`
  - `type`: `local` или `ftp`
  - `profilePath`
  - `whitelistPath` (поддерживает `$profile:`)
  - `ftp.{host,port,user,password,secure}` для FTP

### API

- `api.enabled`
- `api.host`
- `api.port`
- `api.token`
- `api.allowedOrigins`
- `api.maxLogLines`
- `api.maxPageSize`

### Leaderboard

- `leaderboard.enabled`
- `leaderboard.command`
- `leaderboard.updateCommand`
- `leaderboard.defaultServer`
- `leaderboard.servers[]` с CF Cloud параметрами
- `leaderboard.autoPostChannelId`
- `leaderboard.autoPostIntervalMs`
- `leaderboard.backgroundRefreshEnabled`

## Файлы данных

- `bot/config.json` — конфиг (секреты не коммитить).
- `bot/bot-db.json` — мета-данные бота (links/locales/vipTimed/history).
- `bot/vip.log` — лог действий.

## Сборка .exe

```bash
cd bot
node node_modules/pkg/lib-es5/bin.js index.js --targets node16-win-x64 --output dist/vip-bot.exe
```
