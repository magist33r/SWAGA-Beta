const { Client, GatewayIntentBits } = require('discord.js');
const LeaderboardGenerator = require('./leaderboard-generator');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Инициализация генератора лидерборда
const leaderboard = new LeaderboardGenerator({
    cfCloudApiKey: process.env.CFCLOUD_API_KEY,
    cfCloudServerId: process.env.CFCLOUD_SERVER_ID,
    
    // Дизайн (настрой под себя)
    logoPath: './assets/logo.png',          // Твой лого
    backgroundPath: './assets/bg.png',      // Фоновая картинка
    fontPath: './assets/font.ttf',          // Кастомный шрифт (опционально)
    
    design: {
        accentColor: '#ff6b35',  // Главный цвет акцентов
        // Остальные цвета можно тоже переопределить
    },
    
    topCount: 10,                // Сколько игроков показывать
    updateInterval: 300000       // Обновление кэша каждые 5 минут
});

client.once('ready', async () => {
    console.log(`✅ Бот запущен как ${client.user.tag}`);
    
    // Регистрация шрифта если есть
    leaderboard.registerCustomFont();
    
    // Автопост лидерборда в канал каждый час
    const leaderboardChannel = client.channels.cache.get('ID_КАНАЛА_ДЛЯ_ЛИДЕРБОРДА');
    if (leaderboardChannel) {
        leaderboard.autoPostLeaderboard(leaderboardChannel, 3600000); // 1 час
        console.log('✅ Автопост лидерборда настроен');
    }
});

// Команда !top
client.on('messageCreate', async (message) => {
    await leaderboard.handleTopCommand(message);
});

// Команда для принудительного обновления (только для админов)
client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!update-top')) return;
    
    // Проверка прав администратора
    if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ Нет прав');
    }

    await message.channel.sendTyping();
    
    try {
        const imageBuffer = await leaderboard.updateLeaderboard(true); // force update
        const { AttachmentBuilder } = require('discord.js');
        const attachment = new AttachmentBuilder(imageBuffer, { 
            name: 'leaderboard.png' 
        });

        await message.reply({ 
            content: '✅ **Лидерборд принудительно обновлен**',
            files: [attachment] 
        });
    } catch (error) {
        await message.reply('❌ Ошибка обновления');
    }
});

client.login(process.env.DISCORD_TOKEN);
