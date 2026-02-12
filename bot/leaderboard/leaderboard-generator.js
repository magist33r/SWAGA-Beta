const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const { fetch } = globalThis.fetch
  ? { fetch: globalThis.fetch }
  : require('undici');

/**
 * Модуль лидерборда с генерацией картинки
 * Парсит данные из CF.Cloud API
 */
class LeaderboardGenerator {
    constructor(options = {}) {
        this.cfCloudApiKey = options.cfCloudApiKey;
        this.cfCloudServerId = options.cfCloudServerId;
        this.cfCloudApiUrl = options.cfCloudApiUrl || 'https://api.cftools.cloud';
        
        // Настройки дизайна (легко кастомизируются)
        this.design = {
            width: 1920,
            height: 1080,
            backgroundColor: '#1a1a1a',
            headerColor: '#2d2d2d',
            rowColor: '#242424',
            rowColorAlt: '#1f1f1f',
            textColor: '#ffffff',
            accentColor: '#ff6b35', // Цвет акцентов (можно менять)
            logoPath: options.logoPath || './assets/logo.png',
            backgroundPath: options.backgroundPath || './assets/background.png',
            fontPath: options.fontPath || null
        };

        this.topCount = options.topCount || 10;
        this.updateInterval = options.updateInterval || 300000; // 5 минут
        this.cachedImage = null;
        this.lastUpdate = null;
    }

    /**
     * Регистрация кастомного шрифта (опционально)
     */
    registerCustomFont() {
        if (this.design.fontPath) {
            try {
                registerFont(this.design.fontPath, { family: 'CustomFont' });
                console.log('✅ Кастомный шрифт загружен');
            } catch (error) {
                console.log('⚠️ Не удалось загрузить шрифт, используется стандартный');
            }
        }
    }

