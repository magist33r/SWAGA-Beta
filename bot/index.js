if (typeof globalThis.ReadableStream === 'undefined') {
  try {
    const { ReadableStream } = require('stream/web');
    if (ReadableStream) {
      globalThis.ReadableStream = ReadableStream;
    }
  } catch (err) {
    // Ignore if the runtime doesn't provide web streams.
  }
}
const fs = require('fs/promises');
const path = require('path');
const { Readable, Writable } = require('stream');
const ftp = require('basic-ftp');
const express = require('express');
const {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const { startHistoryFeed } = require('./historyFeed');

function stripBom(value) {
  if (!value) {
    return value;
  }
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function getRuntimeDir() {
  return process.pkg ? path.dirname(process.execPath) : process.cwd();
}

const CONFIG_PATH = path.resolve(process.cwd(), 'config.json');
const BOT_DB_PATH = path.resolve(getRuntimeDir(), 'bot-db.json');

const VIP_ROLES = new Map([
  ['VIP Test', 3600],
  ['VIP 14 Days', 1209600],
  ['VIP Monthly', 2592000],
  ['VIP', null],
]);
const VIP_ROLE_NAMES = new Set(VIP_ROLES.keys());
const NEWERA_ROLE_NAME = 'newera';

const MESSAGES_RU = {
  dmVipActiveForever: '✅ VIP активирован — {tariff} ⭐',
  dmVipActiveTimed: '✅ VIP активирован — {tariff}\n⏳ Действует до: <t:{expiresAt}:F>',
  dmRoleActivated: '✅ Роль «{roleName}» активирована.',
  dmMissingLink:
    '⚠️ Роль «{roleName}» обнаружена, но SteamID64 не указан.\nПривяжите SteamID через /steamid или /link.',
  dmExpiryWarning: '⏰ VIP скоро истечет — {tariff}\n📅 Окончание: <t:{expiresAt}:F>',
  dmVipExpired:
    '❌ **VIP закончился**\n⚠️ Отключены: **VIP привилегии**.\n⏳ Продли в течение **24 часов** и получи скидку:\n💳 399₽/14д • ~~799₽~~ **699₽/мес** • ~~1799₽~~ **1599₽/навсегда**\n✅ Продлить: **[создать тикет](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  statusLoading: '⏳ Данные еще загружаются… Попробуйте чуть позже.',
  statusNoLink: '❗ SteamID64 для вашего аккаунта не найден.\nПривяжите SteamID через /steamid или /link.',
  statusInactive: '❌ VIP не активен.',
  statusActiveUntil: '✅ VIP активен до <t:{expiresAt}:F>.',
  statusActiveForever: '✅ VIP активен навсегда.',
  genericError: '⚠️ Произошла ошибка. Попробуйте позже.',
  onlyGuild: '🚫 Эта команда доступна только на сервере.',
  invalidSteamId: 'SteamID64 должен состоять из 17 цифр и начинаться с 7656119.',
  noPermLink: '🚫 Недостаточно прав для изменения привязок.',
  noPermWhois: '🚫 Недостаточно прав для просмотра информации.',
  noPermViplist: '🚫 Недостаточно прав для просмотра списка.',
  noPermRemoveVip: '🚫 Недостаточно прав для снятия VIP.',
  noPermGiveVip: '🚫 Недостаточно прав для выдачи VIP.',
  steamidAlreadyLinked: 'ℹ️ Для вашего аккаунта SteamID64 уже сохранен.\nДля изменения создайте тикет.',
  steamidOwned: '⚠️ Этот SteamID64 уже привязан к другому аккаунту.\nСоздайте тикет.',
  steamidSaved: '✅ SteamID64 сохранен.',
  linkUpdated: '✅ Привязка обновлена.',
  linkSaved: '✅ Привязка сохранена.',
  linkNotFound: '❌ Привязка не найдена.',
  linkRemoved: '✅ Привязка удалена.',
  whoisNoLink: '❌ Привязка SteamID64 не найдена.',
  whoisInactive: 'Пользователь: <@{discordId}>\nSteamID64: {steam64}\nVIP: ❌ не активен.',
  whoisActiveTimed:
    'Пользователь: <@{discordId}>\nSteamID64: {steam64}\nТариф: {tariff}\nVIP: ✅ активен до <t:{expiresAt}:F>.',
  whoisActiveForever:
    'Пользователь: <@{discordId}>\nSteamID64: {steam64}\nТариф: VIP (навсегда)\nVIP: ✅ навсегда.',
  viplistEmpty: 'VIP-список пуст.',
  viplistPageMissing: 'Страница {page} не найдена. Всего страниц: {totalPages}.',
  viplistPage: 'VIP: {total}. Страница {page}/{totalPages}.\n{lines}',
  setVipInvalidTime: '⚠️ Неверный срок. Укажите дни (0 = навсегда).',
  setVipDoneTimed: '✅ VIP назначен до <t:{expiresAt}:F>.',
  setVipDoneForever: '✅ VIP назначен навсегда.',
  statsHeader: '📊 VIP статистика',
  statsTotals: 'Всего VIP: {total} (временные: {timed}, навсегда: {forever})',
  statsExpiring: 'Истекают в {hours}ч: {count}',
  statsLinks: 'Привязок: {links}, ошибочных: {invalid}',
  removeVipNoLink: 'SteamID64 не найден. Роли (если были) сняты.',
  removeVipDone: '✅ VIP снят.',
  giveVipUserNotFound: '❌ Пользователь не найден на сервере.',
  giveVipNoLink: '❗ SteamID64 для пользователя не найден.\nСначала добавьте привязку.',
  giveVipRoleNotFound: '❌ Роль «{roleName}» не найдена на сервере.',
  giveVipRoleNotEditable: '🚫 Не могу выдать эту роль. Проверьте позицию роли бота.',
  giveVipAlreadyHas: 'ℹ️ У пользователя уже есть эта VIP-роль.',
  giveVipFailed: '❌ Не удалось выдать роль. Проверьте права и позицию роли бота.',
  giveVipDone: '✅ Роль выдана. VIP будет активирован автоматически.',
};

const MESSAGES_EN = {
  dmVipActiveForever: '✅ VIP activated — {tariff} ⭐',
  dmVipActiveTimed: '✅ VIP activated — {tariff}\n⏳ Active until: <t:{expiresAt}:F>',
  dmRoleActivated: '✅ Role "{roleName}" activated.',
  dmMissingLink:
    '⚠️ Role "{roleName}" detected, but SteamID64 is missing.\nLink your SteamID via /steamid or /link.',
  dmExpiryWarning: '⏰ VIP expires soon — {tariff}\n📅 Ends: <t:{expiresAt}:F>',
  dmVipExpired:
    '❌ **VIP expired**\n⚠️ Disabled: **VIP perks**.\n⏳ Renew within **24 hours** to get a discount:\n💳 $4.99/14d • ~~$9.99~~ **$8.99/month** • ~~$22.99~~ **$19.99/lifetime**\n✅ Renew: **[create a ticket](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  statusLoading: '⏳ Data is still loading. Please try again later.',
  statusNoLink: '❗ SteamID64 was not found for your account.\nLink your SteamID via /steamid or /link.',
  statusInactive: '❌ VIP is not active.',
  statusActiveUntil: '✅ VIP is active until <t:{expiresAt}:F>.',
  statusActiveForever: '✅ VIP is active forever.',
  genericError: '⚠️ Something went wrong. Please try again later.',
  onlyGuild: '🚫 This command is only available in the server.',
  invalidSteamId: 'SteamID64 must be 17 digits and start with 7656119.',
  noPermLink: '🚫 You do not have permission to manage links.',
  noPermWhois: '🚫 You do not have permission to view this info.',
  noPermViplist: '🚫 You do not have permission to view the list.',
  noPermRemoveVip: '🚫 You do not have permission to remove VIP.',
  noPermGiveVip: '🚫 You do not have permission to give VIP.',
  steamidAlreadyLinked: 'ℹ️ Your SteamID64 is already saved.\nOpen a ticket to change it.',
  steamidOwned: '⚠️ This SteamID64 is already linked to another account.\nPlease open a ticket.',
  steamidSaved: '✅ SteamID64 saved.',
  linkUpdated: '✅ Link updated.',
  linkSaved: '✅ Link saved.',
  linkNotFound: '❌ Link not found.',
  linkRemoved: '✅ Link removed.',
  whoisNoLink: '❌ SteamID64 link not found.',
  whoisInactive: 'User: <@{discordId}>\nSteamID64: {steam64}\nVIP: ❌ inactive.',
  whoisActiveTimed:
    'User: <@{discordId}>\nSteamID64: {steam64}\nTariff: {tariff}\nVIP: ✅ active until <t:{expiresAt}:F>.',
  whoisActiveForever:
    'User: <@{discordId}>\nSteamID64: {steam64}\nTariff: VIP (forever)\nVIP: ✅ forever.',
  viplistEmpty: 'VIP list is empty.',
  viplistPageMissing: 'Page {page} not found. Total pages: {totalPages}.',
  viplistPage: 'VIP: {total}. Page {page}/{totalPages}.\n{lines}',
  setVipInvalidTime: '⚠️ Invalid duration. Use days (0 = forever).',
  setVipDoneTimed: '✅ VIP set until <t:{expiresAt}:F>.',
  setVipDoneForever: '✅ VIP set forever.',
  statsHeader: '📊 VIP stats',
  statsTotals: 'Total VIP: {total} (timed: {timed}, forever: {forever})',
  statsExpiring: 'Expiring in {hours}h: {count}',
  statsLinks: 'Links: {links}, invalid: {invalid}',
  removeVipNoLink: 'SteamID64 not found. Roles (if any) were removed.',
  removeVipDone: '✅ VIP removed.',
  giveVipUserNotFound: '❌ User not found on the server.',
  giveVipNoLink: '❗ SteamID64 not found for this user.\nLink it first via /steamid or /link.',
  giveVipRoleNotFound: '❌ Role "{roleName}" not found on the server.',
  giveVipRoleNotEditable: '🚫 Cannot assign this role. Check the bot role position.',
  giveVipAlreadyHas: 'ℹ️ The user already has this VIP role.',
  giveVipFailed: '❌ Failed to assign role. Check permissions and role position.',
  giveVipDone: '✅ Role assigned. VIP will be activated automatically.',
};

const TARIFF_LABELS_RU = {
  'VIP Test': 'VIP (1 час)',
  'VIP 14 Days': 'VIP (14 дней)',
  'VIP Monthly': 'VIP (30 дней)',
  VIP: 'VIP (навсегда)',
};

const TARIFF_LABELS_EN = {
  'VIP Test': 'VIP (1 hour)',
  'VIP 14 Days': 'VIP (14 days)',
  'VIP Monthly': 'VIP (30 days)',
  VIP: 'VIP (forever)',
};

const AUDIT_LABELS_RU = {
  role_add: 'VIP выдан',
  manual_remove: 'VIP снят',
  expire_remove: 'VIP истек',
  expire_warn: 'Предупреждение об истечении',
  link_set: 'Привязка сохранена',
  link_remove: 'Привязка удалена',
  newera_add: 'NewEra выдан',
  newera_remove: 'NewEra снят',
  api_givevip: 'API: выдача VIP',
  api_removevip: 'API: снятие VIP',
  api_setvip: 'API: установка срока VIP',
  command_givevip: 'Команда: выдача VIP',
  command_removevip: 'Команда: снятие VIP',
  command_setvip: 'Команда: установка срока VIP',
};

const AUDIT_LABELS_EN = {
  role_add: 'VIP granted',
  manual_remove: 'VIP removed',
  expire_remove: 'VIP expired',
  expire_warn: 'Expiration warning',
  link_set: 'Link set',
  link_remove: 'Link removed',
  newera_add: 'NewEra granted',
  newera_remove: 'NewEra removed',
  api_givevip: 'API: give VIP',
  api_removevip: 'API: remove VIP',
  api_setvip: 'API: set VIP expiration',
  command_givevip: 'Command: give VIP',
  command_removevip: 'Command: remove VIP',
  command_setvip: 'Command: set VIP expiration',
};

const AUDIT_FIELDS_RU = {
  server: 'Сервер',
  discord: 'Discord',
  steam: 'Steam64',
  role: 'Роль',
  expires: 'Срок',
  note: 'Примечание',
};

const AUDIT_FIELDS_EN = {
  server: 'Server',
  discord: 'Discord',
  steam: 'Steam64',
  role: 'Role',
  expires: 'Expires',
  note: 'Note',
};

const MESSAGES_BY_LANG = {
  ru: MESSAGES_RU,
  en: MESSAGES_EN,
};

const TARIFF_LABELS_BY_LANG = {
  ru: TARIFF_LABELS_RU,
  en: TARIFF_LABELS_EN,
};

const AUDIT_LABELS_BY_LANG = {
  ru: AUDIT_LABELS_RU,
  en: AUDIT_LABELS_EN,
};

const AUDIT_FIELDS_BY_LANG = {
  ru: AUDIT_FIELDS_RU,
  en: AUDIT_FIELDS_EN,
};

const AUDIT_FOREVER_BY_LANG = {
  ru: 'навсегда',
  en: 'forever',
};

const ROLE_REMOVE_REASON_BY_LANG = {
  ru: 'VIP истек',
  en: 'VIP expired',
};

const STATUS_COMMAND = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check VIP status')
  .setDMPermission(false);

const STEAMID_COMMAND = new SlashCommandBuilder()
  .setName('steamid')
  .setDescription('Link SteamID64')
  .setDMPermission(false)
  .addStringOption((option) =>
    option
      .setName('steamid')
      .setDescription('SteamID64 (17 digits)')
      .setRequired(true)
  );

const LINK_COMMAND = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link SteamID64 to user')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((option) =>
    option.setName('user').setDescription('Target user').setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('steamid')
      .setDescription('SteamID64 (17 digits)')
      .setRequired(true)
  );

const UNLINK_COMMAND = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription('Remove SteamID64 link')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((option) =>
    option.setName('user').setDescription('Target user').setRequired(true)
  );

const WHOIS_COMMAND = new SlashCommandBuilder()
  .setName('whois')
  .setDescription('Show SteamID64 and VIP status')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((option) =>
    option.setName('user').setDescription('Target user').setRequired(true)
  );

const VIPLIST_COMMAND = new SlashCommandBuilder()
  .setName('viplist')
  .setDescription('List active VIP')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addIntegerOption((option) =>
    option.setName('page').setDescription('Page number').setMinValue(1)
  );

const SETVIP_COMMAND = new SlashCommandBuilder()
  .setName('setvip')
  .setDescription('Set VIP expiration')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((option) =>
    option.setName('user').setDescription('Target user').setRequired(true)
  )
  .addIntegerOption((option) =>
    option
      .setName('days')
      .setDescription('Days until expiration; 0 = forever')
      .setRequired(true)
      .setMinValue(0)
  )
  .addStringOption((option) => {
    option.setName('role').setDescription('VIP role (optional)').setRequired(false);
    for (const roleName of VIP_ROLES.keys()) {
      option.addChoices({ name: roleName, value: roleName });
    }
    return option;
  });

const STATS_COMMAND = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('VIP stats')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

const REMOVEVIP_COMMAND = new SlashCommandBuilder()
  .setName('removevip')
  .setDescription('Remove VIP from user')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((option) =>
    option.setName('user').setDescription('Target user').setRequired(true)
  );

const GIVEVIP_COMMAND = new SlashCommandBuilder()
  .setName('givevip')
  .setDescription('Give VIP role')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((option) =>
    option.setName('user').setDescription('Target user').setRequired(true)
  )
  .addStringOption((option) => {
    option.setName('tariff').setDescription('VIP tariff').setRequired(true);
    for (const roleName of VIP_ROLES.keys()) {
      option.addChoices({ name: roleName, value: roleName });
    }
    option.addChoices({ name: NEWERA_ROLE_NAME, value: NEWERA_ROLE_NAME });
    return option;
  });

const config = loadConfig();
const DEFAULT_LANGUAGE = normalizeLanguage(config.language, 'ru');
const AUDIT_LABELS = AUDIT_LABELS_BY_LANG[DEFAULT_LANGUAGE] || AUDIT_LABELS_RU;
const AUDIT_FIELDS = AUDIT_FIELDS_BY_LANG[DEFAULT_LANGUAGE] || AUDIT_FIELDS_RU;
const AUDIT_FOREVER = AUDIT_FOREVER_BY_LANG[DEFAULT_LANGUAGE] || 'РЅР°РІСЃРµРіРґР°';
const ROLE_REMOVE_REASON =
  ROLE_REMOVE_REASON_BY_LANG[DEFAULT_LANGUAGE] || ROLE_REMOVE_REASON_BY_LANG.ru;
const servers = buildServers(config);
const primaryServer = pickPrimaryServer(servers, config.primaryServer);

const LOG_PATH = path.resolve(process.cwd(), config.logPath);
const CHECK_INTERVAL_MS = Math.max(10, Number(config.checkIntervalSeconds) || 60) * 1000;
const NOTIFY_THRESHOLDS = buildNotifyThresholds(config.notifyBeforeHours ?? 24);
const VIPLIST_PAGE_SIZE = 20;
const AUDIT_ACTIONS = new Set([
  'role_add',
  'manual_remove',
  'expire_remove',
  'expire_warn',
  'link_set',
  'link_remove',
  'newera_add',
  'newera_remove',
  'api_givevip',
  'api_removevip',
  'api_setvip',
  'command_givevip',
  'command_removevip',
  'command_setvip',
]);

logStartupInfo(config, servers, primaryServer);

let db = null;
let opQueue = Promise.resolve();
let primaryGuild = null;
let auditChannel = null;
const invalidLinks = new Set();
const roleChangeSkips = new Set();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember, Partials.User],
});

