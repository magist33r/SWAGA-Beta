# SWAGA-Beta

Менеджер VIP для DayZ: Discord-бот + настольный GUI. Бот ведет список VIP, синхронизирует whitelist на серверах (local/FTP), отправляет уведомления и дает API для GUI.

## Возможности
- Привязка Discord и SteamID64 (самостоятельно или администратором).
- Выдача и снятие VIP, учет сроков (VIP Test / 14 Days / Monthly / VIP навсегда) и роль newera.
- Автоматическое истечение VIP и предупреждения за N часов до конца срока.
- Синхронизация whitelist на один или несколько серверов (локально или по FTP).
- История дуэлей: чтение history.json и публикация событий в Discord (с ссылками на CFTools).
- Аудит-логи: файл и отдельный канал Discord.
- API для GUI (список VIP, статистика, логи, выдача/снятие/установка срока).
- Локализация RU/EN.

## Структура репозитория
- bot/ - Discord-бот и API.
- gui/ - Electron + React приложение для управления через API.

## Требования
- Node.js >= 16.9 (бот)
- Node.js + npm (GUI/Electron)

## Быстрый старт (бот)
1) cd bot
2) npm install
3) Скопировать config.example.json в config.json
4) Заполнить конфиг (см. ниже)
5) npm start

## Быстрый старт (GUI)
1) cd gui
2) npm install
3) В одном терминале: npm run dev:renderer
4) В другом терминале: npm start

Сборка portable-версии для Windows:
- npm run build

## Конфигурация (bot/config.json)
Ниже ключевые поля. Полный шаблон - bot/config.example.json.

### Базовые
- token - токен Discord-бота.
- clientId - ID приложения Discord.
- guildId - ID сервера.
- logPath - путь к файлу логов (например, ./vip.log).
- checkIntervalSeconds - частота проверки VIP и истечения.
- notifyBeforeHours - когда предупреждать об окончании (массив часов, например [24, 6, 1]).
- language - ru или en.
- auditChannelId - канал для аудит-логов (опционально).

### Серверы и whitelist
- servers - массив серверов. Каждый сервер:
  - name - имя (используется в логах и истории).
  - type - local или ftp (если не задано, определяется автоматически).
  - profilePath - путь к профилю сервера.
  - whitelistPath - путь к JSON whitelist (поддерживает $profile:).
  - ftp - параметры FTP (host, port, user, password, secure).
- primaryServer - имя сервера по умолчанию для логов и команд.

### История дуэлей (history feed)
Раздел history управляет чтением history.json и публикацией событий в Discord.

Пример:
{
  "history": {
    "pollMs": 3000,
    "serverName": "SERVER_NAME",
    "feeds": [
      {
        "name": "S1",
        "server": "S1",
        "path": "$profile:history.json",
        "channelId": "DISCORD_CHANNEL_ID"
      }
    ]
  }
}

Поддерживаются также поля footerText, thumbnailUrl, color, statePath.

### API (для GUI)
- api.enabled - включить API.
- api.host, api.port - адрес и порт.
- api.token - токен доступа (обязателен).
- api.allowedOrigins - CORS (например, http://localhost:5173).
- api.maxLogLines, api.maxPageSize - лимиты выдачи.

Авторизация API: заголовок x-api-token: <token> или Authorization: Bearer <token>.

## Команды Discord
Доступно (часть требует прав Manage Roles):
- /status - статус VIP.
- /steamid - привязка своего SteamID64.
- /link, /unlink - админская привязка и отвязка.
- /whois - показать SteamID64 и VIP статус пользователя.
- /viplist - список активных VIP.
- /stats - статистика VIP.
- /givevip - выдать VIP роль.
- /setvip - установить срок VIP.
- /removevip - снять VIP.

## API (кратко)
- GET /api/health - статус.
- GET /api/vip/list - список VIP (пагинация, поиск, сортировка).
- GET /api/vip/stats - статистика VIP.
- GET /api/logs - последние строки логов.
- POST /api/vip/give - выдать VIP.
- POST /api/vip/remove - снять VIP.
- POST /api/vip/set - установить срок VIP.

## Файлы данных
- bot/config.json - конфиг (секреты, не коммитить).
- bot/bot-db.json - локальная БД бота (создается автоматически).
- bot/.history_state*.json - состояние history feed.
- bot/vip.log - файл логов (по умолчанию).

## Примечания
- GUI ожидает, что API бота включен и доступен.
- Для корректной выдачи ролей у бота должны быть права и позиция роли выше VIP-ролей.

## Кратко для резюме
- Разработал Discord-бота для DayZ с управлением VIP и автоматической синхронизацией whitelist.
- Реализовал учет сроков VIP, уведомления об окончании и автоматическое снятие ролей.
- Поднял защищенный REST API для GUI (токен, CORS, лимиты) и логирование действий.
- Добавил историю дуэлей и аудит-логи в Discord.
- Собрал настольный GUI на Electron + React для администраторов.

## Стек
Node.js, discord.js, Express, basic-ftp, Electron, React, Vite.