    /**
     * Получение статистики с CF.Cloud API
     */
    async fetchLeaderboardData() {
        try {
            const response = await fetch(
                `${this.cfCloudApiUrl}/v1/server/${this.cfCloudServerId}/leaderboard`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.cfCloudApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`CF.Cloud API error: ${response.status}`);
            }

            const data = await response.json();
            return this.parseLeaderboardData(data);
        } catch (error) {
            console.error('❌ Ошибка получения данных:', error);
            throw error;
        }
    }

    /**
     * Парсинг данных лидерборда
     */
    parseLeaderboardData(rawData) {
        // Адаптируй под структуру твоего API
        const players = rawData.leaderboard || rawData.data || rawData;
        
        return players.slice(0, this.topCount).map((player, index) => ({
            rank: index + 1,
            name: player.name || player.username || 'Unknown',
            kd: player.kills && player.deaths 
                ? `${player.kills}/${player.deaths}` 
                : '0/0',
            ratio: player.kdratio || this.calculateKD(player.kills, player.deaths),
            playtime: this.formatPlaytime(player.playtime || 0),
            distance: this.formatDistance(player.longest_kill || 0),
            accuracy: player.accuracy 
                ? `TOPC ${Math.round(player.accuracy)}% (${player.hits || 0} ХИТОВ)`
                : 'N/A'
        }));
    }

    /**
     * Расчет K/D
     */
    calculateKD(kills, deaths) {
        if (!deaths || deaths === 0) return kills || 0;
        return (kills / deaths).toFixed(2);
    }

    /**
     * Форматирование времени игры
     */
    formatPlaytime(seconds) {
        const hours = Math.floor(seconds / 3600);
        return `${hours}ч`;
    }

    /**
     * Форматирование дистанции
     */
    formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)}км`;
        }
        return `${Math.round(meters)}м`;
    }

    /**
     * Генерация картинки лидерборда
     */
    async generateLeaderboardImage(players) {
        const canvas = createCanvas(this.design.width, this.design.height);
        const ctx = canvas.getContext('2d');

        // Фон
        await this.drawBackground(ctx);

        // Лого
        await this.drawLogo(ctx);

        // Заголовки колонок
        this.drawHeaders(ctx);

        // Строки с игроками
        this.drawPlayerRows(ctx, players);

        return canvas.toBuffer('image/png');
    }

    /**
     * Отрисовка фона
     */
    async drawBackground(ctx) {
        try {
            const background = await loadImage(this.design.backgroundPath);
            ctx.drawImage(background, 0, 0, this.design.width, this.design.height);
            
            // Затемнение для читаемости
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, this.design.width, this.design.height);
        } catch {
            // Если нет фона, рисуем градиент
            const gradient = ctx.createLinearGradient(0, 0, 0, this.design.height);
            gradient.addColorStop(0, '#1a1a1a');
            gradient.addColorStop(1, '#0a0a0a');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, this.design.width, this.design.height);
        }
    }

    /**
     * Отрисовка логотипа
     */
    async drawLogo(ctx) {
        try {
            const logo = await loadImage(this.design.logoPath);
            const logoWidth = 400;
            const logoHeight = (logo.height / logo.width) * logoWidth;
            const logoX = (this.design.width - logoWidth) / 2;
            const logoY = 40;
            
            ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
        } catch (error) {
            console.log('⚠️ Лого не найдено, пропускаем');
        }
    }

    /**
     * Отрисовка заголовков
     */
    drawHeaders(ctx) {
        const headerY = 220;
        const headerHeight = 60;
        
        // Фон заголовков
        ctx.fillStyle = this.design.headerColor;
        ctx.fillRect(50, headerY, this.design.width - 100, headerHeight);

        // Текст заголовков
        ctx.fillStyle = this.design.accentColor;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';

        const headers = [
            { text: '#', x: 120 },
            { text: 'ИГРОК', x: 400 },
            { text: 'K/D', x: 750 },
            { text: 'КД', x: 950 },
            { text: 'ВРЕМЯ', x: 1150 },
            { text: 'ДИСТАНЦИЯ', x: 1400 },
            { text: 'ТОЧНОСТЬ', x: 1700 }
        ];

        headers.forEach(header => {
            ctx.fillText(header.text, header.x, headerY + 38);
        });
    }

    /**
     * Отрисовка строк с игроками
     */
    drawPlayerRows(ctx, players) {
        const startY = 300;
        const rowHeight = 70;
        const padding = 20;

        players.forEach((player, index) => {
            const y = startY + (index * rowHeight);
            
            // Чередующийся цвет строк
            ctx.fillStyle = index % 2 === 0 
                ? this.design.rowColor 
                : this.design.rowColorAlt;
            ctx.fillRect(50, y, this.design.width - 100, rowHeight - 5);

            // Цвет для топ-3
            if (index < 3) {
                ctx.fillStyle = this.design.accentColor + '20';
                ctx.fillRect(50, y, this.design.width - 100, rowHeight - 5);
            }

            // Текст
            ctx.fillStyle = this.design.textColor;
            ctx.font = index < 3 ? 'bold 26px Arial' : '24px Arial';

            // Ранг с медалями
            ctx.textAlign = 'center';
            const rankText = index < 3 
                ? ['🥇', '🥈', '🥉'][index] 
                : player.rank.toString();
            ctx.fillText(rankText, 120, y + 42);

            // Имя игрока
            ctx.textAlign = 'left';
            ctx.fillText(player.name, 250, y + 42);

            // Остальные данные
            ctx.textAlign = 'center';
            ctx.fillText(player.kd, 750, y + 42);
            
            // K/D коэффициент с подсветкой
            if (player.ratio > 3) {
                ctx.fillStyle = '#4ade80'; // Зеленый для высокого KD
            } else if (player.ratio > 1.5) {
                ctx.fillStyle = '#fbbf24'; // Желтый
            }
            ctx.fillText(player.ratio.toString(), 950, y + 42);
            ctx.fillStyle = this.design.textColor;

            ctx.fillText(player.playtime, 1150, y + 42);
            ctx.fillText(player.distance, 1400, y + 42);
            
            // Точность
            ctx.font = '20px Arial';
            ctx.fillText(player.accuracy, 1700, y + 42);
            ctx.font = '24px Arial';
        });
    }

    /**
     * Обновление и генерация лидерборда
     */
    async updateLeaderboard(force = false) {
        const now = Date.now();
        
        // Проверка кэша
        if (!force && this.cachedImage && this.lastUpdate) {
            if (now - this.lastUpdate < this.updateInterval) {
                console.log('📊 Используется кэшированный лидерборд');
                return this.cachedImage;
            }
        }

        console.log('🔄 Обновление лидерборда...');
        
        try {
            const players = await this.fetchLeaderboardData();
            const image = await this.generateLeaderboardImage(players);
            
            this.cachedImage = image;
            this.lastUpdate = now;
            
            console.log('✅ Лидерборд обновлен');
            return image;
        } catch (error) {
            console.error('❌ Ошибка обновления лидерборда:', error);
            
            // Возвращаем кэш если есть
            if (this.cachedImage) {
                console.log('⚠️ Используется старый кэш');
                return this.cachedImage;
            }
            
            throw error;
        }
    }

    /**
     * Обработка команды !top в Discord
     */
    async handleTopCommand(message) {
        if (!message.content.startsWith('!top') && !message.content.startsWith('!лидерборд')) {
            return;
        }

        await message.channel.sendTyping();

        try {
            const imageBuffer = await this.updateLeaderboard();
            const attachment = new AttachmentBuilder(imageBuffer, { 
                name: 'leaderboard.png' 
            });

            await message.reply({ 
                content: '🏆 **Топ игроков сервера**',
                files: [attachment] 
            });
        } catch (error) {
            await message.reply('❌ Не удалось загрузить лидерборд. Попробуй позже.');
        }
    }

    /**
     * Автоматическая публикация лидерборда в канал
     */
    async autoPostLeaderboard(channel, interval = 3600000) { // 1 час по умолчанию
        setInterval(async () => {
            try {
                const imageBuffer = await this.updateLeaderboard(true);
                const attachment = new AttachmentBuilder(imageBuffer, { 
                    name: 'leaderboard.png' 
                });

                await channel.send({ 
                    content: '🏆 **Обновление лидерборда**',
                    files: [attachment] 
                });
                
                console.log('✅ Лидерборд автоматически опубликован');
            } catch (error) {
                console.error('❌ Ошибка автопоста лидерборда:', error);
            }
        }, interval);
    }
}

module.exports = LeaderboardGenerator;