function loadConfig() {
  try {
    console.log(`[startup] loading config from ${CONFIG_PATH}`);
    const raw = require(CONFIG_PATH);
    if (!raw || typeof raw !== 'object') {
      throw new Error('config.json is empty');
    }
    if (!raw.token || !raw.clientId || !raw.guildId) {
      throw new Error('config.json must include token, clientId, and guildId');
    }
    if (!raw.logPath) {
      throw new Error('config.json must include logPath');
    }
    return normalizeConfig(raw);
  } catch (err) {
    console.error('Не удалось загрузить config.json. Скопируйте config.example.json в config.json и заполните его.');
    console.error(err.message || err);
    process.exit(1);
  }
}

function maskSecret(value) {
  if (!value) {
    return null;
  }
  const text = String(value);
  if (text.length <= 6) {
    return '***';
  }
  return `${text.slice(0, 3)}...${text.slice(-3)}`;
}

function logStartupInfo(config, servers, primaryServer) {
  console.log(
    `[startup] cwd=${process.cwd()} runtimeDir=${getRuntimeDir()} execPath=${process.execPath} pkg=${!!process.pkg}`
  );
  console.log(`[startup] botDbPath=${BOT_DB_PATH}`);
  console.log(`[startup] logPath=${LOG_PATH}`);
  console.log(
    `[startup] clientId=${config.clientId} guildId=${config.guildId} primaryServer=${primaryServer.name}`
  );
  for (const server of servers) {
    const ftp = server.type === 'ftp'
      ? ` ftpHost=${server.ftp?.host || '-'} ftpUser=${server.ftp?.user || '-'} ftpSecure=${!!server.ftp?.secure}`
      : '';
    const profile = server.profilePath ? ` profilePath=${server.profilePath}` : '';
    console.log(
      `[startup] server name=${server.name} type=${server.type} whitelistPath=${server.whitelistPath}${profile}${ftp}`
    );
  }
  if (config.token) {
    console.log(`[startup] token=${maskSecret(config.token)}`);
  }
  if (config.api?.enabled) {
    console.log(
      `[startup] api host=${config.api.host} port=${config.api.port} token=${maskSecret(config.api.token)}`
    );
  }
}

