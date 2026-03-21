# SWAGA-Beta

Discord-бот для DayZ: VIP, тикеты, розыгрыши, статистика игроков, лидерборд и API.

## Возможности

- Привязка Discord к SteamID64: `/steamid`, `/link`, `/unlink`.
- VIP-логика: сроки, авто-истечение, уведомления в DM, синхронизация whitelist между серверами.
- Поддержка ролей: `VIP`, `media`, `VIP (Giveaway)`.
- Тикеты: RU/EN кнопки панели, `/close`, `/delete` (только админ), авто-закрытие по неактивности.
- Розыгрыши: `/giveaway create`, `/giveaway server`, `/giveaway end`, `/giveaway reroll`.
- Выдача наград в розыгрыше по типу приза: `VIP 24 Hours`, `VIP 7 Days`, `VIP 14 Days`, `VIP Monthly`, `VIP`.
- Для server-розыгрыша: выбор сервера, выбор приза, длительность в минутах.
- Лидерборд CF Cloud: `/top`, `/updatetop`, фоновое обновление, автопост.
- Карточка статистики игрока: `/stats`.
- VIP-статистика: `/vipstats`.
- REST API для GUI.
- Аудит в файл и в Discord-канал.
- Ежедневный backup мета-данных в Discord-канал.
- Анти-`@everyone` (тайм-аут + очистка сообщений).

## Основные команды Discord

- `/status`
- `/steamid`
- `/link`
- `/unlink`
- `/whois`
- `/viplist`
- `/vipstats`
- `/stats`
- `/givevip`
- `/setvip`
- `/removevip`
- `/profile`
- `/serverinfo`
- `/giveaway` (subcommands: `create`, `server`, `end`, `reroll`)
- `/top` (если включен leaderboard)
- `/updatetop` (если включен leaderboard)
- `/ticketpanel`
- `/close`
- `/delete` (только админ)

## Быстрый старт

```bash
cd bot
npm install
copy config.example.json config.json
# заполните config.json
npm start
```

## Конфиг: ключевые блоки

### Базовые

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

### Tickets

- `tickets.categoryId`
- `tickets.archiveCategoryId`
- `tickets.panelChannelId`
- `tickets.supportRoleId`

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
- `leaderboard.servers[]`
- `leaderboard.autoPostChannelId`
- `leaderboard.autoPostIntervalMs`
- `leaderboard.backgroundRefreshEnabled`

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

## Файлы данных

- `bot/config.json` — конфиг (секреты не коммитить)
- `bot/bot-db.json` — мета-данные (links/locales/vipTimed/history)
- `bot/vip.log` — лог действий

## Сборка .exe

```bash
cd bot
npm run build
```

По умолчанию билд: `bot/swaga-bot.exe`.
