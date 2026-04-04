const { EmbedBuilder } = require('discord.js');

function createVipModule(options) {
  const {
    VIP_ROLES,
    VIP_ROLE_NAMES,
    GIVEAWAY_VIP_ROLE_NAME,
    SPECIAL_VIP_ROLE_RULES = [],
    MEDIA_ROLE_NAME = 'media',
    ROLE_REMOVE_REASON = 'VIP expired',
    NOTIFY_THRESHOLDS = [],
    servers = [],
    getDb,
    getPrimaryGuild,
    getPrimaryServerName,
    getMessagesForLanguage,
    formatMessage,
    formatTariffDisplay,
    resolveUserLanguage,
    getLinkedSteamId,
    findDiscordIdBySteam,
    sendDm,
    sendDmToUserId,
    logAction,
    ensureVip,
    ensureMedia,
    removeVip,
    removeMedia,
    persistAndSync,
    savePrimaryDb,
    addHistory,
    unixNow,
    markRoleSkip,
  } = options;

  const vipRoles = VIP_ROLES instanceof Map ? VIP_ROLES : new Map();
  const vipRoleNames = VIP_ROLE_NAMES instanceof Set ? VIP_ROLE_NAMES : new Set(VIP_ROLE_NAMES || []);
  const specialVipRoleRules = Array.isArray(SPECIAL_VIP_ROLE_RULES)
    ? SPECIAL_VIP_ROLE_RULES
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const roleName = String(entry.roleName || '').trim();
          if (!roleName) {
            return null;
          }
          return {
            roleName,
            strippedMessageKey: String(entry.strippedMessageKey || '').trim() || null,
            grantedMessageKey: String(entry.grantedMessageKey || '').trim() || null,
          };
        })
        .filter(Boolean)
    : [];
  const specialVipRoleRulesByName = new Map(
    specialVipRoleRules.map((entry) => [String(entry.roleName || '').trim().toLowerCase(), entry])
  );
  const notifyThresholds = Array.isArray(NOTIFY_THRESHOLDS)
    ? NOTIFY_THRESHOLDS.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];

  function currentDb() {
    return typeof getDb === 'function' ? getDb() : null;
  }

  function currentPrimaryGuild() {
    return typeof getPrimaryGuild === 'function' ? getPrimaryGuild() : null;
  }

  function currentPrimaryServerName() {
    return typeof getPrimaryServerName === 'function' ? getPrimaryServerName() : 'unknown';
  }

  function normalizeRoleName(value) {
    return String(value || '').trim().toLowerCase();
  }

  function resolveSpecialVipRoleRule(roleName) {
    if (!roleName) {
      return null;
    }
    return specialVipRoleRulesByName.get(normalizeRoleName(roleName)) || null;
  }

  function findSpecialVipRoleOnMember(member) {
    if (!member || !member.roles || !member.roles.cache || !specialVipRoleRules.length) {
      return null;
    }
    for (const role of member.roles.cache.values()) {
      const rule = resolveSpecialVipRoleRule(role.name);
      if (rule) {
        return rule;
      }
    }
    return null;
  }

  function buildGenericInfoEmbed(messageKey, language) {
    const messages = getMessagesForLanguage(language);
    const description = messages?.[messageKey];
    if (!description) {
      return null;
    }
    return new EmbedBuilder().setDescription(description).setColor(0xffffff);
  }

  function buildVipEmbed(roleName, expiresAt, language) {
    const messages = getMessagesForLanguage(language);
    const description =
      expiresAt === null
        ? formatMessage(messages.dmVipActiveForever, {
            tariff: formatTariffDisplay(roleName, language),
          })
        : formatMessage(messages.dmVipActiveTimed, {
            tariff: formatTariffDisplay(roleName, language),
            expiresAt,
          });
    return new EmbedBuilder().setDescription(description).setColor(0xffffff);
  }

  function buildExpiryWarningEmbed(roleName, expiresAt, language, thresholdSeconds) {
    const messages = getMessagesForLanguage(language);
    const isEarly = thresholdSeconds > 86400;
    return new EmbedBuilder()
      .setDescription(
        formatMessage(isEarly ? messages.dmExpiryWarningEarly : messages.dmExpiryWarning, {
          tariff: formatTariffDisplay(roleName, language),
          expiresAt,
        })
      )
      .setColor(isEarly ? 0x378add : 0xffa940);
  }

  function buildVipExpiredEmbed(roleName, language) {
    const messages = getMessagesForLanguage(language);
    return new EmbedBuilder()
      .setDescription(
        formatMessage(messages.dmVipExpired, {
          tariff: formatTariffDisplay(roleName, language),
        })
      )
      .setColor(0xff4d4f);
  }

  function resolveVipRemovalReason(language, reasonCode, context = {}) {
    const messages = getMessagesForLanguage(language);
    switch (reasonCode) {
      case 'admin':
        return formatMessage(messages.vipRemoveReasonAdmin, {
          admin: context.admin || 'unknown',
        });
      case 'api':
        return messages.vipRemoveReasonApi;
      case 'left_guild':
        return messages.vipRemoveReasonLeftGuild;
      case 'startup_check':
        return messages.vipRemoveReasonStartupCheck;
      case 'role_removed':
      default:
        return messages.vipRemoveReasonRoleRemoved;
    }
  }

  function buildVipRemovedEmbed(language, reasonCode, context = {}) {
    const messages = getMessagesForLanguage(language);
    const reason = resolveVipRemovalReason(language, reasonCode, context);
    return new EmbedBuilder()
      .setDescription(
        formatMessage(messages.dmVipRemoved, {
          reason,
        })
      )
      .setColor(0xff4d4f);
  }

  async function notifyVipRemoved(discordId, reasonCode, context = {}) {
    if (!discordId) {
      return;
    }
    const language = resolveUserLanguage(discordId, currentPrimaryGuild()?.preferredLocale);
    await sendDmToUserId(discordId, {
      embeds: [buildVipRemovedEmbed(language, reasonCode, context)],
    });
  }

  function buildRoleActivatedEmbed(roleName, language) {
    const messages = getMessagesForLanguage(language);
    return new EmbedBuilder()
      .setDescription(formatMessage(messages.dmRoleActivated, { roleName }))
      .setColor(0xffffff);
  }

  function buildMissingLinkEmbed(roleName, language) {
    const messages = getMessagesForLanguage(language);
    return new EmbedBuilder()
      .setDescription(formatMessage(messages.dmMissingLink, { roleName }))
      .setColor(0xff4d4f);
  }

  function pickBestVipRole(roleNames) {
    let bestRole = null;
    let bestScore = -1;
    for (const roleName of roleNames) {
      const duration = vipRoles.get(roleName);
      const score = duration === null ? Number.MAX_SAFE_INTEGER : Number(duration) || 0;
      if (score > bestScore) {
        bestScore = score;
        bestRole = roleName;
      }
    }
    return bestRole;
  }

  async function handleVipRoleAdded(member, roleName) {
    const db = currentDb();
    if (!db) {
      return;
    }

    const discordId = member.id;
    const language = resolveUserLanguage(discordId, member.guild?.preferredLocale);
    const steam64 = getLinkedSteamId(discordId);
    if (!steam64) {
      await logAction('missing_link', {
        discordId,
        steam64: null,
        roleName,
        expiresAt: null,
        note: 'role_add_no_link',
      });
      await sendDm(member, { embeds: [buildMissingLinkEmbed(roleName, language)] });
      return;
    }

    const steamKey = String(steam64);
    const duration = vipRoles.get(roleName);
    const now = unixNow();
    const expiresAt = duration === null ? null : now + duration;

    const hadVip = db.whiteList.vip.includes(steamKey);
    const existing = db.vipTimed[steamKey];
    const existingExpiresAt =
      existing && Number(existing.expiresAt) > 0 ? Number(existing.expiresAt) : 0;
    const hasActiveTimed = existingExpiresAt > now;
    const isForever = duration === null;
    const hasVip = hadVip;
    const sameRole = !existing?.roleName || existing.roleName === roleName;

    ensureVip(steamKey);
    const vipAdded = !hadVip && db.whiteList.vip.includes(steamKey);

    if ((isForever && hasVip && !existingExpiresAt) || (!isForever && hasActiveTimed && sameRole)) {
      if (vipAdded) {
        await persistAndSync();
      }
      await logAction('role_add_skip', {
        discordId,
        steam64: steamKey,
        roleName,
        expiresAt: existingExpiresAt || 0,
        note: 'already_active',
      });
      return;
    }

    if (duration === null) {
      delete db.vipTimed[steamKey];
    } else {
      db.vipTimed[steamKey] = {
        issuedAt: now,
        expiresAt,
        roleName,
        source: 'role_add',
        reason: 'auto',
      };
    }

    addHistory('role_add', {
      discordId,
      steam64: steamKey,
      roleName,
      expiresAt,
      note: 'auto',
    });

    await persistAndSync();

    const embed = buildVipEmbed(roleName, duration === null ? null : expiresAt, language);
    await sendDm(member, { embeds: [embed] });

    await logAction('role_add', {
      discordId,
      steam64: steamKey,
      roleName,
      expiresAt: expiresAt === null ? 0 : expiresAt,
      note: 'auto',
    });
  }

  async function handleSpecialVipRoleAdded(member, roleName) {
    const db = currentDb();
    if (!db || !member) {
      return;
    }

    const specialRoleRule = resolveSpecialVipRoleRule(roleName) || findSpecialVipRoleOnMember(member);
    if (!specialRoleRule) {
      return;
    }

    const discordId = member.id;
    const language = resolveUserLanguage(discordId, member.guild?.preferredLocale);
    const steam64 = getLinkedSteamId(discordId);
    const steamKey = steam64 ? String(steam64) : null;

    let inGameVipGranted = false;
    if (steamKey) {
      const hadVip = db.whiteList.vip.includes(steamKey);
      if (!hadVip) {
        ensureVip(steamKey);
        inGameVipGranted = db.whiteList.vip.includes(steamKey);
        if (inGameVipGranted) {
          addHistory('donator_role_grant', {
            discordId,
            steam64: steamKey,
            roleName: specialRoleRule.roleName,
            expiresAt: 0,
            note: 'auto',
          });
          await persistAndSync();
          await logAction('donator_role_grant', {
            discordId,
            steam64: steamKey,
            roleName: specialRoleRule.roleName,
            expiresAt: 0,
            note: 'auto',
          });
        }
      }
    } else {
      await logAction('donator_missing_link', {
        discordId,
        steam64: null,
        roleName: specialRoleRule.roleName,
        expiresAt: null,
        note: 'role_add_no_link',
      });
    }

    const hasDiscordVipRole = member.roles.cache.some(
      (role) => vipRoleNames.has(role.name) || role.name === GIVEAWAY_VIP_ROLE_NAME
    );
    let discordVipRoleStripped = false;
    if (hasDiscordVipRole) {
      await removeDiscordVipRoles(discordId, `VIP role stripped for ${specialRoleRule.roleName}`);
      discordVipRoleStripped = true;
      await logAction('donator_role_strip', {
        discordId,
        steam64: steamKey,
        roleName: specialRoleRule.roleName,
        expiresAt: 0,
        note: 'auto',
      });
    }

    if (inGameVipGranted && specialRoleRule.grantedMessageKey) {
      const grantedEmbed = buildGenericInfoEmbed(specialRoleRule.grantedMessageKey, language);
      if (grantedEmbed) {
        await sendDm(member, { embeds: [grantedEmbed] }).catch(() => {});
      }
    }

    if (discordVipRoleStripped && specialRoleRule.strippedMessageKey) {
      const strippedEmbed = buildGenericInfoEmbed(specialRoleRule.strippedMessageKey, language);
      if (strippedEmbed) {
        await sendDm(member, { embeds: [strippedEmbed] }).catch(() => {});
      }
    }
  }

  async function handleVipRoleRemoved(member, roleName) {
    const db = currentDb();
    if (!db) {
      return;
    }

    const discordId = member.id;
    const specialRoleRule = findSpecialVipRoleOnMember(member);
    if (specialRoleRule) {
      await handleSpecialVipRoleAdded(member, specialRoleRule.roleName);
      return;
    }

    const steam64 = getLinkedSteamId(discordId);
    if (!steam64) {
      await logAction('missing_link', {
        discordId,
        steam64: null,
        roleName,
        expiresAt: null,
        note: 'role_remove_no_link',
      });
      return;
    }

    const steamKey = String(steam64);
    removeVip(steamKey);
    delete db.vipTimed[steamKey];

    addHistory('manual_remove', {
      discordId,
      steam64: steamKey,
      roleName,
      expiresAt: null,
      note: 'manual',
    });

    await persistAndSync();
    await notifyVipRemoved(discordId, 'role_removed');

    await logAction('manual_remove', {
      discordId,
      steam64: steamKey,
      roleName,
      expiresAt: 0,
      note: 'manual',
    });
  }

  async function handleMediaRoleAdded(member) {
    const db = currentDb();
    if (!db) {
      return;
    }

    const discordId = member.id;
    const language = resolveUserLanguage(discordId, member.guild?.preferredLocale);
    const steam64 = getLinkedSteamId(discordId);
    if (!steam64) {
      await logAction('media_missing_link', {
        discordId,
        steam64: null,
        roleName: MEDIA_ROLE_NAME,
        expiresAt: null,
        note: 'role_add_no_link',
      });
      await sendDm(member, { embeds: [buildMissingLinkEmbed(MEDIA_ROLE_NAME, language)] });
      return;
    }

    const steamKey = String(steam64);
    ensureMedia(steamKey);

    addHistory('media_add', {
      discordId,
      steam64: steamKey,
      roleName: MEDIA_ROLE_NAME,
      expiresAt: 0,
      note: 'auto',
    });

    await persistAndSync();

    await sendDm(member, { embeds: [buildRoleActivatedEmbed(MEDIA_ROLE_NAME, language)] });

    await logAction('media_add', {
      discordId,
      steam64: steamKey,
      roleName: MEDIA_ROLE_NAME,
      expiresAt: 0,
      note: 'auto',
    });
  }

  async function handleMediaRoleRemoved(member) {
    const db = currentDb();
    if (!db) {
      return;
    }

    const discordId = member.id;
    const steam64 = getLinkedSteamId(discordId);
    if (!steam64) {
      await logAction('media_missing_link', {
        discordId,
        steam64: null,
        roleName: MEDIA_ROLE_NAME,
        expiresAt: null,
        note: 'role_remove_no_link',
      });
      return;
    }

    const steamKey = String(steam64);
    removeMedia(steamKey);

    addHistory('media_remove', {
      discordId,
      steam64: steamKey,
      roleName: MEDIA_ROLE_NAME,
      expiresAt: 0,
      note: 'manual',
    });

    await persistAndSync();

    await logAction('media_remove', {
      discordId,
      steam64: steamKey,
      roleName: MEDIA_ROLE_NAME,
      expiresAt: 0,
      note: 'manual',
    });
  }

  async function reconcileLinkedMemberAccess(member, previousSteam64 = null) {
    const db = currentDb();
    if (!db || !member) {
      return;
    }

    const discordId = member.id;
    const linkedSteam64 = getLinkedSteamId(discordId);
    if (!linkedSteam64) {
      return;
    }

    const currentSteamKey = String(linkedSteam64);
    const previousSteamKey =
      previousSteam64 && String(previousSteam64).trim() ? String(previousSteam64).trim() : null;
    const isSteamMoved = Boolean(previousSteamKey && previousSteamKey !== currentSteamKey);
    const previousHadVip = isSteamMoved
      ? Boolean(db.whiteList?.vip?.includes(previousSteamKey))
      : false;
    const previousHadMedia = isSteamMoved
      ? Boolean(Array.isArray(db.whiteList?.media) && db.whiteList.media.includes(previousSteamKey))
      : false;
    const previousVipRecord = isSteamMoved && db.vipTimed?.[previousSteamKey]
      ? { ...db.vipTimed[previousSteamKey] }
      : null;
    let changed = false;

    if (isSteamMoved) {
      if (db.whiteList?.vip?.includes(previousSteamKey)) {
        removeVip(previousSteamKey);
        changed = true;
      }
      if (db.vipTimed?.[previousSteamKey]) {
        delete db.vipTimed[previousSteamKey];
        changed = true;
      }
      if (Array.isArray(db.whiteList?.media) && db.whiteList.media.includes(previousSteamKey)) {
        removeMedia(previousSteamKey);
        changed = true;
      }
    }

    if (changed) {
      await persistAndSync();
      await logAction('link_reconcile', {
        serverName: currentPrimaryServerName(),
        discordId,
        steam64: currentSteamKey,
        roleName: null,
        expiresAt: null,
        note: previousSteamKey
          ? `old=${previousSteamKey};new=${currentSteamKey}`
          : `new=${currentSteamKey}`,
      });
    }

    const memberRoleNames = [...member.roles.cache.values()].map((role) => role.name);
    const activeVipRole = pickBestVipRole(
      memberRoleNames.filter((roleName) => vipRoleNames.has(roleName))
    );
    const activeSpecialVipRole = findSpecialVipRoleOnMember(member);
    const hasMediaRole = memberRoleNames.some(
      (roleName) => String(roleName || '').trim().toLowerCase() === String(MEDIA_ROLE_NAME).toLowerCase()
    );

    if (activeSpecialVipRole) {
      await handleSpecialVipRoleAdded(member, activeSpecialVipRole.roleName);
    } else if (activeVipRole) {
      if (isSteamMoved && (previousHadVip || previousVipRecord)) {
        ensureVip(currentSteamKey);
        if (previousVipRecord) {
          db.vipTimed[currentSteamKey] = {
            ...previousVipRecord,
            roleName: activeVipRole,
            source: 'link_reconcile',
            reason: 'link_move',
          };
        } else {
          delete db.vipTimed[currentSteamKey];
        }
        await persistAndSync();
        await logAction('link_reconcile', {
          serverName: currentPrimaryServerName(),
          discordId,
          steam64: currentSteamKey,
          roleName: activeVipRole,
          expiresAt: Number(db.vipTimed?.[currentSteamKey]?.expiresAt) || 0,
          note: `vip_transferred_from=${previousSteamKey}`,
        });
      } else {
        await handleVipRoleAdded(member, activeVipRole);
      }
    } else if (db.whiteList?.vip?.includes(currentSteamKey) || db.vipTimed?.[currentSteamKey]) {
      removeVip(currentSteamKey);
      delete db.vipTimed[currentSteamKey];
      await persistAndSync();
      await logAction('link_reconcile', {
        serverName: currentPrimaryServerName(),
        discordId,
        steam64: currentSteamKey,
        roleName: null,
        expiresAt: 0,
        note: 'vip_cleared_no_role',
      });
    }

    if (hasMediaRole) {
      if (isSteamMoved && previousHadMedia) {
        ensureMedia(currentSteamKey);
        await persistAndSync();
        await logAction('link_reconcile', {
          serverName: currentPrimaryServerName(),
          discordId,
          steam64: currentSteamKey,
          roleName: MEDIA_ROLE_NAME,
          expiresAt: 0,
          note: `media_transferred_from=${previousSteamKey}`,
        });
      } else {
        await handleMediaRoleAdded(member);
      }
    } else if (Array.isArray(db.whiteList?.media) && db.whiteList.media.includes(currentSteamKey)) {
      removeMedia(currentSteamKey);
      await persistAndSync();
      await logAction('link_reconcile', {
        serverName: currentPrimaryServerName(),
        discordId,
        steam64: currentSteamKey,
        roleName: MEDIA_ROLE_NAME,
        expiresAt: 0,
        note: 'media_cleared_no_role',
      });
    }
  }

  async function removeDiscordVipRoles(discordId, note) {
    const db = currentDb();
    const primaryGuild = currentPrimaryGuild();
    if (!db || !primaryGuild) {
      return;
    }

    let member;
    try {
      member = await primaryGuild.members.fetch(discordId);
    } catch (err) {
      await logAction('member_fetch_fail', {
        discordId,
        steam64: db.links[discordId] || null,
        roleName: null,
        expiresAt: null,
        note: err.message || 'fetch_failed',
      });
      return;
    }

    const rolesToRemove = member.roles.cache.filter(
      (role) => vipRoleNames.has(role.name) || role.name === GIVEAWAY_VIP_ROLE_NAME
    );
    if (!rolesToRemove.size) {
      return;
    }
    if (typeof markRoleSkip === 'function') {
      for (const role of rolesToRemove.values()) {
        markRoleSkip(discordId, role.name);
      }
    }

    try {
      await member.roles.remove(rolesToRemove.map((role) => role.id), note);
    } catch (err) {
      await logAction('role_remove_fail', {
        discordId,
        steam64: db.links[discordId] || null,
        roleName: null,
        expiresAt: null,
        note: err.message || 'role_remove_failed',
      });
    }
  }

  async function expireVip(steam64, record) {
    const db = currentDb();
    if (!db) {
      return;
    }

    removeVip(steam64);
    delete db.vipTimed[steam64];

    const discordId = findDiscordIdBySteam(steam64);

    addHistory('expire_remove', {
      discordId,
      steam64,
      roleName: record.roleName || null,
      expiresAt: record.expiresAt || null,
      note: 'expire',
    });

    await persistAndSync();

    await logAction('expire_remove', {
      discordId,
      steam64,
      roleName: record.roleName || null,
      expiresAt: record.expiresAt || null,
      note: 'expire',
    });

    if (discordId) {
      const language = resolveUserLanguage(discordId, currentPrimaryGuild()?.preferredLocale);
      await sendDmToUserId(discordId, {
        embeds: [buildVipExpiredEmbed(record.roleName || 'VIP', language)],
      });
      await removeDiscordVipRoles(discordId, ROLE_REMOVE_REASON);
    }
  }

  async function notifyVipExpiring(steam64, record, thresholdSeconds) {
    const discordId = findDiscordIdBySteam(steam64);
    if (!discordId) {
      await logAction('expire_warn_missing_link', {
        serverName: currentPrimaryServerName(),
        discordId: null,
        steam64,
        roleName: record.roleName || null,
        expiresAt: record.expiresAt || null,
        note: `threshold=${thresholdSeconds}`,
      });
      return;
    }

    const language = resolveUserLanguage(discordId, currentPrimaryGuild()?.preferredLocale);
    await sendDmToUserId(discordId, {
      embeds: [
        buildExpiryWarningEmbed(
          record.roleName || 'VIP',
          record.expiresAt,
          language,
          thresholdSeconds
        ),
      ],
    });

    await logAction('expire_warn', {
      serverName: currentPrimaryServerName(),
      discordId,
      steam64,
      roleName: record.roleName || null,
      expiresAt: record.expiresAt || null,
      note: `threshold=${thresholdSeconds}`,
    });
  }

  async function runExpirationCheck() {
    const db = currentDb();
    if (!db) {
      return;
    }

    const now = unixNow();
    const expirations = [];
    let notifyDirty = false;

    for (const [steam64, record] of Object.entries(db.vipTimed || {})) {
      const expiresAt = Number(record.expiresAt) || 0;
      if (expiresAt > 0 && now >= expiresAt) {
        expirations.push([steam64, record]);
        continue;
      }
      if (!expiresAt || !notifyThresholds.length) {
        continue;
      }

      const remaining = expiresAt - now;
      if (remaining <= 0) {
        continue;
      }

      const notified = Array.isArray(record.notified) ? record.notified.map(Number) : [];
      for (const threshold of notifyThresholds) {
        if (remaining <= threshold && !notified.includes(threshold)) {
          await notifyVipExpiring(steam64, record, threshold);
          notified.push(threshold);
          record.notified = notified;
          notifyDirty = true;
        }
      }
    }

    for (const [steam64, record] of expirations) {
      await expireVip(steam64, record);
    }

    if (notifyDirty) {
      await savePrimaryDb();
    }
  }

  async function handleProfileCommand(interaction, interactionLanguage) {
    const db = currentDb();
    if (!db) {
      return;
    }

    const messages = getMessagesForLanguage(interactionLanguage);
    const discordId = interaction.user.id;
    const steam64 = getLinkedSteamId(discordId);
    if (!steam64) {
      await interaction.reply({
        content: messages.profileNoLink,
        ephemeral: true,
      });
      return;
    }

    const steamKey = String(steam64);
    const timed = db.vipTimed[steamKey];
    const isActive = db.whiteList.vip.includes(steamKey);
    let vipStatus = messages.profileInactive;
    let tariff = '-';

    if (isActive) {
      if (timed && Number(timed.expiresAt) > 0) {
        vipStatus = formatMessage(messages.profileActiveUntil, {
          expiresAt: Number(timed.expiresAt),
        });
        tariff = formatTariffDisplay(timed.roleName || 'VIP', interactionLanguage);
      } else {
        vipStatus = messages.profileActiveForever;
        tariff = formatTariffDisplay(timed?.roleName || 'VIP', interactionLanguage);
      }
    }

    const relevantActions = new Set([
      'role_add',
      'api_givevip',
      'command_givevip',
      'api_setvip',
      'command_setvip',
      'manual_set',
    ]);
    const userHistory = Array.isArray(db.history)
      ? db.history
          .filter((entry) => entry.discordId === discordId && relevantActions.has(entry.action))
          .slice(-5)
          .reverse()
      : [];
    const historyLines =
      userHistory.length > 0
        ? userHistory
            .map((entry) =>
              formatMessage(messages.profileHistoryLine, {
                tariff: formatTariffDisplay(entry.roleName || 'VIP', interactionLanguage),
                issuedAt: Number(entry.ts) || unixNow(),
              })
            )
            .join('\n')
        : messages.profileHistoryEmpty;

    const embed = new EmbedBuilder()
      .setTitle(messages.profileTitle)
      .setColor(0xffffff)
      .addFields(
        { name: messages.profileFieldSteam, value: steamKey, inline: false },
        { name: messages.profileFieldVip, value: vipStatus, inline: true },
        { name: messages.profileFieldTariff, value: tariff, inline: true },
        { name: messages.profileFieldHistory, value: historyLines, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async function handleServerInfoCommand(interaction, interactionLanguage) {
    const db = currentDb();
    if (!db) {
      return;
    }

    const messages = getMessagesForLanguage(interactionLanguage);
    const now = unixNow();
    const total = new Set(db.whiteList.vip.map(String)).size;
    const links = Object.keys(db.links).length;
    const timedEntries = Object.entries(db.vipTimed).filter(
      ([steam64, record]) =>
        db.whiteList.vip.includes(String(steam64)) && Number(record.expiresAt) > 0
    );
    const expiring24h = timedEntries.filter(([, record]) => {
      const expiresAt = Number(record.expiresAt) || 0;
      return expiresAt > now && expiresAt - now <= 86400;
    }).length;
    const serverLines =
      servers.map((server) => `- **${server.name}** (\`${server.type}\`)`).join('\n') || '-';

    const embed = new EmbedBuilder()
      .setTitle(messages.serverinfoTitle)
      .setColor(0x5865f2)
      .addFields(
        { name: messages.serverinfoFieldVip, value: String(total), inline: true },
        { name: messages.serverinfoFieldLinks, value: String(links), inline: true },
        { name: messages.serverinfoFieldExpiring, value: String(expiring24h), inline: true },
        { name: messages.serverinfoFieldServers, value: serverLines, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  return {
    buildVipEmbed,
    resolveVipRemovalReason,
    notifyVipRemoved,
    removeDiscordVipRoles,
    reconcileLinkedMemberAccess,
    runExpirationCheck,
    handleProfileCommand,
    handleServerInfoCommand,
    handleVipRoleAdded,
    handleVipRoleRemoved,
    handleSpecialVipRoleAdded,
    handleMediaRoleAdded,
    handleMediaRoleRemoved,
  };
}

module.exports = {
  createVipModule,
};
