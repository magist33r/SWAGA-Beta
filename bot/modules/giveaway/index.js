const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const DEFAULT_CFTOOLS_SERVERS = [
  { key: 's1', name: 'SWAGA 20MM', id: '00ebc10b-efbe-437a-bf0f-7fde12ee53ff' },
  { key: 's2', name: 'SWAGA .338', id: '91dccd12-97de-4340-b23b-dde8a2f64e44' },
  { key: 's3', name: 'SWAGA VANILLA', id: 'af7eebde-c26e-4ece-a0b6-31daebab5080' },
];

function createGiveawayCommand({ SlashCommandBuilder, PermissionFlagsBits, prizeOptions }) {
  return new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a standard giveaway with a join button')
        .addStringOption((o) => {
          o.setName('prize').setDescription('VIP reward').setRequired(true);
          for (const option of prizeOptions) {
            o.addChoices({ name: option.label, value: option.value });
          }
          return o;
        })
        .addIntegerOption((o) =>
          o
            .setName('duration')
            .setDescription('Duration in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080)
        )
        .addIntegerOption((o) =>
          o
            .setName('winners')
            .setDescription('Number of winners (default 1)')
            .setMinValue(1)
            .setMaxValue(10)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('server')
        .setDescription('Pick a random winner from players currently online')
        .addStringOption((o) => {
          o.setName('prize').setDescription('VIP reward').setRequired(true);
          for (const option of prizeOptions) {
            o.addChoices({ name: option.label, value: option.value });
          }
          return o;
        })
        .addIntegerOption((o) =>
          o
            .setName('duration')
            .setDescription('Duration in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080)
        )
        .addStringOption((o) =>
          o
            .setName('server')
            .setDescription('Server to pick from')
            .setRequired(false)
            .addChoices(
              { name: 'SWAGA 20MM', value: 's1' },
              { name: 'SWAGA .338', value: 's2' },
              { name: 'SWAGA VANILLA', value: 's3' },
              { name: 'All servers', value: 'all' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End a giveaway early and pick a winner')
        .addStringOption((o) =>
          o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reroll')
        .setDescription('Reroll winner for ended giveaway')
        .addStringOption((o) =>
          o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)
        )
    );
}

function createGiveawayModule(options) {
  const {
    client,
    SlashCommandBuilder,
    PermissionFlagsBits,
    prizeOptions,
    giveawayVipRoleName,
    cftoolsServers = DEFAULT_CFTOOLS_SERVERS,
    getConfig,
    getPrimaryGuild,
    getPrimaryServerName,
    getDb,
    getMessagesForLanguage,
    getDefaultLanguage,
    getLinkedSteamId,
    normalizeSteamId64,
    isValidSteamId64,
    findDiscordIdBySteam,
    fetchGuildMember,
    ensureVip,
    persistAndSync,
    addHistory,
    logAction,
    sendDmToUserId,
    buildVipEmbed,
    resolveUserLanguage,
    unixNow,
    enqueueOperation,
    savePrimaryDb,
    buildCfToolsProfileUrl,
  } = options;

  const giveaways = new Map();
  const command = createGiveawayCommand({
    SlashCommandBuilder,
    PermissionFlagsBits,
    prizeOptions,
  });

  function currentDb() {
    return typeof getDb === 'function' ? getDb() : null;
  }

  function currentPrimaryServerName() {
    return typeof getPrimaryServerName === 'function' ? getPrimaryServerName() : 'unknown';
  }

  function currentPrimaryGuild() {
    return typeof getPrimaryGuild === 'function' ? getPrimaryGuild() : null;
  }

  function currentDefaultLanguage() {
    return typeof getDefaultLanguage === 'function' ? getDefaultLanguage() : 'ru';
  }

  function getGiveawayPrizeOption(prizeValue) {
    return prizeOptions.find((entry) => entry.value === String(prizeValue || '')) || null;
  }

  async function getCftoolsToken() {
    const config = typeof getConfig === 'function' ? getConfig() : {};
    const appId = config?.leaderboard?.cfCloudApplicationId || config?.cfCloudApplicationId || '';
    const appSecret =
      config?.leaderboard?.cfCloudApplicationSecret || config?.cfCloudApplicationSecret || '';
    if (!appId || !appSecret) return null;
    try {
      const resp = await fetch('https://data.cftools.cloud/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: appId, secret: appSecret }),
      });
      const data = await resp.json();
      return data.token || null;
    } catch {
      return null;
    }
  }

  async function getOnlinePlayers(serverIds) {
    const token = await getCftoolsToken();
    if (!token) return null;
    const players = [];
    for (const sid of serverIds) {
      try {
        const resp = await fetch(`https://data.cftools.cloud/v1/server/${sid}/GSM/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json();
        if (data.sessions && Array.isArray(data.sessions)) {
          for (const s of data.sessions) {
            const name = s.gamedata?.player_name || s.persona?.profile?.name || s.cftools_id || 'Unknown';
            const steam64 = s.gamedata?.steam64 || null;
            players.push({ name, steam64, serverId: sid });
          }
        }
      } catch {
        // skip failed server
      }
    }
    return players;
  }

  async function grantGiveawayRole(discordId, note) {
    const member = await fetchGuildMember(discordId);
    if (!member) {
      return { assigned: false, reason: 'member_not_found' };
    }
    const role = member.guild.roles.cache.find((entry) => entry.name === giveawayVipRoleName);
    if (!role) {
      return { assigned: false, reason: 'role_not_found' };
    }
    if (!role.editable) {
      return { assigned: false, reason: 'role_not_editable' };
    }
    if (member.roles.cache.has(role.id)) {
      return { assigned: false, reason: 'already_has_role' };
    }
    await member.roles.add(role, note);
    return { assigned: true, reason: 'assigned' };
  }

  async function grantGiveawayRewardToWinners(giveaway, reason) {
    const db = currentDb();
    if (!db || !giveaway || giveaway.ended !== true || !Array.isArray(giveaway.winners)) {
      return {
        granted: 0,
        skipped: 0,
        skippedAlreadyVip: 0,
        skippedNoLink: 0,
        alreadyVipWinners: [],
      };
    }

    const reward = getGiveawayPrizeOption(giveaway.prizeValue);
    if (!reward) {
      return {
        granted: 0,
        skipped: giveaway.winners.length,
        skippedAlreadyVip: 0,
        skippedNoLink: 0,
        alreadyVipWinners: [],
      };
    }

    if (!(giveaway.rewardedWinnerIds instanceof Set)) {
      giveaway.rewardedWinnerIds = new Set(
        Array.isArray(giveaway.rewardedWinnerIds) ? giveaway.rewardedWinnerIds : []
      );
    }

    const now = unixNow();
    const grantedEntries = [];
    let dbChanged = false;
    let skipped = 0;
    let skippedAlreadyVip = 0;
    let skippedNoLink = 0;
    const alreadyVipWinners = [];

    for (const winnerId of giveaway.winners) {
      const discordId = String(winnerId || '');
      if (!discordId || giveaway.rewardedWinnerIds.has(discordId)) {
        skipped += 1;
        continue;
      }

      const steam64 = getLinkedSteamId(discordId);
      if (!steam64) {
        skipped += 1;
        skippedNoLink += 1;
        await logAction('giveaway_reward_skip', {
          serverName: currentPrimaryServerName(),
          discordId,
          steam64: null,
          roleName: giveawayVipRoleName,
          expiresAt: null,
          note: 'steam64_not_linked',
        });
        continue;
      }

      const steamKey = String(steam64);
      if (db.whiteList.vip.includes(steamKey)) {
        skipped += 1;
        skippedAlreadyVip += 1;
        alreadyVipWinners.push(discordId);
        giveaway.rewardedWinnerIds.add(discordId);
        await logAction('giveaway_reward_skip', {
          serverName: currentPrimaryServerName(),
          discordId,
          steam64: steamKey,
          roleName: giveawayVipRoleName,
          expiresAt: null,
          note: 'already_has_vip',
        });
        continue;
      }

      ensureVip(steamKey);
      dbChanged = true;

      let expiresAt = 0;
      if (reward.durationSeconds === null) {
        if (db.vipTimed[steamKey]) {
          delete db.vipTimed[steamKey];
          dbChanged = true;
        }
      } else {
        expiresAt = now + reward.durationSeconds;
        db.vipTimed[steamKey] = {
          issuedAt: now,
          expiresAt,
          roleName: giveawayVipRoleName,
          source: 'giveaway',
          reason,
        };
        dbChanged = true;
      }

      addHistory('giveaway_reward', {
        discordId,
        steam64: steamKey,
        roleName: giveawayVipRoleName,
        expiresAt,
        note: reward.label,
      });

      giveaway.rewardedWinnerIds.add(discordId);
      grantedEntries.push({ discordId, steam64: steamKey, expiresAt });
    }

    if (dbChanged) {
      await persistAndSync();
    }

    for (const entry of grantedEntries) {
      const roleResult = await grantGiveawayRole(
        entry.discordId,
        `Giveaway reward: ${reward.label}`
      ).catch((err) => ({ assigned: false, reason: err.message || 'role_assign_failed' }));

      const language = resolveUserLanguage(entry.discordId, currentPrimaryGuild()?.preferredLocale);
      await sendDmToUserId(entry.discordId, {
        embeds: [buildVipEmbed(giveawayVipRoleName, entry.expiresAt > 0 ? entry.expiresAt : null, language)],
      });
      await logAction('giveaway_reward', {
        serverName: currentPrimaryServerName(),
        discordId: entry.discordId,
        steam64: entry.steam64,
        roleName: giveawayVipRoleName,
        expiresAt: entry.expiresAt,
        note: `${reward.label}; role=${roleResult.reason}`,
      });
    }

    return {
      granted: grantedEntries.length,
      skipped,
      skippedAlreadyVip,
      skippedNoLink,
      alreadyVipWinners,
    };
  }

  function buildGiveawayEmbed(giveaway, ended = false) {
    const endsAt = Math.floor(giveaway.endsAt / 1000);
    const desc = ended
      ? `🎉 **Розыгрыш завершён!**\n\n🏆 Победитель${giveaway.winners.length > 1 ? 'и' : ''}: ${giveaway.winners.length ? giveaway.winners.map((w) => `<@${w}>`).join(', ') : 'нет участников'}`
      : `👥 Участников: **${giveaway.participants.size}**\n⏰ Заканчивается: <t:${endsAt}:R>`;
    return new EmbedBuilder()
      .setTitle(`🎁 ${giveaway.prize}`)
      .setDescription(desc)
      .setColor(ended ? 0x5865f2 : 0x7c3aed)
      .setFooter({
        text: ended
          ? `Победителей: ${giveaway.winnersCount}`
          : `Победителей: ${giveaway.winnersCount} · ID: ${giveaway.messageId || '...'}`,
      });
  }

  function buildJoinButton(giveawayId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join:${giveawayId}`)
        .setLabel('Участвовать 🎉')
        .setStyle(ButtonStyle.Primary)
    );
  }

  function buildSteamModal(giveawayId) {
    const modal = new ModalBuilder()
      .setCustomId(`giveaway_steam_modal:${giveawayId}`)
      .setTitle('Привязка Steam для участия');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('steamid_input')
          .setLabel('Твой SteamID64 (17 цифр)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('76561198000000000')
          .setRequired(true)
      )
    );
    return modal;
  }

  function pickWinners(participants, count) {
    const arr = Array.from(participants);
    const winners = [];
    while (winners.length < count && arr.length > 0) {
      const idx = Math.floor(Math.random() * arr.length);
      winners.push(arr.splice(idx, 1)[0]);
    }
    return winners;
  }

  function escapeMarkdownLinkText(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
  }

  function formatOnlineGiveawayWinnerLine(winner) {
    if (!winner || typeof winner !== 'object') {
      return '🏆 **Победитель:** Unknown';
    }
    const winnerName = winner.name ? String(winner.name) : 'Unknown';
    const steam64 = winner.steam64 ? normalizeSteamId64(winner.steam64) : null;
    const hasValidSteam = steam64 && isValidSteamId64(steam64);
    const winnerLabel = hasValidSteam
      ? `[${escapeMarkdownLinkText(winnerName)}](${buildCfToolsProfileUrl(steam64)})`
      : `**${winnerName}**`;
    const linkedDiscordId = hasValidSteam ? findDiscordIdBySteam(steam64) : null;
    const discordLine = linkedDiscordId ? `\n🔗 Discord: <@${linkedDiscordId}>` : '';
    return `🏆 **Победитель:** ${winnerLabel}${discordLine}`;
  }

  async function grantServerGiveawayWinnerReward(winner, reward, reason) {
    const db = currentDb();
    if (!db || !winner || !reward) {
      return { granted: false, reason: 'invalid_payload' };
    }

    const steam64 = winner.steam64 ? normalizeSteamId64(winner.steam64) : null;
    if (!steam64 || !isValidSteamId64(steam64)) {
      return { granted: false, reason: 'steam64_missing' };
    }

    const steamKey = String(steam64);
    const discordId = findDiscordIdBySteam(steamKey);
    if (db.whiteList.vip.includes(steamKey)) {
      await logAction('giveaway_reward_skip', {
        serverName: currentPrimaryServerName(),
        discordId: discordId || null,
        steam64: steamKey,
        roleName: giveawayVipRoleName,
        expiresAt: null,
        note: 'already_has_vip',
      });
      return {
        granted: false,
        reason: 'already_has_vip',
        steam64: steamKey,
        discordId: discordId || null,
      };
    }

    const now = unixNow();
    let expiresAt = 0;
    let dbChanged = false;
    ensureVip(steamKey);
    dbChanged = true;

    if (reward.durationSeconds === null) {
      if (db.vipTimed[steamKey]) {
        delete db.vipTimed[steamKey];
        dbChanged = true;
      }
    } else {
      expiresAt = now + reward.durationSeconds;
      db.vipTimed[steamKey] = {
        issuedAt: now,
        expiresAt,
        roleName: giveawayVipRoleName,
        source: 'giveaway_server',
        reason,
      };
      dbChanged = true;
    }

    addHistory('giveaway_reward', {
      discordId: discordId || null,
      steam64: steamKey,
      roleName: giveawayVipRoleName,
      expiresAt,
      note: reward.label,
    });

    if (dbChanged) {
      await persistAndSync();
    }

    let roleReason = 'no_discord_link';
    if (discordId) {
      const roleResult = await grantGiveawayRole(
        discordId,
        `Giveaway reward: ${reward.label}`
      ).catch((err) => ({ assigned: false, reason: err.message || 'role_assign_failed' }));
      roleReason = roleResult.reason || (roleResult.assigned ? 'assigned' : 'unknown');

      const language = resolveUserLanguage(discordId, currentPrimaryGuild()?.preferredLocale);
      await sendDmToUserId(discordId, {
        embeds: [buildVipEmbed(giveawayVipRoleName, expiresAt > 0 ? expiresAt : null, language)],
      });
    }

    await logAction('giveaway_reward', {
      serverName: currentPrimaryServerName(),
      discordId: discordId || null,
      steam64: steamKey,
      roleName: giveawayVipRoleName,
      expiresAt,
      note: `${reward.label}; source=server; role=${roleReason}`,
    });

    return {
      granted: true,
      steam64: steamKey,
      discordId: discordId || null,
      expiresAt,
      roleReason,
    };
  }

  async function endGiveaway(giveawayId) {
    const giveaway = giveaways.get(giveawayId);
    if (!giveaway || giveaway.ended) return;
    giveaway.ended = true;
    giveaway.winners = pickWinners(giveaway.participants, giveaway.winnersCount);
    try {
      const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
      if (!channel) return;
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [buildGiveawayEmbed(giveaway, true)], components: [] });
      }
      const mention = giveaway.winners.length
        ? `🎉 Поздравляем ${giveaway.winners.map((w) => `<@${w}>`).join(', ')}! Вы выиграли **${giveaway.prize}**!`
        : '😔 Никто не участвовал в розыгрыше.';
      await channel.send({ content: mention });
      const rewardResult = await grantGiveawayRewardToWinners(giveaway, 'auto_end');
      if (rewardResult?.skippedAlreadyVip > 0 && Array.isArray(rewardResult.alreadyVipWinners)) {
        const winnerMentions = rewardResult.alreadyVipWinners.map((id) => `<@${id}>`).join(', ');
        await channel
          .send({
            content: `ℹ️ ${winnerMentions} уже имеют активный VIP, поэтому приз им не выдан.`,
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[giveaway] end error:', err);
    }
  }

  async function handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const reward = getGiveawayPrizeOption(interaction.options.getString('prize', true));
      if (!reward) {
        await interaction.reply({ content: '❌ Неверный тип приза.', ephemeral: true });
        return;
      }
      const duration = interaction.options.getInteger('duration', true);
      const winnersCount = interaction.options.getInteger('winners') || 1;
      const giveawayId = `${interaction.id}`;
      const giveaway = {
        id: giveawayId,
        prize: reward.label,
        prizeValue: reward.value,
        endsAt: Date.now() + duration * 60 * 1000,
        winnersCount,
        participants: new Set(),
        winners: [],
        rewardedWinnerIds: new Set(),
        ended: false,
        channelId: interaction.channelId,
        messageId: null,
      };
      giveaways.set(giveawayId, giveaway);

      await interaction.deferReply({ ephemeral: true });
      const msg = await interaction.channel.send({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: [buildJoinButton(giveawayId)],
      });
      giveaway.messageId = msg.id;

      setTimeout(() => endGiveaway(giveawayId), duration * 60 * 1000);
      await interaction.editReply({
        content: `✅ Розыгрыш создан! [Перейти](https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${msg.id})`,
      });
      return;
    }

    if (sub === 'server') {
      await interaction.deferReply({ ephemeral: true });
      const serverKey = interaction.options.getString('server') || 'all';
      const reward = getGiveawayPrizeOption(interaction.options.getString('prize', true));
      if (!reward) {
        await interaction.editReply({ content: '❌ Неверный тип приза.' });
        return;
      }
      const durationMinutes = interaction.options.getInteger('duration', true);
      const serverIds =
        serverKey === 'all'
          ? cftoolsServers.map((s) => s.id)
          : [cftoolsServers.find((s) => s.key === serverKey)?.id].filter(Boolean);
      if (!serverIds.length) {
        await interaction.editReply({ content: '❌ Сервер не найден.' });
        return;
      }

      const serverName =
        serverKey === 'all'
          ? 'всех серверов'
          : cftoolsServers.find((s) => s.key === serverKey)?.name || serverKey;
      const endAtUnix = Math.floor((Date.now() + durationMinutes * 60 * 1000) / 1000);

      if (!interaction.channel || !interaction.channel.isTextBased()) {
        await interaction.editReply({
          content: '❌ Этот канал не поддерживает отправку сообщений.',
        });
        return;
      }

      const launchEmbed = new EmbedBuilder()
        .setTitle('🎁 Розыгрыш среди игроков онлайн')
        .setDescription(
          `**Приз:** ${reward.label}\n**Сервер:** ${serverName}\n⏰ Заканчивается: <t:${endAtUnix}:R>\n\n` +
            'Победитель будет выбран случайно среди игроков онлайн в момент завершения.'
        )
        .setColor(0x7c3aed)
        .setFooter({ text: `Длительность: ${durationMinutes} мин.` });

      const giveawayMessage = await interaction.channel.send({ embeds: [launchEmbed] });
      await interaction.editReply({
        content: `✅ Розыгрыш запущен! [Перейти](https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${giveawayMessage.id})`,
      });

      setTimeout(() => {
        enqueueOperation(async () => {
          const channel = await client.channels.fetch(interaction.channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) {
            return;
          }
          const players = await getOnlinePlayers(serverIds);
          if (!players || players.length === 0) {
            const emptyEmbed = new EmbedBuilder()
              .setTitle('🎁 Розыгрыш среди игроков онлайн')
              .setDescription(
                `**Приз:** ${reward.label}\n**Сервер:** ${serverName}\n\n` +
                  '😔 В момент завершения на выбранном сервере не было игроков онлайн.'
              )
              .setColor(0x5865f2)
              .setFooter({ text: 'Розыгрыш завершён без победителя' });
            const msg = await channel.messages.fetch(giveawayMessage.id).catch(() => null);
            if (msg) {
              await msg.edit({ embeds: [emptyEmbed], components: [] }).catch(() => {});
            }
            return;
          }

          const winner = players[Math.floor(Math.random() * players.length)];
          const resultEmbed = new EmbedBuilder()
            .setTitle('🎁 Розыгрыш среди игроков онлайн')
            .setDescription(
              `**Приз:** ${reward.label}\n**Сервер:** ${serverName}\n**Игроков онлайн:** ${players.length}\n\n${formatOnlineGiveawayWinnerLine(winner)}`
            )
            .setColor(0x5865f2)
            .setFooter({ text: `Случайный выбор из ${players.length} игроков` });

          const msg = await channel.messages.fetch(giveawayMessage.id).catch(() => null);
          if (msg) {
            await msg.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});
          }

          const grantResult = await grantServerGiveawayWinnerReward(
            winner,
            reward,
            `server_${serverKey}`
          );
          if (grantResult.reason === 'already_has_vip') {
            const target = grantResult.discordId
              ? `<@${grantResult.discordId}>`
              : `\`${grantResult.steam64}\``;
            await channel
              .send({
                content: `ℹ️ Победитель ${target} уже имеет активный VIP, поэтому приз не выдан.`,
              })
              .catch(() => {});
            return;
          }
          if (grantResult.granted && grantResult.discordId) {
            await channel
              .send({
                content:
                  `🎉 Победитель <@${grantResult.discordId}> получил **${reward.label}** ` +
                  `и роль **${giveawayVipRoleName}**.`,
              })
              .catch(() => {});
            return;
          }
          if (grantResult.granted) {
            await channel
              .send({
                content:
                  `🎉 Победитель получил **${reward.label}** по SteamID64.\n` +
                  'Discord-аккаунт не привязан, поэтому роль не выдана.',
              })
              .catch(() => {});
            return;
          }
          await channel
            .send({
              content: '⚠️ Победитель выбран, но награда не выдана автоматически.',
            })
            .catch(() => {});
        });
      }, durationMinutes * 60 * 1000);
      return;
    }

    if (sub === 'end') {
      const messageId = interaction.options.getString('message_id', true);
      const giveaway = Array.from(giveaways.values()).find((g) => g.messageId === messageId);
      if (!giveaway) {
        await interaction.reply({ content: '❌ Розыгрыш не найден.', ephemeral: true });
        return;
      }
      if (giveaway.ended) {
        await interaction.reply({ content: '❌ Розыгрыш уже завершён.', ephemeral: true });
        return;
      }
      await endGiveaway(giveaway.id);
      await interaction.reply({ content: '✅ Розыгрыш завершён.', ephemeral: true });
      return;
    }

    if (sub === 'reroll') {
      const messageId = interaction.options.getString('message_id', true);
      const giveaway = Array.from(giveaways.values()).find((g) => g.messageId === messageId);
      if (!giveaway || !giveaway.ended) {
        await interaction.reply({ content: '❌ Завершённый розыгрыш не найден.', ephemeral: true });
        return;
      }
      giveaway.winners = pickWinners(giveaway.participants, giveaway.winnersCount);
      const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [buildGiveawayEmbed(giveaway, true)], components: [] });
        const mention = giveaway.winners.length
          ? `🔁 Перевыбор! Поздравляем ${giveaway.winners.map((w) => `<@${w}>`).join(', ')}! Вы выиграли **${giveaway.prize}**!`
          : '😔 Нет участников для перевыбора.';
        await channel.send({ content: mention });
        const rewardResult = await grantGiveawayRewardToWinners(giveaway, 'reroll');
        if (rewardResult?.skippedAlreadyVip > 0 && Array.isArray(rewardResult.alreadyVipWinners)) {
          const winnerMentions = rewardResult.alreadyVipWinners.map((id) => `<@${id}>`).join(', ');
          await channel
            .send({
              content: `ℹ️ ${winnerMentions} уже имеют активный VIP, поэтому приз им не выдан.`,
            })
            .catch(() => {});
        }
      }
      await interaction.reply({ content: '✅ Победитель перевыбран.', ephemeral: true });
    }
  }

  async function handleJoinButton(interaction) {
    if (!interaction.customId.startsWith('giveaway_join:')) {
      return false;
    }

    const giveawayId = interaction.customId.split(':')[1];
    const giveaway = giveaways.get(giveawayId);
    if (!giveaway || giveaway.ended) {
      await interaction.reply({ content: '❌ Розыгрыш уже завершён.', ephemeral: true });
      return true;
    }
    const discordId = interaction.user.id;
    const steam64 = getLinkedSteamId(discordId);
    if (!steam64) {
      await interaction.showModal(buildSteamModal(giveawayId));
      return true;
    }
    if (giveaway.participants.has(discordId)) {
      await interaction.reply({ content: '✅ Ты уже участвуешь в розыгрыше!', ephemeral: true });
      return true;
    }

    giveaway.participants.add(discordId);
    const msg = await interaction.channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: [buildJoinButton(giveawayId)],
      });
    }
    await interaction.reply({ content: '🎉 Ты участвуешь в розыгрыше!', ephemeral: true });
    return true;
  }

  async function handleSteamModal(interaction) {
    if (!interaction.customId.startsWith('giveaway_steam_modal:')) {
      return false;
    }

    const db = currentDb();
    if (!db) {
      await interaction.reply({
        content: getMessagesForLanguage(currentDefaultLanguage()).statusLoading,
        ephemeral: true,
      });
      return true;
    }

    const giveawayId = interaction.customId.split(':')[1];
    const giveaway = giveaways.get(giveawayId);
    if (!giveaway || giveaway.ended) {
      await interaction.reply({ content: '❌ Розыгрыш уже завершён.', ephemeral: true });
      return true;
    }

    const input = normalizeSteamId64(interaction.fields.getTextInputValue('steamid_input'));
    if (!isValidSteamId64(input)) {
      await interaction.reply({
        content: getMessagesForLanguage(currentDefaultLanguage()).invalidSteamId,
        ephemeral: true,
      });
      return true;
    }

    const discordId = interaction.user.id;
    const existingOwner = findDiscordIdBySteam(input);
    if (existingOwner && existingOwner !== discordId) {
      await interaction.reply({
        content: getMessagesForLanguage(currentDefaultLanguage()).steamidOwned,
        ephemeral: true,
      });
      return true;
    }

    db.links[discordId] = input;
    await savePrimaryDb();
    giveaway.participants.add(discordId);

    const msg = await interaction.channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [buildGiveawayEmbed(giveaway)],
        components: [buildJoinButton(giveawayId)],
      });
    }

    await interaction.reply({
      content: '🎉 Steam привязан и ты участвуешь в розыгрыше!',
      ephemeral: true,
    });
    return true;
  }

  return {
    command,
    handleCommand,
    handleJoinButton,
    handleSteamModal,
  };
}

module.exports = {
  createGiveawayModule,
  DEFAULT_CFTOOLS_SERVERS,
};
