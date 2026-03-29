const { EmbedBuilder, Events } = require('discord.js');

function normalizeWelcomeConfig(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {};
  return {
    enabled: Boolean(cfg.enabled),
    channelId: String(cfg.channelId || '').trim(),
    rulesChannelId: String(cfg.rulesChannelId || '').trim(),
    infoChannelId: String(cfg.infoChannelId || '').trim(),
    donateChannelId: String(cfg.donateChannelId || '').trim(),
    titlePrefix: String(cfg.titlePrefix || '👋 Добро пожаловать').trim() || '👋 Добро пожаловать',
    projectName: String(cfg.projectName || 'SWAGA').trim() || 'SWAGA',
    color: Number(cfg.color) || 0xe74c3c,
  };
}

function mentionChannel(channelId) {
  return channelId ? `<#${channelId}>` : '—';
}

function createWelcomeModule(rawConfig) {
  const config = normalizeWelcomeConfig(rawConfig);

  async function handleMemberAdd(member) {
    if (!config.enabled || !config.channelId) {
      return;
    }

    const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(config.color)
      .setTitle(`${config.titlePrefix}, ${member.user.username}!`)
      .setDescription(
        `Ты на сервере **${config.projectName}**.\n\n` +
          `📌 Правила: ${mentionChannel(config.rulesChannelId)}\n` +
          `🎮 Информация: ${mentionChannel(config.infoChannelId)}\n` +
          `💎 VIP/Донат: ${mentionChannel(config.donateChannelId)}`
      )
      .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
      .setFooter({ text: `${config.projectName} • Участник #${member.guild.memberCount}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  function register(client) {
    if (!config.enabled) {
      return;
    }
    client.on(Events.GuildMemberAdd, handleMemberAdd);
  }

  return {
    ...config,
    register,
  };
}

module.exports = {
  normalizeWelcomeConfig,
  createWelcomeModule,
};
