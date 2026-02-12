# 🏆 Генератор лидерборда для Discord

Модуль для Discord бота, который парсит статистику из CF.Cloud API и генерирует красивые картинки лидерборда.

## ✨ Возможности

- 📊 **Парсинг из CF.Cloud** - получение статистики игроков
- 🎨 **Генерация картинок** - красивый дизайн как в примере
- 🎯 **Кастомизация** - легко меняется лого, цвета, фон
- ⚡ **Кэширование** - не нагружает API лишними запросами
- 🤖 **Автопост** - автоматическая публикация в канал
- 🏅 **Медали** - топ-3 игрока с эмодзи медалей

## 🚀 Установка

### 1. Установка зависимостей

```bash
npm install
```

**Важно:** Для работы Canvas нужны системные библиотеки:

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

**Windows:**
- Скачай и установи [GTK for Windows](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer)

### 2. Настройка

Создай `.env` файл:

```env
DISCORD_TOKEN=твой_токен_бота
CFCLOUD_API_KEY=твой_api_ключ_cfcloud
CFCLOUD_SERVER_ID=id_твоего_сервера
```

### 3. Подготовка ассетов

Создай папку `assets/` и положи туда:

```
assets/
├── logo.png       # Твой логотип (рекомендуется 400x200px)
├── bg.png         # Фоновое изображение (1920x1080px)
└── font.ttf       # Кастомный шрифт (опционально)
```

### 4. Запуск

```bash
npm start
```

## 📖 Использование

### Команды в Discord:

**Показать лидерборд:**
```
!top
!лидерборд
```

**Принудительное обновление (только админы):**
```
!update-top
```

## ⚙️ Настройка дизайна

### Изменение цветов:

```javascript
const leaderboard = new LeaderboardGenerator({
    design: {
        accentColor: '#ff6b35',      // Цвет акцентов (заголовки, топ-3)
        backgroundColor: '#1a1a1a',  // Основной фон
        headerColor: '#2d2d2d',      // Цвет шапки таблицы
        rowColor: '#242424',         // Цвет строк
        textColor: '#ffffff',        // Цвет текста
    }
});
```

### Изменение путей к ассетам:

```javascript
const leaderboard = new LeaderboardGenerator({
    logoPath: './my-assets/my-logo.png',
    backgroundPath: './my-assets/my-bg.jpg',
    fontPath: './my-assets/my-font.ttf',
});
```

### Количество игроков в топе:

```javascript
const leaderboard = new LeaderboardGenerator({
    topCount: 15,  // Показать топ-15 вместо топ-10
});
```

## 🔌 CF.Cloud API

### Получение API ключа:

1. Зайди на [cftools.cloud](https://cftools.cloud)
2. Перейди в настройки → API
3. Создай новый API ключ
4. Скопируй ключ и Server ID

### Структура данных API:

Модуль ожидает следующую структуру от CF.Cloud:

```json
{
  "leaderboard": [
    {
      "name": "PlayerName",
      "kills": 100,
      "deaths": 20,
      "kdratio": 5.0,
      "playtime": 36000,
      "longest_kill": 500,
      "accuracy": 62,
      "hits": 349
    }
  ]
}
```

Если у тебя другая структура - адаптируй метод `parseLeaderboardData()`.

## 🎨 Кастомизация под свой стиль

### Пример 1: Изменить расположение колонок

Открой `leaderboard-generator.js` и найди метод `drawHeaders()`:

```javascript
const headers = [
    { text: '#', x: 120 },
    { text: 'ИГРОК', x: 400 },
    // Измени координаты x для своего расположения
];
```

### Пример 2: Добавить свою колонку

1. Добавь в `parseLeaderboardData()`:
```javascript
headshots: player.headshots || 0
```

2. Добавь заголовок в `drawHeaders()`:
```javascript
{ text: 'ХЕДШОТЫ', x: 1500 }
```

3. Добавь отображение в `drawPlayerRows()`:
```javascript
ctx.fillText(player.headshots, 1500, y + 42);
```

## 🤖 Автоматическая публикация

### Настройка автопоста:

```javascript
// В bot файле
const channel = client.channels.cache.get('ID_КАНАЛА');
leaderboard.autoPostLeaderboard(channel, 3600000); // Каждый час
```

Интервалы:
- `300000` = 5 минут
- `1800000` = 30 минут
- `3600000` = 1 час
- `86400000` = 24 часа

## 🔧 Продвинутые настройки

### Кэширование:

Модуль автоматически кэширует картинку на 5 минут. Изменить:

```javascript
const leaderboard = new LeaderboardGenerator({
    updateInterval: 600000  // 10 минут
});
```

### Обработка ошибок:

Если CF.Cloud API недоступен, модуль вернет закэшированную версию или выбросит ошибку.

## 📊 Что показывается в лидерборде

- **Ранг** - позиция игрока (топ-3 с медалями 🥇🥈🥉)
- **Игрок** - ник игрока
- **K/D** - убийства/смерти
- **КД** - коэффициент K/D (цветная подсветка)
- **Время** - время игры в часах
- **Дистанция** - самое дальнее убийство
- **Точность** - процент попаданий

## 💡 Советы

- **Лого**: Используй PNG с прозрачным фоном для лучшего вида
- **Фон**: Можно использовать скриншот из игры
- **Шрифт**: Скачай игровой шрифт для стиля (например, из DayZ)
- **Цвета**: Подбирай цвета под свой Discord сервер

## 🐛 Troubleshooting

**Canvas не устанавливается:**
- Убедись что установлены системные зависимости (см. раздел Установка)
- На Windows может потребоваться Visual Studio Build Tools

**API возвращает ошибку 401:**
- Проверь правильность API ключа
- Убедись что ключ не истек

**Картинка не генерируется:**
- Проверь что ассеты существуют (logo.png, bg.png)
- Посмотри логи в консоли

**Лого/фон не отображается:**
- Убедись что пути к файлам правильные
- Проверь что файлы в формате PNG/JPG

## 🎯 TODO

- [ ] Поддержка других игровых API
- [ ] Slash-команды Discord
- [ ] Веб-интерфейс для настройки дизайна
- [ ] Экспорт в разные форматы (JPEG, WebP)
- [ ] Анимированные GIF лидерборды
- [ ] Графики и статистика

## 📄 Лицензия

MIT

---

Сделано с ❤️ для игровых Discord серверов