function normalizeConfig(raw) {
  const config = { ...raw };
  if (!Array.isArray(config.servers) || config.servers.length === 0) {
    if (!config.whitelistPath) {
      throw new Error('config.json must include servers or whitelistPath');
    }
    config.servers = [
      {
        name: config.primaryServer || 'server1',
        type: config.ftp ? 'ftp' : 'local',
        profilePath: config.profilePath,
        whitelistPath: config.whitelistPath,
        ftp: config.ftp,
      },
    ];
  }
  if (!config.primaryServer) {
    config.primaryServer = config.servers[0].name || 'server1';
  }
  const api = config.api && typeof config.api === 'object' ? { ...config.api } : {};
  api.enabled = Boolean(api.enabled);
  api.host = api.host || '0.0.0.0';
  api.port = Number(api.port) || 8787;
  api.maxLogLines = Math.max(10, Number(api.maxLogLines) || 500);
  api.maxPageSize = Math.max(10, Math.min(200, Number(api.maxPageSize) || 100));
  const rawAllowedOrigins = api.allowedOrigins ?? api.corsOrigins ?? [];
  let allowedOrigins = [];
  if (Array.isArray(rawAllowedOrigins)) {
    allowedOrigins = rawAllowedOrigins.map((origin) => String(origin || '').trim()).filter(Boolean);
  } else if (typeof rawAllowedOrigins === 'string') {
    allowedOrigins = rawAllowedOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  api.allowedOrigins = allowedOrigins;
  if (api.enabled && !api.token) {
    throw new Error('config.json api.token is required when api.enabled=true');
  }
  config.api = api;
  return config;
}

function buildServers(config) {
  const servers = config.servers.map((entry, index) => createServerStore(entry, index));
  const nameSet = new Set();
  for (const server of servers) {
    if (nameSet.has(server.name)) {
      throw new Error(`Duplicate server name: ${server.name}`);
    }
    nameSet.add(server.name);
  }
  return servers;
}

function pickPrimaryServer(servers, name) {
  const primary = servers.find((server) => server.name === name);
  if (!primary) {
    throw new Error(`Primary server not found: ${name}`);
  }
  return primary;
}

function createServerStore(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid server entry at index ${index}`);
  }
  const name = String(entry.name || `server${index + 1}`);
  const type = entry.type || (entry.ftp ? 'ftp' : 'local');
  const whitelistPathRaw = entry.whitelistPath;
  if (!whitelistPathRaw) {
    throw new Error(`Server ${name} is missing whitelistPath`);
  }
  if (String(whitelistPathRaw).toLowerCase().startsWith('$profile:') && !entry.profilePath) {
    throw new Error(`Server ${name} must include profilePath when whitelistPath uses $profile:`);
  }
  if (type === 'ftp') {
    if (!entry.ftp || !entry.ftp.host || !entry.ftp.user || !entry.ftp.password) {
      throw new Error(`Server ${name} is missing ftp.host/user/password`);
    }
  }

  const whitelistPath = type === 'ftp'
    ? resolvePathWithProfileRemote(whitelistPathRaw, entry.profilePath)
    : resolvePathWithProfile(whitelistPathRaw, entry.profilePath);

  return {
    name,
    type,
    profilePath: entry.profilePath || null,
    whitelistPath,
    ftp: entry.ftp || null,
    saveQueue: Promise.resolve(),
  };
}

function resolvePathWithProfile(targetPath, profilePath) {
  const value = String(targetPath || '');
  const lower = value.toLowerCase();
  if (lower.startsWith('$profile:')) {
    const suffix = value.slice('$profile:'.length).replace(/^[/\\]+/, '');
    return path.resolve(profilePath, suffix);
  }
  return path.resolve(process.cwd(), value);
}

function normalizeRemotePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolvePathWithProfileRemote(targetPath, profilePath) {
  const value = String(targetPath || '');
  const lower = value.toLowerCase();
  if (lower.startsWith('$profile:')) {
    const suffix = value.slice('$profile:'.length).replace(/^[/\\]+/, '');
    return path.posix.join(normalizeRemotePath(profilePath), normalizeRemotePath(suffix));
  }
  return normalizeRemotePath(value);
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLogTimestamp() {
  const date = new Date();
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatDiscordTimestamp(unixSeconds, style) {
  return `<t:${unixSeconds}:${style}>`;
}

function formatMessage(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

function normalizeLanguage(value, fallback = 'ru') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('ru')) {
    return 'ru';
  }
  if (raw.startsWith('en')) {
    return 'en';
  }
  return fallback;
}

function getMessagesForLanguage(language) {
  const normalized = normalizeLanguage(language, DEFAULT_LANGUAGE);
  return MESSAGES_BY_LANG[normalized] || MESSAGES_RU;
}

function getTariffLabelsForLanguage(language) {
  const normalized = normalizeLanguage(language, DEFAULT_LANGUAGE);
  return TARIFF_LABELS_BY_LANG[normalized] || TARIFF_LABELS_RU;
}

function getInteractionLanguage(interaction) {
  return normalizeLanguage(interaction.locale || interaction.guildLocale, DEFAULT_LANGUAGE);
}

function rememberUserLanguage(discordId, language) {
  if (!db || !discordId) {
    return;
  }
  if (!db.locales || typeof db.locales !== 'object') {
    db.locales = {};
  }
  const normalized = normalizeLanguage(language, DEFAULT_LANGUAGE);
  if (db.locales[discordId] !== normalized) {
    db.locales[discordId] = normalized;
  }
}

function resolveUserLanguage(discordId, fallback) {
  if (db && db.locales && db.locales[discordId]) {
    return normalizeLanguage(db.locales[discordId], DEFAULT_LANGUAGE);
  }
  return normalizeLanguage(fallback, DEFAULT_LANGUAGE);
}


function formatAuditLabel(action) {
  return AUDIT_LABELS[action] || action;
}

function formatAuditExpires(expiresAt) {
  if (expiresAt === null || expiresAt === undefined) {
    return '-';
  }
  const value = Number(expiresAt);
  if (!Number.isFinite(value)) {
    return '-';
  }
  if (value === 0) {
    return AUDIT_FOREVER;
  }
  return formatDiscordTimestamp(value, 'F');
}

function getAuditColor(action) {
  switch (action) {
    case 'role_add':
    case 'command_givevip':
    case 'command_setvip':
      return 0x2ecc71;
    case 'expire_warn':
      return 0xf1c40f;
    case 'manual_remove':
    case 'expire_remove':
    case 'command_removevip':
      return 0xe74c3c;
    case 'link_set':
    case 'link_remove':
      return 0x3498db;
    default:
      return 0x95a5a6;
  }
}

function buildAuditEmbed(action, details) {
  const discordId = details.discordId || null;
  const steam64 = details.steam64 || null;
  const roleName = details.roleName || null;
  const expiresAt = details.expiresAt;
  const note = details.note || null;

  const fields = [
    {
      name: AUDIT_FIELDS.server,
      value: details.serverName || '-',
      inline: true,
    },
    {
      name: AUDIT_FIELDS.discord,
      value: discordId ? `<@${discordId}> (${discordId})` : '-',
      inline: true,
    },
    {
      name: AUDIT_FIELDS.steam,
      value: steam64 ? String(steam64) : '-',
      inline: true,
    },
  ];

  if (roleName) {
    fields.push({ name: AUDIT_FIELDS.role, value: roleName, inline: true });
  }
  if (expiresAt !== undefined && expiresAt !== null) {
    fields.push({ name: AUDIT_FIELDS.expires, value: formatAuditExpires(expiresAt), inline: true });
  }
  if (note) {
    fields.push({ name: AUDIT_FIELDS.note, value: String(note), inline: false });
  }
  return new EmbedBuilder()
    .setTitle(formatAuditLabel(action))
    .setColor(getAuditColor(action))
    .addFields(fields)
    .setTimestamp();
}

function buildNotifyThresholds(value) {
  const raw = Array.isArray(value) ? value : [value];
  const seconds = raw
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((hours) => Math.floor(hours * 3600));
  return [...new Set(seconds)].sort((a, b) => b - a);
}

function pickBestRole(roleNames) {
  let best = null;
  let bestScore = -1;
  for (const name of roleNames) {
    const duration = VIP_ROLES.get(name);
    const score = duration === null ? Number.MAX_SAFE_INTEGER : duration;
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

function markRoleSkip(discordId, roleName) {
  if (!discordId || !roleName) {
    return;
  }
  roleChangeSkips.add(`${discordId}:${roleName}`);
}

function consumeRoleSkip(discordId, roleName) {
  if (!discordId || !roleName) {
    return false;
  }
  const key = `${discordId}:${roleName}`;
  if (roleChangeSkips.has(key)) {
    roleChangeSkips.delete(key);
    return true;
  }
  return false;
}

function formatTariffDisplay(roleName, language) {
  const labels = getTariffLabelsForLanguage(language);
  if (!roleName) {
    return labels.VIP || 'VIP';
  }
  return labels[roleName] || roleName;
}

function hasManageRoles(interaction) {
  return (
    interaction.memberPermissions &&
    interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)
  );
}

function normalizeSteamId64(value) {
  return String(value || '').trim();
}

function isValidSteamId64(value) {
  if (!/^\d{17}$/.test(value)) {
    return false;
  }
  return value.startsWith('7656119');
}

function normalizeDiscordId(value) {
  if (!value) {
    return null;
  }
  const digits = String(value).match(/\d+/g);
  return digits ? digits.join('') : null;
}

function isValidDiscordId(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}
function getLinkedSteamId(discordId) {
  const raw = db.links[discordId];
  if (!raw) {
    return null;
  }
  const normalized = normalizeSteamId64(raw);
  if (!isValidSteamId64(normalized)) {
    if (!invalidLinks.has(discordId)) {
      invalidLinks.add(discordId);
      logAction('link_invalid', {
        serverName: primaryServer.name,
        discordId,
        steam64: normalized,
        roleName: null,
        expiresAt: null,
        note: 'invalid_format',
      }).catch(() => {});
    }
    return null;
  }
  if (invalidLinks.has(discordId)) {
    invalidLinks.delete(discordId);
  }
  return normalized;
}

async function validateLinksOnLoad() {
  invalidLinks.clear();
  for (const [discordId, steam64] of Object.entries(db.links)) {
    const normalized = normalizeSteamId64(steam64);
    if (!isValidSteamId64(normalized)) {
      invalidLinks.add(discordId);
      await logAction('link_invalid', {
        serverName: primaryServer.name,
        discordId,
        steam64: normalized,
        roleName: null,
        expiresAt: null,
        note: 'invalid_format',
      });
    }
  }
}

function countInvalidLinks() {
  let count = 0;
  for (const steam64 of Object.values(db.links)) {
    const normalized = normalizeSteamId64(steam64);
    if (!isValidSteamId64(normalized)) {
      count += 1;
    }
  }
  return count;
}

function normalizeSettingsDb(data) {
  const normalized = data && typeof data === 'object' ? data : {};
  if (!normalized.whiteList || typeof normalized.whiteList !== 'object') {
    normalized.whiteList = {};
  }
  if (!Array.isArray(normalized.whiteList.vip)) {
    normalized.whiteList.vip = [];
  } else {
    normalized.whiteList.vip = [...new Set(normalized.whiteList.vip.map(String))];
  }
  if (!Array.isArray(normalized.whiteList.newera)) {
    normalized.whiteList.newera = [];
  } else {
    normalized.whiteList.newera = [...new Set(normalized.whiteList.newera.map(String))];
  }
  if (Array.isArray(normalized.newera) && normalized.newera.length > 0) {
    normalized.whiteList.newera = [
      ...new Set([...normalized.whiteList.newera, ...normalized.newera.map(String)]),
    ];
  }
  delete normalized.newera;
  return normalized;
}

function normalizeBotDb(data) {
  const normalized = data && typeof data === 'object' ? data : {};
  if (!normalized.links || typeof normalized.links !== 'object') {
    normalized.links = {};
  }
  if (!normalized.locales || typeof normalized.locales !== 'object') {
    normalized.locales = {};
  }
  if (!normalized.vipTimed || typeof normalized.vipTimed !== 'object') {
    normalized.vipTimed = {};
  }
  if (!Array.isArray(normalized.history)) {
    normalized.history = [];
  }
  return normalized;
}

function createBaseSettingsDb() {
  return {
    Enable: 1,
    ChatCommand: '!loadout',
    PresetSlots: 10,
    whiteList: { vip: [], newera: [] },
  };
}

function createBaseBotDb() {
  return {
    links: {},
    locales: {},
    vipTimed: {},
    history: [],
  };
}

function extractSettingsPayload(data) {
  const settings = { ...(data || {}) };
  delete settings.links;
  delete settings.locales;
  delete settings.vipTimed;
  delete settings.history;
  delete settings.newera;
  return normalizeSettingsDb(settings);
}

function extractMetaPayload(data) {
  return normalizeBotDb({
    links: data?.links,
    locales: data?.locales,
    vipTimed: data?.vipTimed,
    history: data?.history,
  });
}

function hasMetaDataInSettings(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const links = data.links && typeof data.links === 'object' ? Object.keys(data.links).length : 0;
  const locales = data.locales && typeof data.locales === 'object'
    ? Object.keys(data.locales).length
    : 0;
  const vipTimed = data.vipTimed && typeof data.vipTimed === 'object'
    ? Object.keys(data.vipTimed).length
    : 0;
  const history = Array.isArray(data.history) ? data.history.length : 0;
  return links + locales + vipTimed + history > 0;
}

function hasMetaFieldsInSettings(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  return (
    Object.prototype.hasOwnProperty.call(data, 'links') ||
    Object.prototype.hasOwnProperty.call(data, 'locales') ||
    Object.prototype.hasOwnProperty.call(data, 'vipTimed') ||
    Object.prototype.hasOwnProperty.call(data, 'history')
  );
}

function isMetaEmpty(meta) {
  if (!meta || typeof meta !== 'object') {
    return true;
  }
  const links = meta.links && typeof meta.links === 'object' ? Object.keys(meta.links).length : 0;
  const locales = meta.locales && typeof meta.locales === 'object'
    ? Object.keys(meta.locales).length
    : 0;
  const vipTimed = meta.vipTimed && typeof meta.vipTimed === 'object'
    ? Object.keys(meta.vipTimed).length
    : 0;
  const history = Array.isArray(meta.history) ? meta.history.length : 0;
  return links + locales + vipTimed + history === 0;
}

function mergeMetaIntoBotDb(base, incoming) {
  const normalized = normalizeBotDb(base);
  let changed = false;

  if (incoming && typeof incoming === 'object') {
    for (const [discordId, steam64] of Object.entries(incoming.links || {})) {
      if (!normalized.links[discordId]) {
        normalized.links[discordId] = steam64;
        changed = true;
      }
    }

    for (const [discordId, locale] of Object.entries(incoming.locales || {})) {
      if (!normalized.locales[discordId]) {
        normalized.locales[discordId] = locale;
        changed = true;
      }
    }

    for (const [steam64, record] of Object.entries(incoming.vipTimed || {})) {
      if (!normalized.vipTimed[steam64]) {
        normalized.vipTimed[steam64] = record;
        changed = true;
      }
    }

    if (Array.isArray(incoming.history) && incoming.history.length > 0) {
      if (!Array.isArray(normalized.history) || normalized.history.length === 0) {
        normalized.history = [...incoming.history];
        changed = true;
      }
    }
  }

  return { meta: normalized, changed };
}

function isNotFoundError(err) {
  if (!err) {
    return false;
  }
  if (err.code === 'ENOENT') {
    return true;
  }
  const message = String(err.message || '');
  if (message.includes('550') || /not found/i.test(message)) {
    return true;
  }
  return false;
}

async function readServerFile(server) {
  if (server.type === 'ftp') {
    return readFtpFile(server);
  }
  return fs.readFile(server.whitelistPath, 'utf8');
}

async function writeServerFileAtomic(server, data) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  if (server.type === 'ftp') {
    await writeFtpFileAtomic(server, json);
    return;
  }
  await fs.mkdir(path.dirname(server.whitelistPath), { recursive: true });
  const tempPath = `${server.whitelistPath}.tmp`;
  await fs.writeFile(tempPath, json, 'utf8');
  await fs.rename(tempPath, server.whitelistPath);
}

async function writeLocalFileAtomic(targetPath, data) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, json, 'utf8');
  await fs.rename(tempPath, targetPath);
}

function enqueueServerSave(server, data) {
  server.saveQueue = server.saveQueue
    .then(() => writeServerFileAtomic(server, data))
    .catch((err) => {
      console.error(`Failed to save whitelist JSON (${server.name}):`, err);
    });
  return server.saveQueue;
}

let botDbSaveQueue = Promise.resolve();

function enqueueBotDbSave(data) {
  botDbSaveQueue = botDbSaveQueue
    .then(() => writeLocalFileAtomic(BOT_DB_PATH, data))
    .catch((err) => {
      console.error('Failed to save bot-db.json:', err);
    });
  return botDbSaveQueue;
}

async function readServerJsonOrCreate(server) {
  try {
    const raw = await readServerFile(server);
    return normalizeSettingsDb(JSON.parse(stripBom(raw)));
  } catch (err) {
    if (isNotFoundError(err)) {
      const base = createBaseSettingsDb();
      await writeServerFileAtomic(server, base);
      return normalizeSettingsDb(base);
    }
    throw err;
  }
}

async function readBotDbOrCreate() {
  try {
    const raw = await fs.readFile(BOT_DB_PATH, 'utf8');
    return normalizeBotDb(JSON.parse(stripBom(raw)));
  } catch (err) {
    if (isNotFoundError(err)) {
      const base = createBaseBotDb();
      await writeLocalFileAtomic(BOT_DB_PATH, base);
      return normalizeBotDb(base);
    }
    throw err;
  }
}

async function withFtpClient(ftpConfig, task) {
  const client = new ftp.Client(10000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port || 21,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: !!ftpConfig.secure,
    });
    return await task(client);
  } finally {
    client.close();
  }
}

async function readFtpFile(server) {
  return withFtpClient(server.ftp, async (client) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    await client.downloadTo(writable, server.whitelistPath);
    return Buffer.concat(chunks).toString('utf8');
  });
}

async function writeFtpFileAtomic(server, json) {
  return withFtpClient(server.ftp, async (client) => {
    const remotePath = server.whitelistPath;
    const remoteDir = path.posix.dirname(remotePath);
    const baseName = path.posix.basename(remotePath);
    const tempName = `${baseName}.tmp`;

    await client.ensureDir(remoteDir);

    const stream = Readable.from([Buffer.from(json, 'utf8')]);
    await client.uploadFrom(stream, tempName);

    try {
      await client.rename(tempName, baseName);
    } catch (err) {
      const message = String(err.message || '').toLowerCase();
      if (message.includes('550') || message.includes('exist')) {
        try {
          await client.remove(baseName);
        } catch (removeErr) {
          if (!isNotFoundError(removeErr)) {
            throw removeErr;
          }
        }
        await client.rename(tempName, baseName);
      } else {
        throw err;
      }
    }
  });
}

function enqueueOperation(task) {
  opQueue = opQueue
    .then(task)
    .catch((err) => {
      console.error('Operation failed:', err);
    });
  return opQueue;
}

async function loadPrimaryDb() {
  const settingsRaw = await readServerJsonOrCreate(primaryServer);
  const settings = extractSettingsPayload(settingsRaw);
  let meta = await readBotDbOrCreate();
  const settingsHasMetaFields = hasMetaFieldsInSettings(settingsRaw);
  const settingsHasMetaData = hasMetaDataInSettings(settingsRaw);
  let metaChanged = false;

  if (settingsHasMetaData) {
    const metaFromSettings = extractMetaPayload(settingsRaw);
    if (isMetaEmpty(meta)) {
      meta = metaFromSettings;
      metaChanged = true;
    } else {
      const merged = mergeMetaIntoBotDb(meta, metaFromSettings);
      if (merged.changed) {
        meta = merged.meta;
        metaChanged = true;
      }
    }
  }
  if (metaChanged) {
    await enqueueBotDbSave(meta);
  }
  db = { ...settings, ...meta };
  await validateLinksOnLoad();
  if (settingsHasMetaFields) {
    await enqueueServerSave(primaryServer, settings);
  }
}

async function savePrimaryDb() {
  const metaPayload = extractMetaPayload(db);
  const settingsPayload = extractSettingsPayload(db);
  await enqueueBotDbSave(metaPayload);
  return enqueueServerSave(primaryServer, settingsPayload);
}

async function syncWhitelistToServers() {
  if (servers.length <= 1) {
    return;
  }
  const whitelist = [...new Set(db.whiteList.vip.map(String))];
  const newera = Array.isArray(db.whiteList?.newera)
    ? [...new Set(db.whiteList.newera.map(String))]
    : [];
  for (const server of servers) {
    if (server === primaryServer) {
      continue;
    }
    try {
      const serverDb = await readServerJsonOrCreate(server);
      const settingsPayload = extractSettingsPayload(serverDb);
      settingsPayload.whiteList.vip = [...whitelist];
      settingsPayload.whiteList.newera = [...newera];
      await enqueueServerSave(server, settingsPayload);
    } catch (err) {
      console.error(`Failed to sync whitelist to ${server.name}:`, err);
      await logAction('sync_fail', {
        serverName: server.name,
        discordId: null,
        steam64: null,
        roleName: null,
        expiresAt: null,
        note: err.message || 'sync_failed',
      });
    }
  }
}

async function persistAndSync() {
  await savePrimaryDb();
  await syncWhitelistToServers();
}

async function readLogTail(limit) {
  try {
    const stat = await fs.stat(LOG_PATH);
    if (!stat.size) {
      return [];
    }

    const maxBytes = 1024 * 1024;
    const chunkSize = 64 * 1024;
    let position = stat.size;
    let bytesReadTotal = 0;
    let data = '';

    const handle = await fs.open(LOG_PATH, 'r');
    try {
      while (position > 0 && bytesReadTotal < maxBytes) {
        const readSize = Math.min(chunkSize, position);
        position -= readSize;
        const buffer = Buffer.alloc(readSize);
        const { bytesRead } = await handle.read(buffer, 0, readSize, position);
        if (!bytesRead) {
          break;
        }
        bytesReadTotal += bytesRead;
        data = buffer.slice(0, bytesRead).toString('utf8') + data;
        const lines = data.split(/\r?\n/).filter(Boolean);
        if (lines.length >= limit) {
          return lines.slice(-limit);
        }
      }
    } finally {
      await handle.close();
    }

    const lines = data.split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit);
  } catch (err) {
    if (isNotFoundError(err)) {
      return [];
    }
    throw err;
  }
}

function getApiTokenFromRequest(req) {
  const directToken = req.get('x-api-token');
  if (directToken) {
    return String(directToken).trim();
  }
  const authHeader = req.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function resolveApiTarget(payload) {
  let discordId = payload.discordId ? normalizeDiscordId(payload.discordId) : null;
  if (discordId && !isValidDiscordId(discordId)) {
    return { error: 'invalid_discord_id' };
  }
  let steam64 = payload.steam64 ? normalizeSteamId64(payload.steam64) : null;
  if (steam64 && !isValidSteamId64(steam64)) {
    return { error: 'invalid_steam64' };
  }
  if (!steam64 && discordId) {
    steam64 = getLinkedSteamId(discordId);
  }
  if (!steam64) {
    return { error: 'steam64_not_found', discordId };
  }
  const linkedDiscordId = discordId || findDiscordIdBySteam(steam64);
  return { steam64: String(steam64), discordId: linkedDiscordId || null };
}

async function fetchGuildMember(discordId) {
  if (!primaryGuild || !discordId) {
    return null;
  }
  try {
    return await primaryGuild.members.fetch(discordId);
  } catch (err) {
    return null;
  }
}

async function addVipRoleToMember(member, roleName, reason) {
  if (!member || !roleName) {
    return { assigned: false, reason: 'no_member' };
  }
  const role = member.guild.roles.cache.find((entry) => entry.name === roleName);
  if (!role) {
    return { assigned: false, reason: 'role_not_found' };
  }
  if (!role.editable) {
    return { assigned: false, reason: 'role_not_editable' };
  }
  if (member.roles.cache.has(role.id)) {
    return { assigned: false, reason: 'already_has_role' };
  }
  markRoleSkip(member.id, roleName);
  await member.roles.add(role, reason);
  return { assigned: true };
}

function startApiServer() {
  if (!config.api?.enabled) {
    return;
  }
  const api = config.api;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  const allowedOrigins = Array.isArray(api.allowedOrigins) ? api.allowedOrigins : [];
  const allowAllOrigins = allowedOrigins.length === 0;
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (allowAllOrigins) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (!origin) {
      // Non-browser requests (no Origin header) are allowed.
    } else if (origin === 'null' && allowedOrigins.includes('null')) {
      res.setHeader('Access-Control-Allow-Origin', 'null');
      res.setHeader('Vary', 'Origin');
    } else if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.status(403).json({ ok: false, error: 'origin_not_allowed' });
      return;
    }
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-token, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use((req, res, next) => {
    const token = getApiTokenFromRequest(req);
    if (!token || token !== api.token) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }
    if (!db) {
      res.status(503).json({ ok: false, error: 'db_not_ready' });
      return;
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      time: new Date().toISOString(),
      version: '1.0',
    });
  });

  app.get('/api/vip/list', (req, res) => {
    const query = String(req.query.q || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(api.maxPageSize, Math.max(1, Number(req.query.pageSize) || 50));
    let items = [...new Set(db.whiteList.vip.map(String))].map((steam64) => {
      const discordId = findDiscordIdBySteam(steam64);
      const timed = db.vipTimed[steam64];
      const expiresAt = timed && Number(timed.expiresAt) > 0 ? Number(timed.expiresAt) : 0;
      const roleName = timed?.roleName || 'VIP';
      return {
        steam64,
        discordId,
        roleName,
        tariff: formatTariffDisplay(roleName, DEFAULT_LANGUAGE),
        expiresAt,
      };
    });

    if (query) {
      items = items.filter((item) => {
        if (item.steam64.includes(query)) {
          return true;
        }
        return item.discordId ? item.discordId.includes(query) : false;
      });
    }

    const sortBy = String(req.query.sortBy || '').toLowerCase();
    const sortDir = String(req.query.sortDir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const direction = sortDir === 'desc' ? -1 : 1;
    const roleOrder = {
      'VIP Test': 1,
      'VIP 14 Days': 2,
      'VIP Monthly': 3,
      VIP: 4,
    };

    if (sortBy === 'expiresat' || sortBy === 'expires') {
      items.sort((a, b) => {
        const aVal = a.expiresAt > 0 ? a.expiresAt : Number.MAX_SAFE_INTEGER;
        const bVal = b.expiresAt > 0 ? b.expiresAt : Number.MAX_SAFE_INTEGER;
        if (aVal === bVal) {
          return a.steam64.localeCompare(b.steam64) * direction;
        }
        return (aVal - bVal) * direction;
      });
    } else if (sortBy === 'tariff' || sortBy === 'role' || sortBy === 'rolename') {
      items.sort((a, b) => {
        const aVal = roleOrder[a.roleName] ?? 99;
        const bVal = roleOrder[b.roleName] ?? 99;
        if (aVal === bVal) {
          return a.steam64.localeCompare(b.steam64) * direction;
        }
        return (aVal - bVal) * direction;
      });
    } else if (sortBy === 'steam64' || sortBy === 'steam') {
      items.sort((a, b) => a.steam64.localeCompare(b.steam64) * direction);
    } else {
      items.sort((a, b) => a.steam64.localeCompare(b.steam64));
    }

    const total = items.length;
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    res.json({
      ok: true,
      total,
      page,
      pageSize,
      items: slice,
    });
  });

  app.get('/api/vip/stats', (req, res) => {
    const now = unixNow();
    const whitelist = new Set(db.whiteList.vip.map(String));
    const timedEntries = Object.entries(db.vipTimed).filter(
      ([steam64, record]) =>
        whitelist.has(String(steam64)) && Number(record.expiresAt) > 0
    );
    const total = whitelist.size;
    const timedCount = timedEntries.length;
    const foreverCount = Math.max(0, total - timedCount);
    const expiring = NOTIFY_THRESHOLDS.map((threshold) => {
      const count = timedEntries.filter(([, record]) => {
        const expiresAt = Number(record.expiresAt) || 0;
        return expiresAt > now && expiresAt - now <= threshold;
      }).length;
      return { hours: Math.round(threshold / 3600), count };
    });
    res.json({
      ok: true,
      total,
      timed: timedCount,
      forever: foreverCount,
      expiring,
      links: Object.keys(db.links).length,
      invalidLinks: countInvalidLinks(),
    });
  });

  app.get('/api/logs', async (req, res) => {
    const limit = Math.min(api.maxLogLines, Math.max(1, Number(req.query.limit) || 500));
    try {
      const lines = await readLogTail(limit);
      res.json({ ok: true, lines });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'log_read_failed' });
    }
  });

  app.post('/api/vip/give', async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const roleName = payload.roleName ? String(payload.roleName) : 'VIP';
    if (!VIP_ROLES.has(roleName)) {
      res.status(400).json({ ok: false, error: 'invalid_role' });
      return;
    }
    const target = resolveApiTarget(payload);
    if (target.error) {
      res.status(400).json({ ok: false, error: target.error });
      return;
    }

    let result;
    await enqueueOperation(async () => {
      const now = unixNow();
      const duration = VIP_ROLES.get(roleName);
      const expiresAtValue = duration === null ? 0 : now + duration;
      ensureVip(target.steam64);

      if (duration === null) {
        delete db.vipTimed[target.steam64];
      } else {
        db.vipTimed[target.steam64] = {
          issuedAt: now,
          expiresAt: expiresAtValue,
          roleName,
          source: 'api_givevip',
          reason: 'api',
        };
      }

      addHistory('api_givevip', {
        discordId: target.discordId,
        steam64: target.steam64,
        roleName,
        expiresAt: expiresAtValue,
        note: 'api',
      });

      await persistAndSync();

      let roleAssigned = false;
      let roleAssignReason = null;
      if (target.discordId) {
        const member = await fetchGuildMember(target.discordId);
        try {
          const assignment = await addVipRoleToMember(
            member,
            roleName,
            'VIP via API'
          );
          roleAssigned = assignment.assigned;
          roleAssignReason = assignment.reason || null;
        } catch (err) {
          roleAssignReason = err.message || 'role_assign_failed';
        }
        if (member) {
          const language = resolveUserLanguage(target.discordId, member.guild?.preferredLocale);
          const embed = buildVipEmbed(
            roleName,
            expiresAtValue === 0 ? null : expiresAtValue,
            language
          );
          await sendDm(member, { embeds: [embed] });
        }
      }

      await logAction('api_givevip', {
        serverName: primaryServer.name,
        discordId: target.discordId,
        steam64: target.steam64,
        roleName,
        expiresAt: expiresAtValue,
        note: roleAssignReason || 'api',
      });

      result = {
        ok: true,
        steam64: target.steam64,
        discordId: target.discordId,
        roleName,
        expiresAt: expiresAtValue,
        roleAssigned,
      };
    });

    res.json(result);
  });

  app.post('/api/vip/remove', async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const target = resolveApiTarget(payload);
    if (target.error) {
      res.status(400).json({ ok: false, error: target.error });
      return;
    }

    let result;
    await enqueueOperation(async () => {
      removeVip(target.steam64);
      delete db.vipTimed[target.steam64];

      addHistory('api_removevip', {
        discordId: target.discordId,
        steam64: target.steam64,
        roleName: null,
        expiresAt: 0,
        note: 'api',
      });

      await persistAndSync();

      if (target.discordId) {
        await removeDiscordVipRoles(target.discordId, 'VIP removed via API');
      }

      await logAction('api_removevip', {
        serverName: primaryServer.name,
        discordId: target.discordId,
        steam64: target.steam64,
        roleName: null,
        expiresAt: 0,
        note: 'api',
      });

      result = {
        ok: true,
        steam64: target.steam64,
        discordId: target.discordId,
      };
    });

    res.json(result);
  });

  app.post('/api/vip/set', async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const hasExpiresAt = payload.expiresAt !== undefined && payload.expiresAt !== null && payload.expiresAt !== '';
    const hasDays = payload.days !== undefined && payload.days !== null && payload.days !== '';
    if (!hasExpiresAt && !hasDays) {
      res.status(400).json({ ok: false, error: 'missing_expires' });
      return;
    }

    let days = null;
    let expiresAtOverride = null;

    if (hasExpiresAt) {
      const expiresAtValue = Number(payload.expiresAt);
      if (!Number.isFinite(expiresAtValue) || expiresAtValue < 0) {
        res.status(400).json({ ok: false, error: 'invalid_expires_at' });
        return;
      }
      expiresAtOverride = Math.floor(expiresAtValue);
    } else {
      const daysValue = Number(payload.days);
      if (!Number.isFinite(daysValue) || daysValue < 0) {
        res.status(400).json({ ok: false, error: 'invalid_days' });
        return;
      }
      days = Math.floor(daysValue);
    }

    const roleName = payload.roleName ? String(payload.roleName) : null;
    if (roleName && !VIP_ROLES.has(roleName)) {
      res.status(400).json({ ok: false, error: 'invalid_role' });
      return;
    }

    const target = resolveApiTarget(payload);
    if (target.error) {
      res.status(400).json({ ok: false, error: target.error });
      return;
    }

    let result;
    await enqueueOperation(async () => {
      const now = unixNow();
      let expiresAtValue = 0;
      let isForever = false;

      if (expiresAtOverride !== null) {
        expiresAtValue = expiresAtOverride;
        isForever = expiresAtValue === 0;
      } else {
        isForever = days === 0;
        expiresAtValue = isForever ? 0 : now + days * 86400;
      }

      ensureVip(target.steam64);

      if (isForever) {
        delete db.vipTimed[target.steam64];
      } else {
        const storedRole = roleName || db.vipTimed[target.steam64]?.roleName || 'VIP';
        db.vipTimed[target.steam64] = {
          issuedAt: now,
          expiresAt: expiresAtValue,
          roleName: storedRole,
          source: 'api_setvip',
          reason: 'api',
        };
      }

      addHistory('api_setvip', {
        discordId: target.discordId,
        steam64: target.steam64,
        roleName: roleName || null,
        expiresAt: expiresAtValue,
        note: 'api',
      });

      await persistAndSync();

      if (roleName && target.discordId) {
        const member = await fetchGuildMember(target.discordId);
        try {
          await addVipRoleToMember(member, roleName, 'VIP via API set');
        } catch (err) {
          await logAction('api_setvip_role_fail', {
            serverName: primaryServer.name,
            discordId: target.discordId,
            steam64: target.steam64,
            roleName,
            expiresAt: expiresAtValue,
            note: err.message || 'role_assign_failed',
          });
        }
      }

      await logAction('api_setvip', {
        serverName: primaryServer.name,
        discordId: target.discordId,
        steam64: target.steam64,
        roleName: roleName || null,
        expiresAt: expiresAtValue,
        note: 'api',
      });

      result = {
        ok: true,
        steam64: target.steam64,
        discordId: target.discordId,
        expiresAt: expiresAtValue,
      };
    });

    res.json(result);
  });

  app.use((err, req, res, next) => {
    console.error('API error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  });

  app.listen(api.port, api.host, () => {
    console.log(`[startup] API listening on http://${api.host}:${api.port}`);
  });
}

