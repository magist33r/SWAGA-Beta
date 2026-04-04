const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

function createTicketsModule(options) {
  const {
    TICKET_IDLE_CLOSE_SECONDS,
    DEFAULT_LANGUAGE = 'ru',
    getConfig,
    getDb,
    getClient,
    getPrimaryGuild,
    getPrimaryServerName,
    normalizeLanguage,
    resolveUserLanguage,
    rememberUserLanguage,
    getMessagesForLanguage,
    formatMessage,
    normalizeSteamId64,
    isValidSteamId64,
    getLinkedSteamId,
    findDiscordIdBySteam,
    formatTariffDisplay,
    hasManageRoles,
    addHistory,
    logAction,
    enqueueOperation,
    enqueueBotDbSave,
    extractMetaPayload,
    assignMemberRole,
    unixNow,
    savePrimaryDb,
    clearInvalidLink,
    buildCfToolsProfileUrl,
    reconcileLinkedMemberAccess,
  } = options;

  function currentConfig() {
    return typeof getConfig === 'function' ? getConfig() : {};
  }

  function currentDb() {
    return typeof getDb === 'function' ? getDb() : null;
  }

  function currentClient() {
    return typeof getClient === 'function' ? getClient() : null;
  }

  function currentPrimaryGuild() {
    return typeof getPrimaryGuild === 'function' ? getPrimaryGuild() : null;
  }

  function currentPrimaryServerName() {
    return typeof getPrimaryServerName === 'function' ? getPrimaryServerName() : 'unknown';
  }

  function normalizeTicketLanguage(language, fallback = DEFAULT_LANGUAGE) {
    if (typeof normalizeLanguage === 'function') {
      return normalizeLanguage(language, fallback);
    }
    return String(language || fallback || 'ru').toLowerCase().startsWith('en') ? 'en' : 'ru';
  }

  async function runInOperation(task) {
    if (typeof enqueueOperation === 'function') {
      return enqueueOperation(task);
    }
    return task();
  }

  function getTicketConfig() {
    return currentConfig().tickets || {};
  }

  function getTicketMessages(language) {
    const normalized = normalizeTicketLanguage(language, DEFAULT_LANGUAGE);
    if (normalized === 'en') {
      return {
        missingConfig: '⚠️ Ticket system is not configured. Contact an administrator.',
        ticketCreated: '✅ Ticket created: <#{channelId}>',
        ticketAlreadyExists: 'ℹ️ You already have an open ticket: <#{channelId}>',
        ticketCreateFailed: '⚠️ Failed to create ticket. Check bot permissions.',
        notTicketChannel: '⚠️ This channel is not a ticket.',
        ticketClosed: '✅ Ticket closed.',
        noPermDelete: '🚫 Only administrators can delete tickets.',
        ticketDeleted: '✅ Ticket deleted.',
        ticketDeleteFailed: '⚠️ Failed to delete ticket channel.',
        noPermPanel: '🚫 Not enough permissions.',
        panelPosted: '✅ Ticket panel posted in <#{channelId}>.',
        panelPostFailed: '⚠️ Failed to post ticket panel.',
        modalTitle: 'Open ticket',
        modalSteamLabel: 'Your SteamID64',
        modalSteamPlaceholder: '7656119xxxxxxxxxx',
        noVip: '❌ No VIP',
        vipForever: '✅ Forever',
        vipExpired: '❌ Expired',
        vipUntil: '✅ Until <t:{expiresAt}:F>',
        tariffField: 'Tariff',
        supportTitle: '📩 SWAGA Support',
        supportDescription:
          'Choose a language and press the button below to open a ticket.\n\n' +
          '> The ticket is visible only to you and the support team.',
        supportFooter: 'SWAGA Support',
        openTitle: '🎫 New ticket',
        openDescription:
          'Describe your issue or question. A support member will reply as soon as possible.',
        closeTitle: '🔒 Ticket closed',
        closeDescription:
          'Ticket was closed by <@{closedBy}>.\nThe channel has been moved to archive mode.',
        autoCloseTitle: '🔒 Ticket closed automatically',
        autoCloseDescription:
          'Ticket was closed automatically because no message from ticket owner was sent within 5 minutes.',
        closeButton: '🔒 Close ticket',
        createButtonRu: 'Ticket (RU)',
        createButtonEn: 'Make a ticket',
        fieldDiscord: 'Discord',
        fieldSteam: 'SteamID64',
        fieldVip: 'VIP',
      };
    }

    return {
      missingConfig: '⚠️ Тикет-система не настроена. Свяжитесь с администратором.',
      ticketCreated: '✅ Тикет создан: <#{channelId}>',
      ticketAlreadyExists: 'ℹ️ У вас уже есть открытый тикет: <#{channelId}>',
      ticketCreateFailed: '⚠️ Не удалось создать тикет. Проверьте права бота.',
      notTicketChannel: '⚠️ Этот канал не является тикетом.',
      ticketClosed: '✅ Тикет закрыт.',
      noPermDelete: '🚫 Удалять тикеты могут только администраторы.',
      ticketDeleted: '✅ Тикет удалён.',
      ticketDeleteFailed: '⚠️ Не удалось удалить тикет-канал.',
      noPermPanel: '🚫 Недостаточно прав.',
      panelPosted: '✅ Панель тикетов размещена в <#{channelId}>.',
      panelPostFailed: '⚠️ Не удалось разместить панель тикетов.',
      modalTitle: 'Открытие тикета',
      modalSteamLabel: 'Ваш SteamID64',
      modalSteamPlaceholder: '7656119xxxxxxxxxx',
      noVip: '❌ Нет VIP',
      vipForever: '✅ Навсегда',
      vipExpired: '❌ Истёк',
      vipUntil: '✅ До <t:{expiresAt}:F>',
      tariffField: 'Тариф',
      supportTitle: '📩 Поддержка SWAGA',
      supportDescription:
        'Выберите язык и нажмите кнопку ниже, чтобы открыть тикет.\n\n' +
        '> Тикет увидят только вы и команда администраторов.',
      supportFooter: 'SWAGA Support',
      openTitle: '🎫 Новый тикет',
      openDescription:
        'Опишите вашу проблему или вопрос. Администратор ответит в ближайшее время.',
      closeTitle: '🔒 Тикет закрыт',
      closeDescription:
        'Тикет закрыт пользователем <@{closedBy}>.\nКанал переведён в режим архива.',
      autoCloseTitle: '🔒 Тикет закрыт автоматически',
      autoCloseDescription:
        'Тикет автоматически закрыт, потому что владелец не отправил ни одного сообщения в течение 5 минут.',
      closeButton: '🔒 Закрыть тикет',
      createButtonRu: 'Создать тикет',
      createButtonEn: 'Make a ticket',
      fieldDiscord: 'Discord',
      fieldSteam: 'SteamID64',
      fieldVip: 'VIP',
    };
  }

  function formatTicketSteamFieldValue(steam64) {
    if (!steam64) {
      return '-';
    }
    const normalized = String(steam64).trim();
    if (!isValidSteamId64(normalized)) {
      return normalized;
    }
    const profileUrl = buildCfToolsProfileUrl(normalized);
    return `[${normalized}](${profileUrl})`;
  }

  function buildTicketOpenEmbed(member, steam64, language) {
    const ticketMessages = getTicketMessages(language);
    const fields = [
      {
        name: ticketMessages.fieldDiscord,
        value: `<@${member.id}> (${member.id})`,
        inline: true,
      },
      {
        name: ticketMessages.fieldSteam,
        value: formatTicketSteamFieldValue(steam64),
        inline: true,
      },
    ];

    return new EmbedBuilder()
      .setTitle(ticketMessages.openTitle)
      .setColor(0x5865f2)
      .setDescription(ticketMessages.openDescription)
      .addFields(fields)
      .setTimestamp();
  }

  function buildTicketPanelEmbed(language) {
    const ticketMessages = getTicketMessages(language);
    return new EmbedBuilder()
      .setTitle(ticketMessages.supportTitle)
      .setColor(0x5865f2)
      .setDescription(ticketMessages.supportDescription)
      .setFooter({ text: ticketMessages.supportFooter })
      .setTimestamp();
  }

  function buildTicketClosedEmbed(closedBy, language) {
    const ticketMessages = getTicketMessages(language);
    return new EmbedBuilder()
      .setTitle(ticketMessages.closeTitle)
      .setColor(0x747f8d)
      .setDescription(
        formatMessage(ticketMessages.closeDescription, {
          closedBy,
        })
      )
      .setTimestamp();
  }

  function buildTicketAutoClosedEmbed(language) {
    const ticketMessages = getTicketMessages(language);
    return new EmbedBuilder()
      .setTitle(ticketMessages.autoCloseTitle)
      .setColor(0x747f8d)
      .setDescription(ticketMessages.autoCloseDescription)
      .setTimestamp();
  }

  function buildCloseButtonRow(language) {
    const ticketMessages = getTicketMessages(language);
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel(ticketMessages.closeButton)
        .setStyle(ButtonStyle.Danger)
    );
  }

  function buildOpenButtonRow() {
    const ticketMessagesRu = getTicketMessages('ru');
    const ticketMessagesEn = getTicketMessages('en');
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_create_ru')
        .setLabel(ticketMessagesRu.createButtonRu)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_create_en')
        .setLabel(ticketMessagesEn.createButtonEn)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  function buildTicketCreateModal(language, steam64) {
    const ticketMessages = getTicketMessages(language);
    const steamInput = new TextInputBuilder()
      .setCustomId('ticket_steam64')
      .setLabel(ticketMessages.modalSteamLabel)
      .setPlaceholder(ticketMessages.modalSteamPlaceholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(17);
    if (steam64) {
      steamInput.setValue(steam64);
    }
    return new ModalBuilder()
      .setCustomId(`ticket_create_modal_${language}`)
      .setTitle(ticketMessages.modalTitle)
      .addComponents(new ActionRowBuilder().addComponents(steamInput));
  }

  async function showTicketCreateModal(interaction, forcedLanguage = null) {
    const fallbackLanguage = resolveUserLanguage(interaction.user.id, interaction.guild?.preferredLocale);
    const language = forcedLanguage
      ? normalizeTicketLanguage(forcedLanguage, fallbackLanguage)
      : fallbackLanguage;
    const linkedSteam = getLinkedSteamId(interaction.user.id);
    if (linkedSteam) {
      await handleTicketCreate(interaction, language);
      return;
    }
    const modal = buildTicketCreateModal(language, linkedSteam);
    await interaction.showModal(modal);
  }

  async function saveSteamLinkFromTicketModal(interaction, steam64, language) {
    const messages = getMessagesForLanguage(language);
    let outcome = 'unchanged';
    let deniedMessage = '';
    let previousLink = null;

    await runInOperation(async () => {
      const db = currentDb();
      if (!db) {
        outcome = 'denied';
        deniedMessage = messages.genericError;
        return;
      }

      const discordId = interaction.user.id;
      const existingLink = getLinkedSteamId(discordId);
      previousLink = existingLink || null;
      if (existingLink && existingLink !== steam64) {
        deniedMessage = messages.steamidAlreadyLinked;
        outcome = 'denied';
        await logAction('link_update_denied', {
          serverName: currentPrimaryServerName(),
          discordId,
          steam64,
          roleName: null,
          expiresAt: null,
          note: 'ticket_modal_existing_link',
        });
        return;
      }

      const existingOwner = findDiscordIdBySteam(steam64);
      if (existingOwner && existingOwner !== discordId) {
        deniedMessage = messages.steamidOwned;
        outcome = 'denied';
        await logAction('link_update_denied', {
          serverName: currentPrimaryServerName(),
          discordId,
          steam64,
          roleName: null,
          expiresAt: null,
          note: `ticket_modal_owned_by=${existingOwner}`,
        });
        return;
      }

      if (existingLink === steam64) {
        outcome = 'unchanged';
        return;
      }

      db.links[discordId] = steam64;
      if (typeof clearInvalidLink === 'function') {
        clearInvalidLink(discordId);
      }
      addHistory('link_set', {
        discordId,
        steam64,
        roleName: null,
        expiresAt: null,
        note: 'ticket_modal',
      });
      await savePrimaryDb();
      outcome = 'saved';
      await logAction('link_set', {
        serverName: currentPrimaryServerName(),
        discordId,
        steam64,
        roleName: null,
        expiresAt: null,
        note: 'ticket_modal',
      });
    });

    if (outcome === 'denied') {
      return { ok: false, message: deniedMessage };
    }

    if (outcome === 'saved') {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (member) {
          await assignMemberRole(member);
          if (typeof reconcileLinkedMemberAccess === 'function') {
            await reconcileLinkedMemberAccess(member, previousLink);
          }
        }
      } catch (err) {
        // Do not fail ticket creation when role assignment fails.
      }
    }

    return { ok: true };
  }

  async function handleTicketCreateModalSubmit(interaction) {
    const forcedLanguage = interaction.customId.endsWith('_en') ? 'en' : 'ru';
    const fallbackLanguage = resolveUserLanguage(interaction.user.id, interaction.guild?.preferredLocale);
    const language = normalizeTicketLanguage(forcedLanguage, fallbackLanguage);
    const messages = getMessagesForLanguage(language);
    const steam64 = normalizeSteamId64(interaction.fields.getTextInputValue('ticket_steam64'));
    if (!isValidSteamId64(steam64)) {
      await interaction.reply({
        content: messages.invalidSteamId,
        ephemeral: true,
      });
      return;
    }

    const saveResult = await saveSteamLinkFromTicketModal(interaction, steam64, language);
    if (!saveResult.ok) {
      await interaction.reply({
        content: saveResult.message || messages.genericError,
        ephemeral: true,
      });
      return;
    }

    await handleTicketCreate(interaction, language);
  }

  function getVipStatusLabel(steam64, language) {
    const ticketMessages = getTicketMessages(language);
    const db = currentDb();
    if (!steam64 || !db) {
      return ticketMessages.noVip;
    }
    const steamKey = String(steam64);
    const now = unixNow();
    const inWhitelist = db.whiteList?.vip?.includes(steamKey);
    if (!inWhitelist) {
      return ticketMessages.noVip;
    }
    const timedRecord = db.vipTimed?.[steamKey];
    if (!timedRecord) {
      return ticketMessages.vipForever;
    }
    const expiresAt = Number(timedRecord.expiresAt) || 0;
    if (expiresAt === 0) {
      return ticketMessages.vipForever;
    }
    if (expiresAt < now) {
      return ticketMessages.vipExpired;
    }
    return formatMessage(ticketMessages.vipUntil, { expiresAt });
  }

  function getTariffLabelForSteam(steam64, language) {
    const db = currentDb();
    if (!steam64 || !db) {
      return null;
    }
    const steamKey = String(steam64);
    const timedRecord = db.vipTimed?.[steamKey];
    const roleName = timedRecord?.roleName;
    if (!roleName) {
      return null;
    }
    return formatTariffDisplay(roleName, language);
  }

  function buildSafeChannelName(username) {
    const normalized = String(username || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return `ticket-${normalized || 'user'}`;
  }

  function getTicketRecordForUser(discordId) {
    const db = currentDb();
    if (!db?.tickets || !discordId) {
      return null;
    }
    for (const [channelId, ticket] of Object.entries(db.tickets)) {
      if (ticket?.discordId === discordId && !ticket?.closedAt) {
        return { channelId, ticket };
      }
    }
    return null;
  }

  async function handleTicketCreate(interaction, forcedLanguage = null) {
    if (!interaction.inGuild()) {
      return;
    }

    const db = currentDb();
    if (!db) {
      return;
    }

    const fallbackLanguage = resolveUserLanguage(interaction.user.id, interaction.guild?.preferredLocale);
    const language = forcedLanguage
      ? normalizeTicketLanguage(forcedLanguage, fallbackLanguage)
      : fallbackLanguage;
    rememberUserLanguage(interaction.user.id, language);
    const ticketMessages = getTicketMessages(language);
    const ticketConfig = getTicketConfig();
    if (!ticketConfig.categoryId) {
      await interaction.reply({
        content: ticketMessages.missingConfig,
        ephemeral: true,
      });
      return;
    }

    const existingTicket = getTicketRecordForUser(interaction.user.id);
    if (existingTicket) {
      await interaction.reply({
        content: formatMessage(ticketMessages.ticketAlreadyExists, {
          channelId: existingTicket.channelId,
        }),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const discordId = interaction.user.id;
    const steam64 = getLinkedSteamId(discordId);
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: discordId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ];

    if (ticketConfig.supportRoleId) {
      permissionOverwrites.push({
        id: ticketConfig.supportRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      });
    }

    let channel;
    try {
      channel = await guild.channels.create({
        name: buildSafeChannelName(interaction.user.username),
        type: ChannelType.GuildText,
        parent: ticketConfig.categoryId,
        permissionOverwrites,
        reason: `Ticket by ${interaction.user.tag}`,
      });
    } catch (err) {
      console.error('[tickets] Failed to create channel:', err?.message || err);
      await interaction.editReply({ content: ticketMessages.ticketCreateFailed });
      return;
    }

    if (!db.tickets || typeof db.tickets !== 'object') {
      db.tickets = {};
    }
    db.tickets[channel.id] = {
      discordId,
      steam64: steam64 || null,
      openedAt: unixNow(),
      language,
      firstUserMessageAt: null,
      supportNotifiedAt: null,
    };
    await enqueueBotDbSave(extractMetaPayload(db));

    const ticketEmbed = buildTicketOpenEmbed(interaction.user, steam64, language);
    const closeRow = buildCloseButtonRow(language);

    await channel.send({
      content: `<@${discordId}>`,
      allowedMentions: {
        users: [discordId],
      },
      embeds: [ticketEmbed],
      components: [closeRow],
    });

    await interaction.editReply({
      content: formatMessage(ticketMessages.ticketCreated, {
        channelId: channel.id,
      }),
    });

    await logAction('ticket_open', {
      serverName: currentPrimaryServerName(),
      discordId,
      steam64: steam64 || null,
      roleName: null,
      expiresAt: null,
      note: `channel=${channel.id}`,
    });
  }

  async function closeTicketChannel(channel, ticketRecord, options = {}) {
    if (!ticketRecord || ticketRecord.closedAt) {
      return;
    }

    const db = currentDb();
    if (!db) {
      return;
    }

    const client = currentClient();
    const reason = String(options.reason || 'manual');
    const closedBy = String(options.closedBy || client?.user?.id || 'system');
    const guildLocale = channel?.guild?.preferredLocale || currentPrimaryGuild()?.preferredLocale;
    const ticketLanguage = normalizeTicketLanguage(
      ticketRecord.language,
      resolveUserLanguage(ticketRecord.discordId, guildLocale)
    );
    const ticketConfig = getTicketConfig();
    ticketRecord.closedAt = unixNow();
    ticketRecord.closedBy = closedBy;
    ticketRecord.closeReason = reason;
    await enqueueBotDbSave(extractMetaPayload(db));

    if (channel && channel.isTextBased()) {
      try {
        const closeEmbed =
          reason === 'inactive_timeout'
            ? buildTicketAutoClosedEmbed(ticketLanguage)
            : buildTicketClosedEmbed(closedBy, ticketLanguage);
        await channel.send({
          embeds: [closeEmbed],
        });
      } catch (err) {
        console.warn('[tickets] Failed to send close message:', err?.message || err);
      }

      try {
        await channel.permissionOverwrites.edit(ticketRecord.discordId, {
          ViewChannel: false,
          SendMessages: false,
          ReadMessageHistory: false,
        });
      } catch (err) {
        console.warn('[tickets] Failed to revoke ticket owner write access:', err?.message || err);
      }

      const archiveCategoryId = ticketConfig.archiveCategoryId || ticketConfig.categoryId;
      if (archiveCategoryId && archiveCategoryId !== channel.parentId) {
        try {
          await channel.setParent(archiveCategoryId, {
            lockPermissions: false,
            reason: 'Ticket archived',
          });
        } catch (err) {
          console.warn('[tickets] Failed to move ticket to archive category:', err?.message || err);
        }
      }

      try {
        const baseName = String(channel.name || '').replace(/^(closed-)+/, '');
        await channel.setName(`closed-${baseName}`, 'Ticket closed');
      } catch (err) {
        console.warn('[tickets] Failed to rename ticket channel:', err?.message || err);
      }
    }

    await logAction('ticket_close', {
      serverName: currentPrimaryServerName(),
      discordId: ticketRecord.discordId || null,
      steam64: ticketRecord.steam64 || null,
      roleName: null,
      expiresAt: null,
      note: `channel=${channel?.id || '-'} by=${closedBy} reason=${reason}`,
    });
  }

  async function handleTicketClose(interaction) {
    if (!interaction.inGuild()) {
      return;
    }

    const db = currentDb();
    if (!db) {
      return;
    }

    const ticketMessages = getTicketMessages(
      resolveUserLanguage(interaction.user.id, interaction.guild?.preferredLocale)
    );
    const channel = interaction.channel;
    const ticketRecord = db.tickets?.[channel?.id];
    if (!ticketRecord) {
      await interaction.reply({
        content: ticketMessages.notTicketChannel,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await closeTicketChannel(channel, ticketRecord, {
      reason: 'manual',
      closedBy: interaction.user.id,
    });

    await interaction.editReply({
      content: ticketMessages.ticketClosed,
    });
  }

  async function handleTicketPanelCommand(interaction, language) {
    if (!interaction.inGuild()) {
      return;
    }

    const ticketMessages = getTicketMessages(language);
    if (!hasManageRoles(interaction)) {
      await interaction.reply({
        content: ticketMessages.noPermPanel,
        ephemeral: true,
      });
      return;
    }

    const ticketConfig = getTicketConfig();
    let targetChannel = interaction.channel;
    if (ticketConfig.panelChannelId) {
      const configuredChannel = await interaction.guild.channels
        .fetch(ticketConfig.panelChannelId)
        .catch(() => null);
      if (configuredChannel?.isTextBased()) {
        targetChannel = configuredChannel;
      }
    }

    const panelEmbed = buildTicketPanelEmbed(language);
    const openRow = buildOpenButtonRow();

    try {
      await targetChannel.send({
        embeds: [panelEmbed],
        components: [openRow],
      });
    } catch (err) {
      await interaction.reply({
        content: ticketMessages.panelPostFailed,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: formatMessage(ticketMessages.panelPosted, {
        channelId: targetChannel.id,
      }),
      ephemeral: true,
    });

    await logAction('ticket_panel', {
      serverName: currentPrimaryServerName(),
      discordId: interaction.user.id,
      steam64: null,
      roleName: null,
      expiresAt: null,
      note: `channel=${targetChannel.id}`,
    });
  }

  async function handleTicketDeleteCommand(interaction, language) {
    const db = currentDb();
    if (!db) {
      return;
    }

    const ticketMessages = getTicketMessages(language);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: ticketMessages.noPermDelete,
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.channel;
    const channelId = channel?.id;
    const ticketRecord = channelId ? db.tickets?.[channelId] : null;
    if (!ticketRecord) {
      await interaction.reply({
        content: ticketMessages.notTicketChannel,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await channel.delete(`Ticket deleted by ${interaction.user.tag}`);
    } catch (err) {
      console.error('[tickets] Failed to delete ticket channel:', err?.message || err);
      await interaction.editReply({
        content: ticketMessages.ticketDeleteFailed,
      });
      return;
    }

    if (db.tickets && db.tickets[channelId]) {
      delete db.tickets[channelId];
      await enqueueBotDbSave(extractMetaPayload(db));
    }

    await logAction('ticket_delete', {
      serverName: currentPrimaryServerName(),
      discordId: ticketRecord.discordId || null,
      steam64: ticketRecord.steam64 || null,
      roleName: null,
      expiresAt: null,
      note: `channel=${channelId} by=${interaction.user.id}`,
    });

    try {
      await interaction.editReply({
        content: ticketMessages.ticketDeleted,
      });
    } catch (err) {
      // Channel is removed; ignore failed ephemeral update.
    }
  }

  async function handleTicketOwnerFirstMessage(message) {
    const db = currentDb();
    if (!db || !message.inGuild() || !message.channelId || message.author?.bot) {
      return;
    }

    const ticketRecord = db.tickets?.[message.channelId];
    if (!ticketRecord || ticketRecord.closedAt) {
      return;
    }
    if (String(ticketRecord.discordId) !== String(message.author.id)) {
      return;
    }

    const now = unixNow();
    let changed = false;
    if (!ticketRecord.firstUserMessageAt) {
      ticketRecord.firstUserMessageAt = now;
      changed = true;
    }

    const ticketConfig = getTicketConfig();
    if (ticketConfig.supportRoleId && !ticketRecord.supportNotifiedAt) {
      try {
        await message.channel.send({
          content: `<@&${ticketConfig.supportRoleId}>`,
          allowedMentions: {
            roles: [ticketConfig.supportRoleId],
          },
        });
        ticketRecord.supportNotifiedAt = now;
        changed = true;
      } catch (err) {
        console.warn('[tickets] Failed to notify support role:', err?.message || err);
      }
    }

    if (changed) {
      await enqueueBotDbSave(extractMetaPayload(db));
    }
  }

  async function runTicketInactivityCheck() {
    const db = currentDb();
    if (!db) {
      return;
    }

    const client = currentClient();
    const now = unixNow();
    const staleChannelIds = [];
    for (const [channelId, ticketRecord] of Object.entries(db.tickets || {})) {
      if (!ticketRecord || ticketRecord.closedAt) {
        continue;
      }
      if (ticketRecord.firstUserMessageAt) {
        continue;
      }
      const openedAt = Number(ticketRecord.openedAt) || 0;
      if (!openedAt) {
        continue;
      }
      if (now - openedAt >= TICKET_IDLE_CLOSE_SECONDS) {
        staleChannelIds.push(channelId);
      }
    }

    for (const channelId of staleChannelIds) {
      const ticketRecord = db.tickets?.[channelId];
      if (!ticketRecord || ticketRecord.closedAt || ticketRecord.firstUserMessageAt) {
        continue;
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        ticketRecord.closedAt = now;
        ticketRecord.closedBy = String(client.user?.id || 'system');
        ticketRecord.closeReason = 'inactive_timeout_missing_channel';
        await enqueueBotDbSave(extractMetaPayload(db));
        await logAction('ticket_close', {
          serverName: currentPrimaryServerName(),
          discordId: ticketRecord.discordId || null,
          steam64: ticketRecord.steam64 || null,
          roleName: null,
          expiresAt: null,
          note: `channel=${channelId} by=system reason=inactive_timeout_missing_channel`,
        });
        continue;
      }

      await closeTicketChannel(channel, ticketRecord, {
        reason: 'inactive_timeout',
        closedBy: String(client.user?.id || 'system'),
      });
    }
  }

  async function handlePaymentCommand(interaction) {
    if (!interaction.inGuild()) {
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '🚫 Недостаточно прав.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Реквизиты для оплаты')
      .setColor(0x5865f2)
      .setDescription(
        '**ТБанк** — `5536914041328034`\n\n' +
        '⚠️ В комментарии к платежу ничего писать не нужно\n\n' +
        '🔄 Получатель: **Тимур М**'
      );

    await interaction.reply({ embeds: [embed] });
  }

  return {
    showTicketCreateModal,
    handleTicketCreateModalSubmit,
    handleTicketClose,
    handleTicketPanelCommand,
    handleTicketDeleteCommand,
    handleTicketOwnerFirstMessage,
    runTicketInactivityCheck,
    handlePaymentCommand,
  };
}

module.exports = {
  createTicketsModule,
};
