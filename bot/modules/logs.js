const { AuditLogEvent, EmbedBuilder, Events } = require('discord.js');

function normalizeLogsConfig(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {};
  return {
    enabled: Boolean(cfg.enabled),
    channelId: String(cfg.channelId || '').trim(),
    includeVoice: cfg.includeVoice !== false,
    includeMessages: cfg.includeMessages !== false,
  };
}

function createLogsModule(rawConfig) {
  const config = normalizeLogsConfig(rawConfig);

  async function send(guild, embed) {
    if (!config.enabled || !config.channelId || !guild) {
      return;
    }
    const channel = await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return;
    }
    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  function register(client) {
    if (!config.enabled) {
      return;
    }

    client.on(Events.GuildMemberAdd, (member) => {
      void send(
        member.guild,
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('📥 Участник зашёл')
          .setDescription(`<@${member.id}> **${member.user.tag}**`)
          .addFields({
            name: 'Аккаунт создан',
            value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
          })
          .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
          .setTimestamp()
      );
    });

    client.on(Events.GuildMemberRemove, (member) => {
      void send(
        member.guild,
        new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle('📤 Участник вышел')
          .setDescription(`**${member.user.tag}** (${member.id})`)
          .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
          .setTimestamp()
      );
    });

    client.on(Events.GuildBanAdd, async (ban) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const logs = await ban.guild
        .fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 })
        .catch(() => null);
      const entry = logs?.entries.first();
      const moderator = entry?.executor?.tag ?? 'Неизвестно';
      const reason = entry?.reason ?? 'Причина не указана';

      await send(
        ban.guild,
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🔨 Бан')
          .setDescription(`<@${ban.user.id}> **${ban.user.tag}**`)
          .addFields(
            { name: 'Модератор', value: moderator, inline: true },
            { name: 'Причина', value: reason, inline: true }
          )
          .setThumbnail(ban.user.displayAvatarURL({ forceStatic: false }))
          .setTimestamp()
      );
    });

    client.on(Events.GuildBanRemove, async (ban) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const logs = await ban.guild
        .fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 })
        .catch(() => null);
      const entry = logs?.entries.first();
      const moderator = entry?.executor?.tag ?? 'Неизвестно';

      await send(
        ban.guild,
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle('✅ Разбан')
          .setDescription(`**${ban.user.tag}** (${ban.user.id})`)
          .addFields({ name: 'Модератор', value: moderator, inline: true })
          .setTimestamp()
      );
    });

    client.on(Events.GuildMemberRemove, async (member) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const logs = await member.guild
        .fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 })
        .catch(() => null);
      const entry = logs?.entries.first();
      if (!entry || entry.target?.id !== member.id) {
        return;
      }
      if (Date.now() - entry.createdTimestamp > 3000) {
        return;
      }

      await send(
        member.guild,
        new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle('👢 Кик')
          .setDescription(`**${member.user.tag}** (${member.id})`)
          .addFields(
            { name: 'Модератор', value: entry.executor?.tag || 'Неизвестно', inline: true },
            { name: 'Причина', value: entry.reason ?? 'Причина не указана', inline: true }
          )
          .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
          .setTimestamp()
      );
    });

    if (config.includeMessages) {
      client.on(Events.MessageDelete, (message) => {
        if (!message.guild || message.author?.bot || !message.content) {
          return;
        }

        void send(
          message.guild,
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('🗑️ Сообщение удалено')
            .setDescription(`**Автор:** <@${message.author.id}>\n**Канал:** <#${message.channelId}>`)
            .addFields({ name: 'Содержимое', value: message.content.slice(0, 1024) || '—' })
            .setTimestamp()
        );
      });

      client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
        if (!newMessage.guild || newMessage.author?.bot) {
          return;
        }
        if (!oldMessage.content || oldMessage.content === newMessage.content) {
          return;
        }

        void send(
          newMessage.guild,
          new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle('✏️ Сообщение изменено')
            .setDescription(
              `**Автор:** <@${newMessage.author.id}>\n**Канал:** <#${newMessage.channelId}>\n[Перейти](${newMessage.url})`
            )
            .addFields(
              { name: 'Было', value: oldMessage.content.slice(0, 512) || '—' },
              { name: 'Стало', value: newMessage.content.slice(0, 512) || '—' }
            )
            .setTimestamp()
        );
      });
    }

    if (config.includeVoice) {
      client.on(Events.VoiceStateUpdate, (oldState, newState) => {
        const member = newState.member || oldState.member;
        if (!member) {
          return;
        }

        if (!oldState.channelId && newState.channelId) {
          void send(
            newState.guild,
            new EmbedBuilder()
              .setColor(0x9b59b6)
              .setTitle('🔊 Войс: вход')
              .setDescription(`<@${member.id}> **${member.user.tag}**`)
              .addFields({ name: 'Канал', value: `<#${newState.channelId}>`, inline: true })
              .setTimestamp()
          );
          return;
        }

        if (oldState.channelId && !newState.channelId) {
          void send(
            oldState.guild,
            new EmbedBuilder()
              .setColor(0x7f8c8d)
              .setTitle('🔇 Войс: выход')
              .setDescription(`<@${member.id}> **${member.user.tag}**`)
              .addFields({ name: 'Канал', value: `<#${oldState.channelId}>`, inline: true })
              .setTimestamp()
          );
          return;
        }

        if (
          oldState.channelId &&
          newState.channelId &&
          oldState.channelId !== newState.channelId
        ) {
          void send(
            newState.guild,
            new EmbedBuilder()
              .setColor(0x9b59b6)
              .setTitle('🔀 Войс: смена канала')
              .setDescription(`<@${member.id}> **${member.user.tag}**`)
              .addFields(
                { name: 'Откуда', value: `<#${oldState.channelId}>`, inline: true },
                { name: 'Куда', value: `<#${newState.channelId}>`, inline: true }
              )
              .setTimestamp()
          );
        }
      });
    }
  }

  return {
    ...config,
    register,
  };
}

module.exports = {
  normalizeLogsConfig,
  createLogsModule,
};