async function getAuditChannel() {
  if (!config.auditChannelId || !client.isReady()) {
    return null;
  }
  if (auditChannel) {
    return auditChannel;
  }
  try {
    const channel = await client.channels.fetch(config.auditChannelId);
    if (!channel || !channel.isTextBased()) {
      return null;
    }
    auditChannel = channel;
    return auditChannel;
  } catch (err) {
    console.error('Failed to fetch audit channel:', err);
    return null;
  }
}

async function logAction(action, details) {
  const safeValue = (value, fallback = '-') => {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    return String(value).replace(/[\r\n]+/g, ' ').trim();
  };
  const line = `${formatLogTimestamp()} [${action}] server=${safeValue(
    details.serverName
  )} discordId=${safeValue(details.discordId)} steam64=${safeValue(
    details.steam64
  )} role="${safeValue(details.roleName, '')}" expiresAt=${safeValue(
    details.expiresAt,
    '-'
  )} note=${safeValue(details.note, '')}\n`;
  try {
    await fs.appendFile(LOG_PATH, line, 'utf8');
  } catch (err) {
    console.error('Failed to write log file:', err);
  }

  if (!config.auditChannelId || !AUDIT_ACTIONS.has(action)) {
    return;
  }
  try {
    const channel = await getAuditChannel();
    if (!channel) {
      return;
    }
    const embed = buildAuditEmbed(action, details);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

function addHistory(action, details) {
  if (!Array.isArray(db.history)) {
    return;
  }
  db.history.push({
    ts: unixNow(),
    action,
    discordId: details.discordId || null,
    steam64: details.steam64 || null,
    roleName: details.roleName || null,
    expiresAt: details.expiresAt !== undefined ? details.expiresAt : null,
    note: details.note || null,
  });
}

function ensureVip(steam64) {
  const key = String(steam64);
  if (!db.whiteList.vip.includes(key)) {
    db.whiteList.vip.push(key);
  }
}

function removeVip(steam64) {
  const key = String(steam64);
  db.whiteList.vip = db.whiteList.vip.filter((entry) => entry !== key);
}

function ensureNewera(steam64) {
  const key = String(steam64);
  if (!db.whiteList || typeof db.whiteList !== 'object') {
    db.whiteList = { vip: [] };
  }
  if (!Array.isArray(db.whiteList.newera)) {
    db.whiteList.newera = [];
  }
  if (!db.whiteList.newera.includes(key)) {
    db.whiteList.newera.push(key);
  }
}

function removeNewera(steam64) {
  const key = String(steam64);
  if (!db.whiteList || typeof db.whiteList !== 'object') {
    db.whiteList = { vip: [] };
    return;
  }
  if (!Array.isArray(db.whiteList.newera)) {
    db.whiteList.newera = [];
    return;
  }
  db.whiteList.newera = db.whiteList.newera.filter((entry) => entry !== key);
}

function findDiscordIdBySteam(steam64) {
  for (const [discordId, linkedSteam] of Object.entries(db.links)) {
    if (String(linkedSteam) === String(steam64)) {
      return discordId;
    }
  }
  return null;
}

async function sendDm(member, payload) {
  const message = typeof payload === 'string' ? { content: payload } : payload;
  try {
    await member.send(message);
  } catch (err) {
    await logAction('dm_fail', {
      discordId: member.id,
      steam64: db.links[member.id] || null,
      roleName: null,
      expiresAt: null,
      note: err.message || 'dm_failed',
    });
  }
}

async function sendDmToUserId(discordId, payload) {
  const message = typeof payload === 'string' ? { content: payload } : payload;
  try {
    const user = await client.users.fetch(discordId);
    await user.send(message);
  } catch (err) {
    await logAction('dm_fail', {
      discordId,
      steam64: db.links[discordId] || null,
      roleName: null,
      expiresAt: null,
      note: err.message || 'dm_failed',
    });
  }
}

function buildVipEmbed(roleName, expiresAt, language) {
  const messages = getMessagesForLanguage(language);
  const description = expiresAt === null
    ? formatMessage(messages.dmVipActiveForever, {
        tariff: formatTariffDisplay(roleName, language),
      })
    : formatMessage(messages.dmVipActiveTimed, {
        tariff: formatTariffDisplay(roleName, language),
        expiresAt,
      });
  return new EmbedBuilder()
    .setDescription(description)
    .setColor(0xffffff);
}

function buildExpiryWarningEmbed(roleName, expiresAt, language) {
  const messages = getMessagesForLanguage(language);
  return new EmbedBuilder()
    .setDescription(
      formatMessage(messages.dmExpiryWarning, {
        tariff: formatTariffDisplay(roleName, language),
        expiresAt,
      })
    )
    .setColor(0xffa940);
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

async function handleVipRoleAdded(member, roleName) {
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
  const duration = VIP_ROLES.get(roleName);
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

async function handleVipRoleRemoved(member, roleName) {
  const discordId = member.id;
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

  await logAction('manual_remove', {
    discordId,
    steam64: steamKey,
    roleName,
    expiresAt: 0,
    note: 'manual',
  });
}

async function handleNeweraRoleAdded(member) {
  const discordId = member.id;
  const language = resolveUserLanguage(discordId, member.guild?.preferredLocale);
  const steam64 = getLinkedSteamId(discordId);
  if (!steam64) {
    await logAction('newera_missing_link', {
      discordId,
      steam64: null,
      roleName: NEWERA_ROLE_NAME,
      expiresAt: null,
      note: 'role_add_no_link',
    });
    await sendDm(member, { embeds: [buildMissingLinkEmbed(NEWERA_ROLE_NAME, language)] });
    return;
  }

  const steamKey = String(steam64);
  ensureNewera(steamKey);

  addHistory('newera_add', {
    discordId,
    steam64: steamKey,
    roleName: NEWERA_ROLE_NAME,
    expiresAt: 0,
    note: 'auto',
  });

  await persistAndSync();

  await sendDm(member, { embeds: [buildRoleActivatedEmbed(NEWERA_ROLE_NAME, language)] });

  await logAction('newera_add', {
    discordId,
    steam64: steamKey,
    roleName: NEWERA_ROLE_NAME,
    expiresAt: 0,
    note: 'auto',
  });
}

async function handleNeweraRoleRemoved(member) {
  const discordId = member.id;
  const steam64 = getLinkedSteamId(discordId);
  if (!steam64) {
    await logAction('newera_missing_link', {
      discordId,
      steam64: null,
      roleName: NEWERA_ROLE_NAME,
      expiresAt: null,
      note: 'role_remove_no_link',
    });
    return;
  }

  const steamKey = String(steam64);
  removeNewera(steamKey);

  addHistory('newera_remove', {
    discordId,
    steam64: steamKey,
    roleName: NEWERA_ROLE_NAME,
    expiresAt: 0,
    note: 'manual',
  });

  await persistAndSync();

  await logAction('newera_remove', {
    discordId,
    steam64: steamKey,
    roleName: NEWERA_ROLE_NAME,
    expiresAt: 0,
    note: 'manual',
  });
}

async function removeDiscordVipRoles(discordId, note) {
  if (!primaryGuild) {
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

  const rolesToRemove = member.roles.cache.filter((role) => VIP_ROLE_NAMES.has(role.name));
  if (!rolesToRemove.size) {
    return;
  }
  for (const role of rolesToRemove.values()) {
    markRoleSkip(discordId, role.name);
  }

  try {
    await member.roles.remove(
      rolesToRemove.map((role) => role.id),
      note
    );
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
    const language = resolveUserLanguage(discordId, primaryGuild?.preferredLocale);
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
      serverName: primaryServer.name,
      discordId: null,
      steam64,
      roleName: record.roleName || null,
      expiresAt: record.expiresAt || null,
      note: `threshold=${thresholdSeconds}`,
    });
    return;
  }

  const language = resolveUserLanguage(discordId, primaryGuild?.preferredLocale);
  await sendDmToUserId(discordId, {
    embeds: [buildExpiryWarningEmbed(record.roleName || 'VIP', record.expiresAt, language)],
  });

  await logAction('expire_warn', {
    serverName: primaryServer.name,
    discordId,
    steam64,
    roleName: record.roleName || null,
    expiresAt: record.expiresAt || null,
    note: `threshold=${thresholdSeconds}`,
  });
}

async function runExpirationCheck() {
  if (!db) {
    return;
  }
  const now = unixNow();
  const expirations = [];
  let notifyDirty = false;

  for (const [steam64, record] of Object.entries(db.vipTimed)) {
    const expiresAt = Number(record.expiresAt) || 0;
    if (expiresAt > 0 && now >= expiresAt) {
      expirations.push([steam64, record]);
      continue;
    }
    if (!expiresAt || !NOTIFY_THRESHOLDS.length) {
      continue;
    }

    const remaining = expiresAt - now;
    if (remaining <= 0) {
      continue;
    }

    const notified = Array.isArray(record.notified) ? record.notified.map(Number) : [];
    for (const threshold of NOTIFY_THRESHOLDS) {
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

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: [
      STATUS_COMMAND.toJSON(),
      STEAMID_COMMAND.toJSON(),
      LINK_COMMAND.toJSON(),
      UNLINK_COMMAND.toJSON(),
      WHOIS_COMMAND.toJSON(),
      VIPLIST_COMMAND.toJSON(),
      STATS_COMMAND.toJSON(),
      SETVIP_COMMAND.toJSON(),
      REMOVEVIP_COMMAND.toJSON(),
      GIVEVIP_COMMAND.toJSON(),
    ],
  });
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await loadPrimaryDb();
    await registerCommands();
    primaryGuild = await client.guilds.fetch(config.guildId);
    startApiServer();
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }

  startHistoryFeed(client, config);

  await enqueueOperation(runExpirationCheck);
  setInterval(() => enqueueOperation(runExpirationCheck), CHECK_INTERVAL_MS);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  if (!db) {
    return;
  }
  const oldRoles = new Set(oldMember.roles.cache.map((role) => role.name));
  const newRoles = new Set(newMember.roles.cache.map((role) => role.name));

  const addedVipRoles = [...newRoles].filter(
    (roleName) => VIP_ROLE_NAMES.has(roleName) && !oldRoles.has(roleName)
  );
  const removedVipRoles = [...oldRoles].filter(
    (roleName) => VIP_ROLE_NAMES.has(roleName) && !newRoles.has(roleName)
  );
  const filteredAddedVipRoles = addedVipRoles.filter(
    (roleName) => !consumeRoleSkip(newMember.id, roleName)
  );
  const filteredRemovedVipRoles = removedVipRoles.filter(
    (roleName) => !consumeRoleSkip(newMember.id, roleName)
  );

  if (filteredAddedVipRoles.length > 0) {
    const roleName = pickBestRole(filteredAddedVipRoles);
    enqueueOperation(() => handleVipRoleAdded(newMember, roleName));
  }

  const hadNeweraBefore = oldRoles.has(NEWERA_ROLE_NAME);
  const hasNeweraAfter = newRoles.has(NEWERA_ROLE_NAME);
  if (!hadNeweraBefore && hasNeweraAfter) {
    enqueueOperation(() => handleNeweraRoleAdded(newMember));
  }
  if (hadNeweraBefore && !hasNeweraAfter) {
    enqueueOperation(() => handleNeweraRoleRemoved(newMember));
  }

  const hasVipAfter = [...newRoles].some((roleName) => VIP_ROLE_NAMES.has(roleName));
  if (filteredRemovedVipRoles.length > 0 && !hasVipAfter) {
    const roleName = pickBestRole(filteredRemovedVipRoles) || null;
    enqueueOperation(() => handleVipRoleRemoved(newMember, roleName));
  }
});

client.on('interactionCreate', async (interaction) => {
  let messages = getMessagesForLanguage(DEFAULT_LANGUAGE);
  try {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    const interactionLanguage = getInteractionLanguage(interaction);
    messages = getMessagesForLanguage(interactionLanguage);
    if (!db) {
      await interaction.reply({
        content: messages.statusLoading,
        ephemeral: true,
      });
      return;
    }
    rememberUserLanguage(interaction.user.id, interactionLanguage);

    if (interaction.commandName === 'status') {
      const discordId = interaction.user.id;
      const steam64 = getLinkedSteamId(discordId);
      if (!steam64) {
        await interaction.reply({
          content: messages.statusNoLink,
          ephemeral: true,
        });
        return;
      }

      const steamKey = String(steam64);
      if (!db.whiteList.vip.includes(steamKey)) {
        await interaction.reply({
          content: messages.statusInactive,
          ephemeral: true,
        });
        return;
      }

      const timed = db.vipTimed[steamKey];
      if (timed && Number(timed.expiresAt) > 0) {
        const expiresAt = Number(timed.expiresAt);
        await interaction.reply({
          content: formatMessage(messages.statusActiveUntil, { expiresAt }),
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: messages.statusActiveForever,
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'steamid') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }

      const input = normalizeSteamId64(interaction.options.getString('steamid', true));
      if (!isValidSteamId64(input)) {
        await interaction.reply({
          content: messages.invalidSteamId,
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      await enqueueOperation(async () => {
        const discordId = interaction.user.id;
        const existingLink = getLinkedSteamId(discordId);
        const existingOwner = findDiscordIdBySteam(input);
        const canOverride = hasManageRoles(interaction);

        if (existingLink && existingLink !== input && !canOverride) {
          await interaction.editReply({
            content: messages.steamidAlreadyLinked,
          });
          await logAction('link_update_denied', {
            serverName: primaryServer.name,
            discordId,
            steam64: input,
            roleName: null,
            expiresAt: null,
            note: 'existing_link',
          });
          return;
        }

        if (existingOwner && existingOwner !== discordId && !canOverride) {
          await interaction.editReply({
            content: messages.steamidOwned,
          });
          await logAction('link_update_denied', {
            serverName: primaryServer.name,
            discordId,
            steam64: input,
            roleName: null,
            expiresAt: null,
            note: `owned_by=${existingOwner}`,
          });
          return;
        }

        if (existingOwner && existingOwner !== discordId) {
          delete db.links[existingOwner];
          invalidLinks.delete(existingOwner);
        }

        db.links[discordId] = input;
        invalidLinks.delete(discordId);
        addHistory('link_set', {
          discordId,
          steam64: input,
          roleName: null,
          expiresAt: null,
          note: canOverride ? 'admin' : 'self',
        });
        await savePrimaryDb();

        await interaction.editReply({
          content: messages.steamidSaved,
        });

        await logAction('link_set', {
          serverName: primaryServer.name,
          discordId,
          steam64: input,
          roleName: null,
          expiresAt: null,
          note: canOverride ? 'admin' : 'self',
        });
      });
      return;
    }

    if (interaction.commandName === 'link') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermLink,
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      const input = normalizeSteamId64(interaction.options.getString('steamid', true));
      if (!isValidSteamId64(input)) {
        await interaction.reply({
          content: messages.invalidSteamId,
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      await enqueueOperation(async () => {
        const existingOwner = findDiscordIdBySteam(input);
        if (existingOwner && existingOwner !== targetUser.id) {
          delete db.links[existingOwner];
          invalidLinks.delete(existingOwner);
        }

        const previous = db.links[targetUser.id];
        db.links[targetUser.id] = input;
        invalidLinks.delete(targetUser.id);
        addHistory('link_set', {
          discordId: targetUser.id,
          steam64: input,
          roleName: null,
          expiresAt: null,
          note: `by=${interaction.user.id}`,
        });
        await savePrimaryDb();

        await interaction.editReply({
          content: previous && previous !== input ? messages.linkUpdated : messages.linkSaved,
        });

        await logAction('link_set', {
          serverName: primaryServer.name,
          discordId: targetUser.id,
          steam64: input,
          roleName: null,
          expiresAt: null,
          note: `by=${interaction.user.id}`,
        });
      });
      return;
    }

    if (interaction.commandName === 'unlink') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermLink,
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      await interaction.deferReply({ ephemeral: true });

      await enqueueOperation(async () => {
        const steam64 = db.links[targetUser.id];
        if (!steam64) {
          await interaction.editReply({
            content: messages.linkNotFound,
          });
          return;
        }

        delete db.links[targetUser.id];
        invalidLinks.delete(targetUser.id);
        addHistory('link_remove', {
          discordId: targetUser.id,
          steam64,
          roleName: null,
          expiresAt: null,
          note: `by=${interaction.user.id}`,
        });
        await savePrimaryDb();

        await interaction.editReply({
          content: messages.linkRemoved,
        });

        await logAction('link_remove', {
          serverName: primaryServer.name,
          discordId: targetUser.id,
          steam64,
          roleName: null,
          expiresAt: null,
          note: `by=${interaction.user.id}`,
        });
      });
      return;
    }

    if (interaction.commandName === 'whois') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermWhois,
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      const steam64 = getLinkedSteamId(targetUser.id);
      if (!steam64) {
        await interaction.reply({
          content: messages.whoisNoLink,
          ephemeral: true,
        });
        return;
      }

      const steamKey = String(steam64);
      const isActive = db.whiteList.vip.includes(steamKey);
      if (!isActive) {
        await interaction.reply({
          content: formatMessage(messages.whoisInactive, {
            discordId: targetUser.id,
            steam64: steamKey,
          }),
          ephemeral: true,
        });
        return;
      } else {
        const timed = db.vipTimed[steamKey];
        if (timed && Number(timed.expiresAt) > 0) {
          await interaction.reply({
            content: formatMessage(messages.whoisActiveTimed, {
              discordId: targetUser.id,
              steam64: steamKey,
              tariff: formatTariffDisplay(timed.roleName || 'VIP', interactionLanguage),
              expiresAt: Number(timed.expiresAt),
            }),
            ephemeral: true,
          });
          return;
        } else {
          await interaction.reply({
            content: formatMessage(messages.whoisActiveForever, {
              discordId: targetUser.id,
              steam64: steamKey,
            }),
            ephemeral: true,
          });
          return;
        }
      }
    }

    if (interaction.commandName === 'viplist') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermViplist,
          ephemeral: true,
        });
        return;
      }

      const page = interaction.options.getInteger('page') || 1;
      const list = [...new Set(db.whiteList.vip.map(String))].sort();
      if (list.length === 0) {
        await interaction.reply({
          content: messages.viplistEmpty,
          ephemeral: true,
        });
        return;
      }

      const totalPages = Math.max(1, Math.ceil(list.length / VIPLIST_PAGE_SIZE));
      if (page > totalPages) {
        await interaction.reply({
          content: formatMessage(messages.viplistPageMissing, { page, totalPages }),
          ephemeral: true,
        });
        return;
      }

      const start = (page - 1) * VIPLIST_PAGE_SIZE;
      const slice = list.slice(start, start + VIPLIST_PAGE_SIZE);
      const lines = slice.map((steam, index) => {
        const discordId = findDiscordIdBySteam(steam);
        return `${start + index + 1}. ${steam}${discordId ? ` Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚С” <@${discordId}>` : ''}`;
      });

      await interaction.reply({
        content: formatMessage(messages.viplistPage, {
          total: list.length,
          page,
          totalPages,
          lines: lines.join('\n'),
        }),
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'stats') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermViplist,
          ephemeral: true,
        });
        return;
      }

      const now = unixNow();
      const whitelist = new Set(db.whiteList.vip.map(String));
      const timedEntries = Object.entries(db.vipTimed).filter(
        ([steam64, record]) =>
          whitelist.has(String(steam64)) && Number(record.expiresAt) > 0
      );
      const total = whitelist.size;
      const timedCount = timedEntries.length;
      const foreverCount = Math.max(0, total - timedCount);

      const lines = [
        messages.statsHeader,
        formatMessage(messages.statsTotals, {
          total,
          timed: timedCount,
          forever: foreverCount,
        }),
      ];

      for (const threshold of NOTIFY_THRESHOLDS) {
        const count = timedEntries.filter(([, record]) => {
          const expiresAt = Number(record.expiresAt) || 0;
          return expiresAt > now && expiresAt - now <= threshold;
        }).length;
        const hours = Math.round(threshold / 3600);
        lines.push(
          formatMessage(messages.statsExpiring, {
            hours,
            count,
          })
        );
      }

      lines.push(
        formatMessage(messages.statsLinks, {
          links: Object.keys(db.links).length,
          invalid: countInvalidLinks(),
        })
      );

      await interaction.reply({
        content: lines.join('\n'),
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === 'setvip') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermGiveVip,
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      const daysInput = interaction.options.getInteger('days', true);
      const roleName = interaction.options.getString('role', false);

      if (daysInput < 0) {
        await interaction.reply({
          content: messages.setVipInvalidTime,
          ephemeral: true,
        });
        return;
      }

      const now = unixNow();
      const isForever = daysInput === 0;
      const expiresAtValue = isForever ? 0 : now + daysInput * 86400;

      await interaction.deferReply({ ephemeral: true });

      await enqueueOperation(async () => {
        let member = interaction.options.getMember('user');
        if (!member) {
          try {
            member = await interaction.guild.members.fetch(targetUser.id);
          } catch (err) {
            await interaction.editReply({
              content: messages.giveVipUserNotFound,
            });
            return;
          }
        }

        const steam64 = getLinkedSteamId(member.id);
        if (!steam64) {
          await interaction.editReply({
            content: messages.giveVipNoLink,
          });
          return;
        }

        if (roleName) {
          const role = interaction.guild.roles.cache.find((entry) => entry.name === roleName);
          if (!role) {
            await interaction.editReply({
              content: formatMessage(messages.giveVipRoleNotFound, { roleName }),
            });
            return;
          }
          if (!role.editable) {
            await interaction.editReply({
              content: messages.giveVipRoleNotEditable,
            });
            return;
          }
          if (!member.roles.cache.has(role.id)) {
            try {
              await member.roles.add(role, `VIP via /setvip by ${interaction.user.tag}`);
            } catch (err) {
              await interaction.editReply({
                content: messages.giveVipFailed,
              });
              await logAction('command_setvip_fail', {
                serverName: primaryServer.name,
                discordId: member.id,
                steam64,
                roleName,
                expiresAt: expiresAtValue,
                note: err.message || 'role_add_failed',
              });
              return;
            }
          }
        }

        const steamKey = String(steam64);
        ensureVip(steamKey);

        if (isForever) {
          delete db.vipTimed[steamKey];
        } else {
          const storedRole = roleName || db.vipTimed[steamKey]?.roleName || 'VIP';
          db.vipTimed[steamKey] = {
            issuedAt: now,
            expiresAt: expiresAtValue,
            roleName: storedRole,
            source: 'command_setvip',
            reason: `by=${interaction.user.id}`,
          };
        }

        addHistory('manual_set', {
          discordId: member.id,
          steam64: steamKey,
          roleName: roleName || null,
          expiresAt: expiresAtValue,
          note: `by=${interaction.user.id}`,
        });

        await persistAndSync();

        await interaction.editReply({
          content: isForever
            ? messages.setVipDoneForever
            : formatMessage(messages.setVipDoneTimed, { expiresAt: expiresAtValue }),
        });

        await logAction('command_setvip', {
          serverName: primaryServer.name,
          discordId: member.id,
          steam64: steamKey,
          roleName: roleName || null,
          expiresAt: expiresAtValue,
          note: `by=${interaction.user.id}`,
        });
      });
      return;
    }

    if (interaction.commandName === 'removevip') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermRemoveVip,
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      await interaction.deferReply({ ephemeral: true });

      await enqueueOperation(async () => {
        const steam64 = getLinkedSteamId(targetUser.id);
        if (!steam64) {
          await removeDiscordVipRoles(targetUser.id, `VIP removed by ${interaction.user.tag}`);
          await interaction.editReply({
            content: messages.removeVipNoLink,
          });
          await logAction('command_removevip_missing_link', {
            serverName: primaryServer.name,
            discordId: targetUser.id,
            steam64: null,
            roleName: null,
            expiresAt: null,
            note: `by=${interaction.user.id}`,
          });
          return;
        }

        const steamKey = String(steam64);
        removeVip(steamKey);
        delete db.vipTimed[steamKey];
        addHistory('manual_remove', {
          discordId: targetUser.id,
          steam64: steamKey,
          roleName: null,
          expiresAt: null,
          note: `by=${interaction.user.id}`,
        });
        await persistAndSync();

        await removeDiscordVipRoles(targetUser.id, `VIP removed by ${interaction.user.tag}`);

        await interaction.editReply({
          content: messages.removeVipDone,
        });

        await logAction('command_removevip', {
          serverName: primaryServer.name,
          discordId: targetUser.id,
          steam64: steamKey,
          roleName: null,
          expiresAt: 0,
          note: `by=${interaction.user.id}`,
        });
      });
      return;
    }

    if (interaction.commandName === 'givevip') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!hasManageRoles(interaction)) {
        await interaction.reply({
          content: messages.noPermGiveVip,
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user', true);
      const roleName = interaction.options.getString('tariff', true);
      let member = interaction.options.getMember('user');
      if (!member) {
        try {
          member = await interaction.guild.members.fetch(targetUser.id);
        } catch (err) {
          await interaction.editReply({
            content: messages.giveVipUserNotFound,
          });
          return;
        }
      }

      const steam64 = getLinkedSteamId(member.id);
      if (!steam64) {
        await interaction.editReply({
          content: messages.giveVipNoLink,
        });
        return;
      }

      const role = interaction.guild.roles.cache.find((entry) => entry.name === roleName);
      if (!role) {
        await interaction.editReply({
          content: formatMessage(messages.giveVipRoleNotFound, { roleName }),
        });
        return;
      }
      if (!role.editable) {
        await interaction.editReply({
          content: messages.giveVipRoleNotEditable,
        });
        return;
      }

      if (member.roles.cache.has(role.id)) {
        await interaction.editReply({
          content: messages.giveVipAlreadyHas,
        });
        return;
      }

      try {
        await member.roles.add(role, `VIP via /givevip by ${interaction.user.tag}`);
      } catch (err) {
        await interaction.editReply({
          content: messages.giveVipFailed,
        });
        await logAction('command_givevip_fail', {
          serverName: primaryServer.name,
          discordId: member.id,
          steam64,
          roleName,
          expiresAt: null,
          note: err.message || 'role_add_failed',
        });
        return;
      }

      await interaction.editReply({
        content: messages.giveVipDone,
      });

      await logAction('command_givevip', {
        serverName: primaryServer.name,
        discordId: member.id,
        steam64,
        roleName,
        expiresAt: null,
        note: `by=${interaction.user.id}`,
      });
    }
  } catch (err) {
    console.error('Interaction failed:', err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: messages.genericError });
      } else {
        await interaction.reply({
          content: messages.genericError,
          ephemeral: true,
        });
      }
    } catch (replyErr) {
      console.error('Failed to reply after error:', replyErr);
    }
  }
});

client.login(config.token);














