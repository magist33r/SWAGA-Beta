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
- Модуль статуса бота (`status`): кастомный activity text/type.
- Welcome-модуль (`welcome`): приветственный embed при входе пользователя.
- Logs-модуль (`logs`): события вход/выход, модерация, сообщения, voice.
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

## Структура bot

- `bot/src/index.js` — основной рантайм бота
- `bot/modules/vip/*` — VIP-константы, команды и бизнес-логика
- `bot/modules/tickets/*` — ticket-константы, команды и бизнес-логика
- `bot/modules/giveaway/*` — логика розыгрышей и обработка giveaway interaction
- `bot/modules/leaderboard/*` — генерация и логика лидерборда
- `bot/modules/stats-card/*` — карточка статистики игрока
- `bot/modules/media.js` — модерация медиа-каналов
- `bot/modules/status.js` — activity/status бота
- `bot/modules/welcome.js` — welcome embed при входе
- `bot/modules/logs.js` — серверные/модерационные логи
- `bot/config.example.json` — шаблон конфига
- `bot/dist/` — exe сборка и runtime-файлы

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

### Media

- `media.enabled`
- `media.channelIds[]`
- `media.notifyOnDelete`
- `media.announceAuthor`
- `media.likeEmoji`
- `media.dislikeEmoji`

### Status

- `status.enabled`
- `status.text`
- `status.type` (`playing|streaming|listening|watching|competing|custom`)

### Welcome

- `welcome.enabled`
- `welcome.channelId`
- `welcome.rulesChannelId`
- `welcome.infoChannelId`
- `welcome.donateChannelId`
- `welcome.projectName`
- `welcome.titlePrefix`
- `welcome.color`

### Logs

- `logs.enabled`
- `logs.channelId`
- `logs.includeVoice`
- `logs.includeMessages`

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

По умолчанию билд: `bot/dist/swaga-bot.exe`.
