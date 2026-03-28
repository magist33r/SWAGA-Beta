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
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const StatsCard = require('../stats-card/stats-card');

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
const GIVEAWAY_VIP_ROLE_NAME = 'VIP (Giveaway)';
const GIVEAWAY_PRIZE_OPTIONS = [
  { label: 'VIP 24 Hours', value: 'vip_24h', durationSeconds: 24 * 3600 },
  { label: 'VIP 7 Days', value: 'vip_7d', durationSeconds: 7 * 24 * 3600 },
  { label: 'VIP 14 Days', value: 'vip_14d', durationSeconds: 14 * 24 * 3600 },
  { label: 'VIP Monthly', value: 'vip_monthly', durationSeconds: 30 * 24 * 3600 },
  { label: 'VIP', value: 'vip_forever', durationSeconds: null },
];
const MEDIA_ROLE_NAME = 'media';
const MEMBER_ROLE_NAMES = [':white_check_mark:', '✅'];
const EVERYONE_TIMEOUT_SECONDS = 3600;
const EVERYONE_DELETE_HOURS = 1;
const TICKET_IDLE_CLOSE_SECONDS = 300;
const TICKET_IDLE_CHECK_INTERVAL_MS = 60000;

const MESSAGES_RU = {
  dmVipActiveForever: '👑 **VIP активирован навсегда** — {tariff} ⭐\n\nДобро пожаловать в элиту SWAGA. Тебе доступны эксклюзивные скины, уникальные пушки и приоритетный вход — на обоих серверах.\n\n🎮 Заходи и доминируй.',
  dmVipActiveTimed: '👑 **VIP активирован** — {tariff}\n⏳ Действует до: <t:{expiresAt}:F>\n\nДобро пожаловать в элиту SWAGA. Тебе доступны эксклюзивные скины, уникальные пушки и приоритетный вход — на обоих серверах.\n\n🎮 Заходи и доминируй.',
  dmRoleActivated: '✅ Роль «{roleName}» активирована.',
  dmMissingLink:
    '👑 **VIP получен!**\n\nЧтобы активировать привилегии на сервере, привяжи свой Steam аккаунт:\n\n1️⃣ Напиши команду `/steamid` и укажи свой SteamID64\n2️⃣ Или создай тикет и мы поможем\n\n-# Не знаешь свой SteamID64? Найди его на [steamid.io](https://steamid.io)',
  dmExpiryWarningEarly: '👀 **{tariff} истекает через 3 дня**\n📅 Окончание: <t:{expiresAt}:F>\n\nЕщё есть время продлить спокойно — без спешки:\n💳 **399₽**/14 дней • **799₽**/месяц • **1799₽**/навсегда\n\n👉 **[Продлить VIP](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  dmExpiryWarning: '⚠️ **{tariff} истекает через 24 часа**\n📅 Окончание: <t:{expiresAt}:F>\n\nТы потеряешь доступ к эксклюзивным скинам, уникальным пушкам и приоритетному входу.\n\n🔥 Продли прямо сейчас:\n💳 **399₽**/14 дней • **799₽**/месяц • **1799₽**/навсегда\n\n👉 **[Продлить VIP](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  dmVipExpired:
    '😔 **VIP закончился** — {tariff}\n\nТвои эксклюзивные скины и пушки недоступны. Другие игроки с VIP выглядят лучше тебя прямо сейчас.\n\n⚡ Продли в течение **24 часов** — получи скидку:\n💳 **399₽**/14 дней • ~~799₽~~ **699₽**/месяц • ~~1799₽~~ **1599₽**/навсегда\n\n👉 **[Вернуть VIP со скидкой](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  dmVipRemoved: '❌ **VIP снят**\nПричина: {reason}\n\n👉 Если считаешь это ошибкой — **[создай тикет](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  vipRemoveReasonRoleRemoved: 'VIP-роль снята вручную.',
  vipRemoveReasonAdmin: 'Снят администратором {admin}.',
  vipRemoveReasonApi: 'Снят через API.',
  vipRemoveReasonLeftGuild: 'Вы вышли с Discord-сервера.',
  vipRemoveReasonStartupCheck:
    'Аккаунт не найден на сервере при проверке после запуска бота.',
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
  profileNoLink: '❗ SteamID64 не привязан. Используйте /steamid.',
  profileInactive: '❌ VIP не активен.',
  profileActiveUntil: '✅ Активен до <t:{expiresAt}:F>.',
  profileActiveForever: '✅ Активен навсегда.',
  profileTitle: '👤 Профиль игрока',
  profileFieldSteam: 'SteamID64',
  profileFieldVip: 'VIP статус',
  profileFieldTariff: 'Тариф',
  profileFieldHistory: 'История активаций',
  profileHistoryLine: '{tariff} - <t:{issuedAt}:d>',
  profileHistoryEmpty: 'Нет данных.',
  serverinfoTitle: '📊 Информация о серверах',
  serverinfoFieldVip: 'VIP игроков',
  serverinfoFieldLinks: 'Привязок',
  serverinfoFieldExpiring: 'Истекают за 24ч',
  serverinfoFieldServers: 'Серверы',
  everyoneTimeout:
    '🔇 Вы получили тайм-аут на 1 час за использование @everyone без прав.',
};

const MESSAGES_EN = {
  dmVipActiveForever: '👑 **VIP activated forever** — {tariff} ⭐\n\nWelcome to the SWAGA elite. You now have exclusive skins, unique weapons and priority access — on both servers.\n\n🎮 Get in and dominate.',
  dmVipActiveTimed: '👑 **VIP activated** — {tariff}\n⏳ Active until: <t:{expiresAt}:F>\n\nWelcome to the SWAGA elite. You now have exclusive skins, unique weapons and priority access — on both servers.\n\n🎮 Get in and dominate.',
  dmRoleActivated: '✅ Role "{roleName}" activated.',
  dmMissingLink:
    '👑 **VIP received!**\n\nTo activate your perks on the server, link your Steam account:\n\n1️⃣ Use `/steamid` command with your SteamID64\n2️⃣ Or open a ticket and we\'ll help\n\n-# Don\'t know your SteamID64? Find it at [steamid.io](https://steamid.io)',
  dmExpiryWarningEarly: '👀 **{tariff} expires in 3 days**\n📅 Ends: <t:{expiresAt}:F>\n\nStill time to renew without rushing:\n💳 **$4.99**/14 days • **$10.50**/month • **$23.50**/lifetime\n\n👉 **[Renew VIP](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  dmExpiryWarning: '⚠️ **{tariff} expires in 24 hours**\n📅 Ends: <t:{expiresAt}:F>\n\nYou will lose access to exclusive skins, unique weapons and priority server access.\n\n🔥 Renew right now:\n💳 **$4.99**/14 days • **$10.50**/month • **$23.50**/lifetime\n\n👉 **[Renew VIP](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  dmVipExpired:
    '😔 **VIP expired** — {tariff}\n\nYour exclusive skins and weapons are gone. Other VIP players are outclassing you right now.\n\n⚡ Renew within **24 hours** and get a discount:\n💳 **$4.99**/14 days • ~~$10.50~~ **$8.99**/month • ~~$23.50~~ **$19.99**/lifetime\n\n👉 **[Get VIP back at a discount](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  dmVipRemoved: '❌ **VIP removed**\nReason: {reason}\n\n👉 If you think this is a mistake — **[open a ticket](<https://discord.com/channels/1348440636885438634/1350468455157203058>)**',
  vipRemoveReasonRoleRemoved: 'VIP role was removed manually.',
  vipRemoveReasonAdmin: 'Removed by administrator {admin}.',
  vipRemoveReasonApi: 'Removed via API.',
  vipRemoveReasonLeftGuild: 'You left the Discord server.',
  vipRemoveReasonStartupCheck:
    'Your account was not found on the server during startup check.',
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
  profileNoLink: '❗ SteamID64 not linked. Use /steamid.',
  profileInactive: '❌ VIP is not active.',
  profileActiveUntil: '✅ Active until <t:{expiresAt}:F>.',
  profileActiveForever: '✅ Active forever.',
  profileTitle: '👤 Player profile',
  profileFieldSteam: 'SteamID64',
  profileFieldVip: 'VIP status',
  profileFieldTariff: 'Tariff',
  profileFieldHistory: 'Activation history',
  profileHistoryLine: '{tariff} - <t:{issuedAt}:d>',
  profileHistoryEmpty: 'No data.',
  serverinfoTitle: '📊 Server information',
  serverinfoFieldVip: 'VIP players',
  serverinfoFieldLinks: 'Linked accounts',
  serverinfoFieldExpiring: 'Expiring in 24h',
  serverinfoFieldServers: 'Servers',
  everyoneTimeout:
    '🔇 You have been timed out for 1 hour for using @everyone without permission.',
};

const TARIFF_LABELS_RU = {
  'VIP Test': 'VIP (1 час)',
  'VIP 14 Days': 'VIP (14 дней)',
  'VIP Monthly': 'VIP (30 дней)',
  'VIP (Giveaway)': 'VIP (розыгрыш)',
  VIP: 'VIP (навсегда)',
};

const TARIFF_LABELS_EN = {
  'VIP Test': 'VIP (1 hour)',
  'VIP 14 Days': 'VIP (14 days)',
  'VIP Monthly': 'VIP (30 days)',
  'VIP (Giveaway)': 'VIP (giveaway)',
  VIP: 'VIP (forever)',
};

const AUDIT_LABELS_RU = {
  role_add: 'VIP выдан',
  manual_remove: 'VIP снят',
  expire_remove: 'VIP истек',
  expire_warn: 'Предупреждение об истечении',
  link_set: 'Привязка сохранена',
  link_remove: 'Привязка удалена',
  media_add: 'Media выдан',
  media_remove: 'Media снят',
  api_givevip: 'API: выдача VIP',
  api_removevip: 'API: снятие VIP',
  api_setvip: 'API: установка срока VIP',
  command_givevip: 'Команда: выдача VIP',
  command_removevip: 'Команда: снятие VIP',
  command_setvip: 'Команда: установка срока VIP',
  everyone_timeout: 'Анти-@everyone: тайм-аут',
  ticket_open: 'Тикет открыт',
  ticket_close: 'Тикет закрыт',
  ticket_panel: 'Панель тикетов размещена',
  ticket_delete: 'Тикет удален',
};

const AUDIT_LABELS_EN = {
  role_add: 'VIP granted',
  manual_remove: 'VIP removed',
  expire_remove: 'VIP expired',
  expire_warn: 'Expiration warning',
  link_set: 'Link set',
  link_remove: 'Link removed',
  media_add: 'Media granted',
  media_remove: 'Media removed',
  api_givevip: 'API: give VIP',
  api_removevip: 'API: remove VIP',
  api_setvip: 'API: set VIP expiration',
  command_givevip: 'Command: give VIP',
  command_removevip: 'Command: remove VIP',
  command_setvip: 'Command: set VIP expiration',
  everyone_timeout: 'Anti-@everyone: timeout',
  ticket_open: 'Ticket opened',
  ticket_close: 'Ticket closed',
  ticket_panel: 'Ticket panel posted',
  ticket_delete: 'Ticket deleted',
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
  .setDMPermission(true);

const STEAMID_COMMAND = new SlashCommandBuilder()
  .setName('steamid')
  .setDescription('Link SteamID64')
  .setDMPermission(true)
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
  .setName('vipstats')
  .setDescription('VIP stats')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

const PLAYERSTATS_COMMAND = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show player statistics card by SteamID64')
  .setDMPermission(false)
  .addStringOption((option) =>
    option
      .setName('steamid')
      .setDescription('SteamID64 (17 digits)')
      .setRequired(true)
  );

function configurePlayerStatsServerOption(commandBuilder, leaderboardConfig) {
  const servers = Array.isArray(leaderboardConfig?.servers)
    ? leaderboardConfig.servers
        .filter((entry) => String(entry?.cfCloudServerId || '').trim())
        .map((entry, index) => ({
          key: String(entry?.key || `s${index + 1}`).trim(),
          name: String(entry?.name || entry?.key || `server${index + 1}`).trim(),
        }))
        .filter((entry) => entry.key)
    : [];

  commandBuilder.addStringOption((option) => {
    option
      .setName('server')
      .setDescription('Server key (optional)')
      .setRequired(false);
    if (servers.length > 0 && servers.length <= 25) {
      for (const entry of servers) {
        const label = `${entry.name} [${entry.key}]`.slice(0, 100);
        option.addChoices({ name: label, value: entry.key.slice(0, 100) });
      }
    }
    return option;
  });
  return commandBuilder;
}

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
    return option;
  });

const PROFILE_COMMAND = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View your VIP profile')
  .setDMPermission(true);

const SERVERINFO_COMMAND = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Show server VIP statistics')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);


const GIVEAWAY_COMMAND = new SlashCommandBuilder()
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
        for (const option of GIVEAWAY_PRIZE_OPTIONS) {
          o.addChoices({ name: option.label, value: option.value });
        }
        return o;
      })
      .addIntegerOption((o) => o.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(10080))
      .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(10))
  )
  .addSubcommand((sub) =>
    sub
      .setName('server')
      .setDescription('Pick a random winner from players currently online')
      .addStringOption((o) => {
        o.setName('prize').setDescription('VIP reward').setRequired(true);
        for (const option of GIVEAWAY_PRIZE_OPTIONS) {
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
        o.setName('server').setDescription('Server to pick from').setRequired(false)
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
      .addStringOption((o) => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('reroll')
      .setDescription('Reroll winner for ended giveaway')
      .addStringOption((o) => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
  );
const TICKETPANEL_COMMAND = new SlashCommandBuilder()
  .setName('ticketpanel')
  .setDescription('Post ticket panel in current channel')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

const CLOSE_TICKET_COMMAND = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Close current ticket')
  .setDMPermission(false);

const DELETE_TICKET_COMMAND = new SlashCommandBuilder()
  .setName('delete')
  .setDescription('Delete current ticket')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const config = loadConfig();
const statsCard = new StatsCard(config);
const DEFAULT_LANGUAGE = normalizeLanguage(config.language, 'ru');
const LEADERBOARD_CONFIG = normalizeLeaderboardConfig(config.leaderboard);
configurePlayerStatsServerOption(PLAYERSTATS_COMMAND, LEADERBOARD_CONFIG);
const LEADERBOARD_ENABLED = LEADERBOARD_CONFIG.enabled;
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
  'media_add',
  'media_remove',
  'api_givevip',
  'api_removevip',
  'api_setvip',
  'command_givevip',
  'command_removevip',
  'command_setvip',
  'everyone_timeout',
  'ticket_open',
  'ticket_close',
  'ticket_panel',
  'ticket_delete',
]);

logStartupInfo(config, servers, primaryServer);

let db = null;
let opQueue = Promise.resolve();
let primaryGuild = null;
let auditChannel = null;
let leaderboardGenerators = new Map();
const giveaways = new Map();
const invalidLinks = new Set();
const roleChangeSkips = new Set();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
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
  if (config.backupChannelId) {
    console.log(`[startup] backupChannelId=${config.backupChannelId}`);
  }
  if (LEADERBOARD_ENABLED) {
    const serverKeys = LEADERBOARD_CONFIG.servers.map((entry) => entry.key).join(',') || '-';
    console.log(
      `[startup] leaderboard enabled=true command=/${LEADERBOARD_CONFIG.commandName} servers=${serverKeys} default=${LEADERBOARD_CONFIG.defaultServerKey || '-'} autoPostChannelId=${LEADERBOARD_CONFIG.autoPostChannelId || '-'} backgroundRefresh=${LEADERBOARD_CONFIG.backgroundRefreshEnabled ? LEADERBOARD_CONFIG.backgroundRefreshIntervalMs : 'off'}`
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
  config.backupChannelId = config.backupChannelId
    ? String(config.backupChannelId).trim()
    : '';
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
  const ticketsCfg = config.tickets && typeof config.tickets === 'object' ? config.tickets : {};
  config.tickets = {
    categoryId: String(ticketsCfg.categoryId || '').trim(),
    archiveCategoryId: String(
      ticketsCfg.archiveCategoryId || ticketsCfg.categoryId || ''
    ).trim(),
    panelChannelId: String(ticketsCfg.panelChannelId || '').trim(),
    supportRoleId: String(ticketsCfg.supportRoleId || '').trim(),
  };
  return config;
}

function normalizeSlashCommandName(value, fallback) {
  const base = String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
  if (!base) {
    return fallback;
  }
  return base;
}

function normalizeLeaderboardServerKey(value, fallback) {
  const base = String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
  if (!base) {
    return fallback || '';
  }
  return base;
}

function normalizeLeaderboardServerEntry(rawEntry, source, index) {
  const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
  const defaultKey = `s${index + 1}`;
  const key = normalizeLeaderboardServerKey(
    entry.key || entry.name || entry.cfCloudServerId || defaultKey,
    defaultKey
  );
  const cfCloudServerId = String(entry.cfCloudServerId || '').trim();
  if (!cfCloudServerId) {
    return null;
  }

  const fallbackStatistic = entry.cfCloudStatistic || source.cfCloudStatistic || 'kills';
  return {
    key,
    name: String(entry.name || key).trim() || key,
    cfCloudApiKey: String(entry.cfCloudApiKey ?? source.cfCloudApiKey ?? '').trim(),
    cfCloudApplicationId: String(entry.cfCloudApplicationId ?? source.cfCloudApplicationId ?? '').trim(),
    cfCloudApplicationSecret: String(
      entry.cfCloudApplicationSecret ?? source.cfCloudApplicationSecret ?? ''
    ).trim(),
    cfCloudEnterpriseToken: String(
      entry.cfCloudEnterpriseToken ?? source.cfCloudEnterpriseToken ?? ''
    ).trim(),
    cfCloudStatistic: String(fallbackStatistic || 'kills').trim() || 'kills',
    cfCloudServerId,
    cfCloudApiUrl: String(entry.cfCloudApiUrl || source.cfCloudApiUrl || 'https://data.cftools.cloud').trim(),
    topCount: Math.max(1, Math.min(50, Number(entry.topCount ?? source.topCount) || 10)),
    updateIntervalMs: Math.max(
      60000,
      Number(entry.updateIntervalMs ?? source.updateIntervalMs) || 300000
    ),
  };
}

function buildLeaderboardServerList(source) {
  const list = [];
  const seenKeys = new Set();
  const pushEntry = (rawEntry, index) => {
    const normalized = normalizeLeaderboardServerEntry(rawEntry, source, index);
    if (!normalized) {
      return;
    }

    let key = normalized.key;
    if (seenKeys.has(key)) {
      let suffix = 2;
      while (seenKeys.has(`${key}-${suffix}`)) {
        suffix += 1;
      }
      key = `${key}-${suffix}`;
    }
    normalized.key = key;
    seenKeys.add(key);
    list.push(normalized);
  };

  if (Array.isArray(source.servers) && source.servers.length > 0) {
    source.servers.forEach((entry, index) => pushEntry(entry, index));
  } else {
    pushEntry(
      {
        key: source.defaultServer || 'main',
        name: source.serverName || source.defaultServer || 'Main',
        cfCloudServerId: source.cfCloudServerId,
      },
      0
    );
  }

  return list;
}

function normalizeLeaderboardConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const serverEntries = buildLeaderboardServerList(source);
  const defaultServerKeyCandidate = normalizeLeaderboardServerKey(
    source.defaultServer,
    serverEntries[0]?.key || ''
  );
  const defaultServerKey = serverEntries.some((entry) => entry.key === defaultServerKeyCandidate)
    ? defaultServerKeyCandidate
    : serverEntries[0]?.key || '';

  return {
    enabled: Boolean(source.enabled),
    commandName: normalizeSlashCommandName(source.command, 'top'),
    updateCommandName: normalizeSlashCommandName(source.updateCommand, 'updatetop'),
    requireAdminForTop: source.requireAdminForTop !== false,
    defaultServerKey,
    servers: serverEntries,
    autoPostChannelId: source.autoPostChannelId ? String(source.autoPostChannelId).trim() : '',
    autoPostIntervalMs: Math.max(60000, Number(source.autoPostIntervalMs) || 3600000),
    backgroundRefreshEnabled: source.backgroundRefreshEnabled !== false,
    backgroundRefreshIntervalMs: Math.max(
      60000,
      Number(source.backgroundRefreshIntervalMs) || 24 * 60 * 60 * 1000
    ),
    cfCloudApiKey: source.cfCloudApiKey || '',
    cfCloudApplicationId: source.cfCloudApplicationId || '',
    cfCloudApplicationSecret: source.cfCloudApplicationSecret || '',
    cfCloudEnterpriseToken: source.cfCloudEnterpriseToken || '',
    cfCloudStatistic: source.cfCloudStatistic || 'kills',
    cfCloudServerId: source.cfCloudServerId || '',
    cfCloudApiUrl: source.cfCloudApiUrl || 'https://data.cftools.cloud',
    topCount: Math.max(1, Math.min(50, Number(source.topCount) || 10)),
    updateIntervalMs: Math.max(60000, Number(source.updateIntervalMs) || 300000),
    logoPath: source.logoPath || './assets/logo.png',
    backgroundPath: source.backgroundPath || './assets/background.png',
    fontPath: source.fontPath || null,
  };
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
    case 'media_add':
      return 0x2ecc71;
    case 'expire_warn':
      return 0xf1c40f;
    case 'ticket_open':
      return 0x5865f2;
    case 'ticket_panel':
      return 0x57f287;
    case 'ticket_close':
      return 0x747f8d;
    case 'manual_remove':
    case 'expire_remove':
    case 'command_removevip':
    case 'media_remove':
    case 'everyone_timeout':
    case 'ticket_delete':
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
  if (!Array.isArray(normalized.whiteList.media)) {
    normalized.whiteList.media = [];
  } else {
    normalized.whiteList.media = [...new Set(normalized.whiteList.media.map(String))];
  }
  if (Array.isArray(normalized.media) && normalized.media.length > 0) {
    normalized.whiteList.media = [
      ...new Set([...normalized.whiteList.media, ...normalized.media.map(String)]),
    ];
  }
  delete normalized.whiteList.newera;
  delete normalized.newera;
  delete normalized.media;
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
  if (!normalized.tickets || typeof normalized.tickets !== 'object') {
    normalized.tickets = {};
  }
  return normalized;
}

function createBaseSettingsDb() {
  return {
    Enable: 1,
    ChatCommand: '!loadout',
    PresetSlots: 10,
    whiteList: { vip: [], media: [] },
  };
}

function createBaseBotDb() {
  return {
    links: {},
    locales: {},
    vipTimed: {},
    history: [],
    tickets: {},
  };
}

function extractSettingsPayload(data) {
  const settings = { ...(data || {}) };
  delete settings.links;
  delete settings.locales;
  delete settings.vipTimed;
  delete settings.history;
  delete settings.tickets;
  delete settings.newera;
  delete settings.media;
  return normalizeSettingsDb(settings);
}

function extractMetaPayload(data) {
  return normalizeBotDb({
    links: data?.links,
    locales: data?.locales,
    vipTimed: data?.vipTimed,
    history: data?.history,
    tickets: data?.tickets,
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
  const tickets = data.tickets && typeof data.tickets === 'object'
    ? Object.keys(data.tickets).length
    : 0;
  return links + locales + vipTimed + history + tickets > 0;
}

function hasMetaFieldsInSettings(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  return (
    Object.prototype.hasOwnProperty.call(data, 'links') ||
    Object.prototype.hasOwnProperty.call(data, 'locales') ||
    Object.prototype.hasOwnProperty.call(data, 'vipTimed') ||
    Object.prototype.hasOwnProperty.call(data, 'history') ||
    Object.prototype.hasOwnProperty.call(data, 'tickets')
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
  const tickets = meta.tickets && typeof meta.tickets === 'object'
    ? Object.keys(meta.tickets).length
    : 0;
  return links + locales + vipTimed + history + tickets === 0;
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

    for (const [channelId, record] of Object.entries(incoming.tickets || {})) {
      if (!normalized.tickets[channelId]) {
        normalized.tickets[channelId] = record;
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
  const media = Array.isArray(db.whiteList?.media)
    ? [...new Set(db.whiteList.media.map(String))]
    : [];
  for (const server of servers) {
    if (server === primaryServer) {
      continue;
    }
    try {
      const serverDb = await readServerJsonOrCreate(server);
      const settingsPayload = extractSettingsPayload(serverDb);
      settingsPayload.whiteList.vip = [...whitelist];
      settingsPayload.whiteList.media = [...media];
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
        await notifyVipRemoved(target.discordId, 'api');
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

function ensureMedia(steam64) {
  const key = String(steam64);
  if (!db.whiteList || typeof db.whiteList !== 'object') {
    db.whiteList = { vip: [], media: [] };
  }
  if (!Array.isArray(db.whiteList.media)) {
    db.whiteList.media = [];
  }
  if (!db.whiteList.media.includes(key)) {
    db.whiteList.media.push(key);
  }
}

function removeMedia(steam64) {
  const key = String(steam64);
  if (!db.whiteList || typeof db.whiteList !== 'object') {
    db.whiteList = { vip: [], media: [] };
    return;
  }
  if (!Array.isArray(db.whiteList.media)) {
    db.whiteList.media = [];
    return;
  }
  db.whiteList.media = db.whiteList.media.filter((entry) => entry !== key);
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
  const language = resolveUserLanguage(discordId, primaryGuild?.preferredLocale);
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

  const rolesToRemove = member.roles.cache.filter(
    (role) => VIP_ROLE_NAMES.has(role.name) || role.name === GIVEAWAY_VIP_ROLE_NAME
  );
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
    embeds: [buildExpiryWarningEmbed(record.roleName || 'VIP', record.expiresAt, language, thresholdSeconds)],
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

async function handleProfileCommand(interaction, interactionLanguage) {
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
    servers
      .map((server) => `- **${server.name}** (\`${server.type}\`)`)
      .join('\n') || '-';

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

async function sendDailyBackup() {
  const channelId = String(config.backupChannelId || '').trim();
  if (!channelId || !client.isReady() || !db) {
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const metaPayload = extractMetaPayload(db);
    const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(metaPayload, null, 2), 'utf8'), {
      name: `backup-${new Date().toISOString().slice(0, 10)}.json`,
    });

    await channel.send({
      content: `Ежедневный бэкап базы данных - <t:${unixNow()}:F>`,
      files: [attachment],
    });
  } catch (err) {
    console.error('[backup] Failed to send backup:', err?.message || err);
  }
}

function startDailyBackup() {
  const channelId = String(config.backupChannelId || '').trim();
  if (!channelId) {
    return;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  setTimeout(() => {
    void sendDailyBackup();
    setInterval(() => {
      void sendDailyBackup();
    }, dayMs);
  }, dayMs);
  console.log('[backup] Daily backup scheduled.');
}

function getTicketConfig() {
  return config.tickets || {};
}

function getTicketMessages(language) {
  const normalized = normalizeLanguage(language, DEFAULT_LANGUAGE);
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

function buildCfToolsProfileUrl(steam64) {
  return `https://app.cftools.cloud/profile/${encodeURIComponent(String(steam64 || '').trim())}`;
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
    ? normalizeLanguage(forcedLanguage, fallbackLanguage)
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
  await enqueueOperation(async () => {
    const discordId = interaction.user.id;
    const existingLink = getLinkedSteamId(discordId);
    if (existingLink && existingLink !== steam64) {
      deniedMessage = messages.steamidAlreadyLinked;
      outcome = 'denied';
      await logAction('link_update_denied', {
        serverName: primaryServer.name,
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
        serverName: primaryServer.name,
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
    invalidLinks.delete(discordId);
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
      serverName: primaryServer.name,
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
  const language = normalizeLanguage(forcedLanguage, fallbackLanguage);
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

  const fallbackLanguage = resolveUserLanguage(interaction.user.id, interaction.guild?.preferredLocale);
  const language = forcedLanguage
    ? normalizeLanguage(forcedLanguage, fallbackLanguage)
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
    serverName: primaryServer.name,
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

  const reason = String(options.reason || 'manual');
  const closedBy = String(options.closedBy || client.user?.id || 'system');
  const guildLocale = channel?.guild?.preferredLocale || primaryGuild?.preferredLocale;
  const ticketLanguage = normalizeLanguage(
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
      const closeEmbed = reason === 'inactive_timeout'
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
    serverName: primaryServer.name,
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
    serverName: primaryServer.name,
    discordId: interaction.user.id,
    steam64: null,
    roleName: null,
    expiresAt: null,
    note: `channel=${targetChannel.id}`,
  });
}

async function handleTicketDeleteCommand(interaction, language) {
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
    serverName: primaryServer.name,
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
  if (!db) {
    return;
  }

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
        serverName: primaryServer.name,
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

async function handleEveryoneProtection(message) {
  if (!message.inGuild() || !message.content || !message.member || message.author?.bot) {
    return;
  }
  if (!message.mentions.everyone) {
    return;
  }

  const member = message.member;
  if (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.MentionEveryone)
  ) {
    return;
  }

  const language = resolveUserLanguage(member.id, message.guild?.preferredLocale);
  const messages = getMessagesForLanguage(language);
  let deletedCount = 0;

  try {
    await message.delete().catch(() => {});
    await member.timeout(EVERYONE_TIMEOUT_SECONDS * 1000, '@everyone spam');

    const cutoff = Date.now() - EVERYONE_DELETE_HOURS * 3600 * 1000;
    const fetched = await message.channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (fetched) {
      const ownMessages = fetched.filter(
        (entry) => entry.author?.id === member.id && entry.createdTimestamp >= cutoff
      );
      if (ownMessages.size > 0) {
        deletedCount = ownMessages.size;
        await message.channel.bulkDelete(ownMessages, true).catch(() => {});
      }
    }

    await sendDmToUserId(member.id, {
      content: messages.everyoneTimeout,
    }).catch(() => {});

    await logAction('everyone_timeout', {
      serverName: primaryServer.name,
      discordId: member.id,
      steam64: getLinkedSteamId(member.id),
      roleName: null,
      expiresAt: null,
      note: `deleted=${deletedCount}`,
    });
  } catch (err) {
    console.error('[everyone-protection] Failed:', err?.message || err);
  }
}

async function assignMemberRole(member) {
  if (!member || !primaryGuild) {
    return false;
  }
  try {
    const candidateNames = new Set(
      MEMBER_ROLE_NAMES.map((name) => String(name || '').trim().toLowerCase()).filter(Boolean)
    );
    const role = primaryGuild.roles.cache.find(
      (entry) => candidateNames.has(String(entry.name || '').trim().toLowerCase())
    );
    if (!role || member.roles.cache.has(role.id)) {
      return false;
    }
    await member.roles.add(role, 'SteamID linked');
    return true;
  } catch (err) {
    console.error('[member-role] Failed to assign:', err?.message || err);
    return false;
  }
}

async function handleMemberLeave(member) {
  if (!db) {
    return;
  }

  const discordId = member.id;
  const steam64 = getLinkedSteamId(discordId);
  if (!steam64) {
    return;
  }
  const steamKey = String(steam64);
  const hadVip = db.whiteList.vip.includes(steamKey);
  const hadMedia = Array.isArray(db.whiteList?.media) && db.whiteList.media.includes(steamKey);
  if (!hadVip && !hadMedia) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));
  let wasKicked = false;
  try {
    if (
      member.guild.members.me &&
      member.guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)
    ) {
      const auditLogs = await member.guild.fetchAuditLogs({ type: 20, limit: 5 });
      const kickEntry = auditLogs.entries.find(
        (entry) =>
          entry.target &&
          entry.target.id === discordId &&
          Date.now() - entry.createdTimestamp < 5000
      );
      if (kickEntry) {
        wasKicked = true;
      }
    }
  } catch (err) {
    // Ignore audit fetch failures and continue as voluntary leave.
  }

  if (wasKicked) {
    return;
  }

  if (hadVip) {
    removeVip(steamKey);
    delete db.vipTimed[steamKey];
    addHistory('expire_remove', {
      discordId,
      steam64: steamKey,
      roleName: null,
      expiresAt: null,
      note: 'member_left',
    });
  }

  if (hadMedia) {
    removeMedia(steamKey);
    addHistory('media_remove', {
      discordId,
      steam64: steamKey,
      roleName: MEDIA_ROLE_NAME,
      expiresAt: 0,
      note: 'member_left',
    });
  }

  await persistAndSync();

  if (hadVip) {
    await logAction('expire_remove', {
      serverName: primaryServer.name,
      discordId,
      steam64: steamKey,
      roleName: null,
      expiresAt: 0,
      note: 'member_left_discord',
    });
    await notifyVipRemoved(discordId, 'left_guild');
  }
  if (hadMedia) {
    await logAction('media_remove', {
      serverName: primaryServer.name,
      discordId,
      steam64: steamKey,
      roleName: MEDIA_ROLE_NAME,
      expiresAt: 0,
      note: 'member_left_discord',
    });
  }
}

async function runStartupReconcile() {
  if (!db || !primaryGuild) {
    return;
  }

  const linkedEntries = Object.entries(db.links || {});
  if (linkedEntries.length === 0) {
    return;
  }

  let changed = false;
  let assignedMemberRoleCount = 0;
  let removedVipCount = 0;
  let removedMediaCount = 0;

  for (const [discordId, steam64] of linkedEntries) {
    const member = await fetchGuildMember(discordId);
    if (member) {
      const assigned = await assignMemberRole(member);
      if (assigned) {
        assignedMemberRoleCount += 1;
      }
      continue;
    }

    const steamKey = String(steam64);
    const hadVip = db.whiteList.vip.includes(steamKey);
    const hadMedia = Array.isArray(db.whiteList?.media) && db.whiteList.media.includes(steamKey);
    if (!hadVip && !hadMedia) {
      continue;
    }

    if (hadVip) {
      removeVip(steamKey);
      delete db.vipTimed[steamKey];
      addHistory('expire_remove', {
        discordId,
        steam64: steamKey,
        roleName: null,
        expiresAt: null,
        note: 'startup_reconcile_member_missing',
      });
      await logAction('expire_remove', {
        serverName: primaryServer.name,
        discordId,
        steam64: steamKey,
        roleName: null,
        expiresAt: 0,
        note: 'startup_reconcile_member_missing',
      });
      await notifyVipRemoved(discordId, 'startup_check');
      removedVipCount += 1;
      changed = true;
    }

    if (hadMedia) {
      removeMedia(steamKey);
      addHistory('media_remove', {
        discordId,
        steam64: steamKey,
        roleName: MEDIA_ROLE_NAME,
        expiresAt: 0,
        note: 'startup_reconcile_member_missing',
      });
      await logAction('media_remove', {
        serverName: primaryServer.name,
        discordId,
        steam64: steamKey,
        roleName: MEDIA_ROLE_NAME,
        expiresAt: 0,
        note: 'startup_reconcile_member_missing',
      });
      removedMediaCount += 1;
      changed = true;
    }
  }

  if (changed) {
    await persistAndSync();
  }

  console.log(
    `[startup] reconcile: memberRoleAssigned=${assignedMemberRoleCount} vipRemoved=${removedVipCount} mediaRemoved=${removedMediaCount}`
  );
}

async function initializeLeaderboardModule() {
  if (!LEADERBOARD_ENABLED) {
    return;
  }
  if (!LEADERBOARD_CONFIG.servers.length) {
    console.warn('[leaderboard] Missing leaderboard.servers configuration. Module disabled.');
    return;
  }

  let LeaderboardGenerator;
  try {
    LeaderboardGenerator = require('../leaderboard/leaderboard-generator');
  } catch (err) {
    console.warn('[leaderboard] Failed to load module:', err?.message || err);
    console.warn('[leaderboard] Install missing deps and restart.');
    return;
  }

  if (LeaderboardGenerator && LeaderboardGenerator.default) {
    LeaderboardGenerator = LeaderboardGenerator.default;
  }
  if (typeof LeaderboardGenerator !== 'function') {
    console.warn('[leaderboard] Module export is invalid. Expected class/function.');
    return;
  }

  leaderboardGenerators = new Map();
  for (const serverEntry of LEADERBOARD_CONFIG.servers) {
    const hasLegacyApiKey = Boolean(serverEntry.cfCloudApiKey);
    const hasAppCredentials = Boolean(
      serverEntry.cfCloudApplicationId && serverEntry.cfCloudApplicationSecret
    );
    if (!hasLegacyApiKey && !hasAppCredentials) {
      console.warn(
        `[leaderboard] server=${serverEntry.key} missing credentials (cfCloudApiKey or cfCloudApplicationId+cfCloudApplicationSecret). Skipped.`
      );
      continue;
    }

    if (serverEntry.cfCloudEnterpriseToken && !hasAppCredentials) {
      console.warn(
        `[leaderboard] server=${serverEntry.key} cfCloudEnterpriseToken requires cfCloudApplicationId+cfCloudApplicationSecret. Token ignored.`
      );
    }

    if (hasAppCredentials) {
      console.log(
        `[leaderboard] server=${serverEntry.key} auth mode=sdk${serverEntry.cfCloudEnterpriseToken ? '+enterprise' : ''}`
      );
    } else if (hasLegacyApiKey) {
      console.log(`[leaderboard] server=${serverEntry.key} auth mode=legacy bearer token`);
    }

    if (hasLegacyApiKey && !hasAppCredentials && serverEntry.cfCloudApiKey.startsWith('e--')) {
      console.warn(
        `[leaderboard] server=${serverEntry.key} cfCloudApiKey looks like enterprise token. Prefer cfCloudApplicationId + cfCloudApplicationSecret.`
      );
    }

    const generator = new LeaderboardGenerator({
      cfCloudApiKey: serverEntry.cfCloudApiKey,
      cfCloudApplicationId: serverEntry.cfCloudApplicationId,
      cfCloudApplicationSecret: serverEntry.cfCloudApplicationSecret,
      cfCloudEnterpriseToken: serverEntry.cfCloudEnterpriseToken,
      cfCloudStatistic: serverEntry.cfCloudStatistic,
      cfCloudServerId: serverEntry.cfCloudServerId,
      cfCloudApiUrl: serverEntry.cfCloudApiUrl,
      logoPath: LEADERBOARD_CONFIG.logoPath,
      backgroundPath: LEADERBOARD_CONFIG.backgroundPath,
      fontPath: LEADERBOARD_CONFIG.fontPath,
      topCount: serverEntry.topCount,
      updateInterval: serverEntry.updateIntervalMs,
    });

    if (typeof generator.registerCustomFont === 'function') {
      generator.registerCustomFont();
    }

    leaderboardGenerators.set(serverEntry.key, {
      key: serverEntry.key,
      name: serverEntry.name,
      generator,
    });
  }

  if (!leaderboardGenerators.size) {
    console.warn('[leaderboard] No valid server configuration found. Module disabled.');
    return;
  }

  if (LEADERBOARD_CONFIG.backgroundRefreshEnabled) {
    const refreshInterval = LEADERBOARD_CONFIG.backgroundRefreshIntervalMs;
    for (const context of leaderboardGenerators.values()) {
      const refresh = async () => {
        try {
          await context.generator.updateLeaderboard(true);
          console.log(`[leaderboard] background refresh OK for server=${context.key}`);
        } catch (err) {
          console.warn(
            `[leaderboard] background refresh failed for server=${context.key}:`,
            err?.message || err
          );
        }
      };
      void refresh();
      setInterval(() => {
        void refresh();
      }, refreshInterval);
    }
    console.log(
      `[leaderboard] Background refresh scheduled every ${refreshInterval} ms for ${leaderboardGenerators.size} server(s).`
    );
  }

  if (LEADERBOARD_CONFIG.autoPostChannelId) {
    const channel = await client.channels.fetch(LEADERBOARD_CONFIG.autoPostChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn('[leaderboard] Auto-post channel not found or not text-based.');
    } else {
      for (const context of leaderboardGenerators.values()) {
        if (typeof context.generator.autoPostLeaderboard !== 'function') {
          continue;
        }
        context.generator.autoPostLeaderboard(channel, LEADERBOARD_CONFIG.autoPostIntervalMs, {
          serverName: context.name,
        });
        console.log(`[leaderboard] Auto-post started for server=${context.key}.`);
      }
    }
  }
}

function addLeaderboardServerOption(commandBuilder) {
  if (LEADERBOARD_CONFIG.servers.length <= 1) {
    return commandBuilder;
  }

  commandBuilder.addStringOption((option) => {
    option.setName('server').setDescription('Leaderboard server').setRequired(false);
    if (LEADERBOARD_CONFIG.servers.length <= 25) {
      for (const entry of LEADERBOARD_CONFIG.servers) {
        const choiceLabel = `${entry.name} [${entry.key}]`.slice(0, 100);
        option.addChoices({ name: choiceLabel, value: entry.key.slice(0, 100) });
      }
    }
    return option;
  });

  return commandBuilder;
}

function buildLeaderboardSlashCommands() {
  if (!LEADERBOARD_ENABLED) {
    return [];
  }
  const commands = [];
  const topCommand = addLeaderboardServerOption(
    new SlashCommandBuilder()
    .setName(LEADERBOARD_CONFIG.commandName)
    .setDescription('Show leaderboard')
    .setDMPermission(false)
  );
  if (LEADERBOARD_CONFIG.requireAdminForTop) {
    topCommand.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  }
  commands.push(topCommand);

  if (LEADERBOARD_CONFIG.updateCommandName !== LEADERBOARD_CONFIG.commandName) {
    const updateCommand = addLeaderboardServerOption(
      new SlashCommandBuilder()
      .setName(LEADERBOARD_CONFIG.updateCommandName)
      .setDescription('Refresh leaderboard cache')
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    );
    commands.push(updateCommand);
  } else {
    console.warn('[leaderboard] command and updateCommand are equal, update command skipped.');
  }

  return commands;
}

function resolveLeaderboardServer(rawKey) {
  if (!LEADERBOARD_CONFIG.servers.length) {
    return null;
  }

  const fallbackContext =
    leaderboardGenerators.get(LEADERBOARD_CONFIG.defaultServerKey) ||
    leaderboardGenerators.values().next().value ||
    null;
  if (!rawKey) {
    return fallbackContext;
  }

  const normalizedKey = normalizeLeaderboardServerKey(rawKey, '');
  if (!normalizedKey) {
    return fallbackContext;
  }

  return leaderboardGenerators.get(normalizedKey) || null;
}

async function handleLeaderboardInteraction(interaction) {
  if (!LEADERBOARD_ENABLED) {
    return false;
  }
  const isTopCommand = interaction.commandName === LEADERBOARD_CONFIG.commandName;
  const isUpdateCommand = interaction.commandName === LEADERBOARD_CONFIG.updateCommandName;
  if (!isTopCommand && !isUpdateCommand) {
    return false;
  }

  if (!leaderboardGenerators.size) {
    await interaction.reply({
      content: 'Leaderboard module is not available.',
      ephemeral: true,
    });
    return true;
  }

  const needsAdminPermission =
    isUpdateCommand || (isTopCommand && LEADERBOARD_CONFIG.requireAdminForTop);
  if (needsAdminPermission && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'No permission.',
      ephemeral: true,
    });
    return true;
  }

  const requestedServer = interaction.options.getString('server', false);
  const serverContext = resolveLeaderboardServer(requestedServer);
  if (!serverContext) {
    const available = LEADERBOARD_CONFIG.servers.map((entry) => entry.key).join(', ') || '-';
    await interaction.reply({
      content: `Unknown server. Available values: ${available}`,
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply();
  try {
    const payload = await serverContext.generator.updateLeaderboard(isUpdateCommand);
    const embed = serverContext.generator.buildLeaderboardEmbed(payload, {
      refreshed: isUpdateCommand,
      serverName: serverContext.name,
    });
    await interaction.editReply({
      embeds: [embed],
    });
  } catch (err) {
    console.warn('[leaderboard] interaction failed:', err?.message || err);
    await interaction.editReply({
      content: 'Failed to load leaderboard.',
    });
  }
  return true;
}


const CFTOOLS_SERVERS = [
  { key: 's1', name: 'SWAGA 20MM', id: '00ebc10b-efbe-437a-bf0f-7fde12ee53ff' },
  { key: 's2', name: 'SWAGA .338', id: '91dccd12-97de-4340-b23b-dde8a2f64e44' },
  { key: 's3', name: 'SWAGA VANILLA', id: 'af7eebde-c26e-4ece-a0b6-31daebab5080' },
];

async function getCftoolsToken() {
  const appId = config.leaderboard?.cfCloudApplicationId || config.cfCloudApplicationId || '';
  const appSecret = config.leaderboard?.cfCloudApplicationSecret || config.cfCloudApplicationSecret || '';
  if (!appId || !appSecret) return null;
  try {
    const resp = await fetch('https://data.cftools.cloud/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: appId, secret: appSecret }),
    });
    const data = await resp.json();
    return data.token || null;
  } catch { return null; }
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
      console.log('[cftools] sessions sample:', JSON.stringify(data.sessions?.[0], null, 2));
      if (data.sessions && Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          const name = s.gamedata?.player_name || s.persona?.profile?.name || s['cftools_id'] || 'Unknown';
          const steam64 = s.gamedata?.steam64 || null;
          players.push({ name, steam64, serverId: sid });
        }
      }
    } catch { /* skip failed server */ }
  }
  return players;
}

function getGiveawayPrizeOption(prizeValue) {
  return GIVEAWAY_PRIZE_OPTIONS.find((entry) => entry.value === String(prizeValue || '')) || null;
}

async function grantGiveawayRole(discordId, note) {
  const member = await fetchGuildMember(discordId);
  if (!member) {
    return { assigned: false, reason: 'member_not_found' };
  }
  const role = member.guild.roles.cache.find((entry) => entry.name === GIVEAWAY_VIP_ROLE_NAME);
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
  if (!giveaway || giveaway.ended !== true || !Array.isArray(giveaway.winners)) {
    return { granted: 0, skipped: 0, skippedAlreadyVip: 0, skippedNoLink: 0, alreadyVipWinners: [] };
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
        serverName: primaryServer.name,
        discordId,
        steam64: null,
        roleName: GIVEAWAY_VIP_ROLE_NAME,
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
        serverName: primaryServer.name,
        discordId,
        steam64: steamKey,
        roleName: GIVEAWAY_VIP_ROLE_NAME,
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
        roleName: GIVEAWAY_VIP_ROLE_NAME,
        source: 'giveaway',
        reason,
      };
      dbChanged = true;
    }

    addHistory('giveaway_reward', {
      discordId,
      steam64: steamKey,
      roleName: GIVEAWAY_VIP_ROLE_NAME,
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
    const language = resolveUserLanguage(entry.discordId, primaryGuild?.preferredLocale);
    await sendDmToUserId(entry.discordId, {
      embeds: [buildVipEmbed(GIVEAWAY_VIP_ROLE_NAME, entry.expiresAt > 0 ? entry.expiresAt : null, language)],
    });
    await logAction('giveaway_reward', {
      serverName: primaryServer.name,
      discordId: entry.discordId,
      steam64: entry.steam64,
      roleName: GIVEAWAY_VIP_ROLE_NAME,
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
    .setFooter({ text: ended ? `Победителей: ${giveaway.winnersCount}` : `Победителей: ${giveaway.winnersCount} · ID: ${giveaway.messageId || '...'}` });
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
  if (!winner || !reward) {
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
      serverName: primaryServer.name,
      discordId: discordId || null,
      steam64: steamKey,
      roleName: GIVEAWAY_VIP_ROLE_NAME,
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
      roleName: GIVEAWAY_VIP_ROLE_NAME,
      source: 'giveaway_server',
      reason,
    };
    dbChanged = true;
  }

  addHistory('giveaway_reward', {
    discordId: discordId || null,
    steam64: steamKey,
    roleName: GIVEAWAY_VIP_ROLE_NAME,
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

    const language = resolveUserLanguage(discordId, primaryGuild?.preferredLocale);
    await sendDmToUserId(discordId, {
      embeds: [
        buildVipEmbed(
          GIVEAWAY_VIP_ROLE_NAME,
          expiresAt > 0 ? expiresAt : null,
          language
        ),
      ],
    });
  }

  await logAction('giveaway_reward', {
    serverName: primaryServer.name,
    discordId: discordId || null,
    steam64: steamKey,
    roleName: GIVEAWAY_VIP_ROLE_NAME,
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
          content:
            `ℹ️ ${winnerMentions} уже имеют активный VIP, поэтому приз им не выдан.`,
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error('[giveaway] end error:', err);
  }
}

async function handleGiveawayCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const prizeValue = interaction.options.getString('prize', true);
    const reward = getGiveawayPrizeOption(prizeValue);
    if (!reward) {
      await interaction.reply({ content: '❌ Неверный тип приза.', ephemeral: true });
      return;
    }
    const prize = reward.label;
    const duration = interaction.options.getInteger('duration', true);
    const winnersCount = interaction.options.getInteger('winners') || 1;
    const endsAt = Date.now() + duration * 60 * 1000;
    const giveawayId = `${interaction.id}`;

    const giveaway = {
      id: giveawayId,
      prize,
      prizeValue: reward.value,
      endsAt,
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
    const embed = buildGiveawayEmbed(giveaway);
    const row = buildJoinButton(giveawayId);
    const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
    giveaway.messageId = msg.id;

    setTimeout(() => endGiveaway(giveawayId), duration * 60 * 1000);
    await interaction.editReply({ content: `✅ Розыгрыш создан! [Перейти](https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${msg.id})` });
    return;
  }

  if (sub === 'server') {
    await interaction.deferReply({ ephemeral: true });
    const serverKey = interaction.options.getString('server') || 'all';
    const prizeValue = interaction.options.getString('prize', true);
    const reward = getGiveawayPrizeOption(prizeValue);
    if (!reward) {
      await interaction.editReply({ content: '❌ Неверный тип приза.' });
      return;
    }
    const durationMinutes = interaction.options.getInteger('duration', true);
    const serverIds = serverKey === 'all'
      ? CFTOOLS_SERVERS.map((s) => s.id)
      : [CFTOOLS_SERVERS.find((s) => s.key === serverKey)?.id].filter(Boolean);
    if (!serverIds.length) {
      await interaction.editReply({ content: '❌ Сервер не найден.' });
      return;
    }

    const serverName = serverKey === 'all'
      ? 'всех серверов'
      : CFTOOLS_SERVERS.find((s) => s.key === serverKey)?.name || serverKey;
    const endAtMs = Date.now() + durationMinutes * 60 * 1000;
    const endAtUnix = Math.floor(endAtMs / 1000);

    if (!interaction.channel || !interaction.channel.isTextBased()) {
      await interaction.editReply({ content: '❌ Этот канал не поддерживает отправку сообщений.' });
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
        const winnerLine = formatOnlineGiveawayWinnerLine(winner);
        const resultEmbed = new EmbedBuilder()
          .setTitle('🎁 Розыгрыш среди игроков онлайн')
          .setDescription(
            `**Приз:** ${reward.label}\n**Сервер:** ${serverName}\n**Игроков онлайн:** ${players.length}\n\n${winnerLine}`
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
              content:
                `ℹ️ Победитель ${target} уже имеет активный VIP, поэтому приз не выдан.`,
            })
            .catch(() => {});
          return;
        }
        if (grantResult.granted && grantResult.discordId) {
          await channel
            .send({
              content:
                `🎉 Победитель <@${grantResult.discordId}> получил **${reward.label}** ` +
                `и роль **${GIVEAWAY_VIP_ROLE_NAME}**.`,
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
            content:
              `ℹ️ ${winnerMentions} уже имеют активный VIP, поэтому приз им не выдан.`,
          })
          .catch(() => {});
      }
    }
    await interaction.reply({ content: '✅ Победитель перевыбран.', ephemeral: true });
    return;
  }
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const commandBuilders = [
    STATUS_COMMAND,
    STEAMID_COMMAND,
    LINK_COMMAND,
    UNLINK_COMMAND,
    WHOIS_COMMAND,
    VIPLIST_COMMAND,
    STATS_COMMAND,
    PLAYERSTATS_COMMAND,
    SETVIP_COMMAND,
    REMOVEVIP_COMMAND,
    GIVEVIP_COMMAND,
    PROFILE_COMMAND,
    SERVERINFO_COMMAND,
    GIVEAWAY_COMMAND,
    TICKETPANEL_COMMAND,
    CLOSE_TICKET_COMMAND,
    DELETE_TICKET_COMMAND,
  ];
  for (const command of buildLeaderboardSlashCommands()) {
    if (commandBuilders.some((entry) => entry.name === command.name)) {
      console.warn(`[leaderboard] Slash command name conflict: ${command.name}`);
      continue;
    }
    commandBuilders.push(command);
  }

  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commandBuilders.map((entry) => entry.toJSON()),
  });
}

client.once('clientReady', async () => {
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

  try {
    await initializeLeaderboardModule();
  } catch (err) {
    console.error('Leaderboard init failed:', err?.message || err);
  }

  await enqueueOperation(runStartupReconcile);
  await enqueueOperation(runExpirationCheck);
  setInterval(() => enqueueOperation(runExpirationCheck), CHECK_INTERVAL_MS);
  await enqueueOperation(runTicketInactivityCheck);
  setInterval(() => enqueueOperation(runTicketInactivityCheck), TICKET_IDLE_CHECK_INTERVAL_MS);
  startDailyBackup();
});

client.on('messageCreate', async (message) => {
  try {
    await handleTicketOwnerFirstMessage(message);
  } catch (err) {
    console.error('[tickets] first-message hook failed:', err?.message || err);
  }
  try {
    await handleEveryoneProtection(message);
  } catch (err) {
    console.error('[everyone-protection] Error:', err?.message || err);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    await handleMemberLeave(member);
  } catch (err) {
    console.error('[member-leave] Error:', err?.message || err);
  }
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

  const oldRolesLower = new Set([...oldRoles].map((roleName) => roleName.toLowerCase()));
  const newRolesLower = new Set([...newRoles].map((roleName) => roleName.toLowerCase()));
  const hadMediaBefore = oldRolesLower.has(MEDIA_ROLE_NAME);
  const hasMediaAfter = newRolesLower.has(MEDIA_ROLE_NAME);
  if (!hadMediaBefore && hasMediaAfter) {
    enqueueOperation(() => handleMediaRoleAdded(newMember));
  }
  if (hadMediaBefore && !hasMediaAfter) {
    enqueueOperation(() => handleMediaRoleRemoved(newMember));
  }

  const hasVipAfter = [...newRoles].some(
    (roleName) => VIP_ROLE_NAMES.has(roleName) || roleName === GIVEAWAY_VIP_ROLE_NAME
  );
  if (filteredRemovedVipRoles.length > 0 && !hasVipAfter) {
    const roleName = pickBestRole(filteredRemovedVipRoles) || null;
    enqueueOperation(() => handleVipRoleRemoved(newMember, roleName));
  }
});

client.on('interactionCreate', async (interaction) => {
  let messages = getMessagesForLanguage(DEFAULT_LANGUAGE);
  try {
    if (interaction.isButton()) {
      if (!db) {
        await interaction.reply({
          content: getMessagesForLanguage(DEFAULT_LANGUAGE).statusLoading,
          ephemeral: true,
        });
        return;
      }
      if (interaction.customId === 'ticket_create_ru') {
        await showTicketCreateModal(interaction, 'ru');
        return;
      }
      if (interaction.customId === 'ticket_create_en') {
        await showTicketCreateModal(interaction, 'en');
        return;
      }
      if (interaction.customId === 'ticket_create') {
        await showTicketCreateModal(interaction);
        return;
      }
      if (interaction.customId === 'ticket_close') {
        await handleTicketClose(interaction);
        return;
      }
      if (interaction.customId.startsWith('giveaway_join:')) {
        const giveawayId = interaction.customId.split(':')[1];
        const giveaway = giveaways.get(giveawayId);
        if (!giveaway || giveaway.ended) {
          await interaction.reply({ content: '❌ Розыгрыш уже завершён.', ephemeral: true });
          return;
        }
        const discordId = interaction.user.id;
        const steam64 = getLinkedSteamId(discordId);
        if (!steam64) {
          await interaction.showModal(buildSteamModal(giveawayId));
          return;
        }
        if (giveaway.participants.has(discordId)) {
          await interaction.reply({ content: '✅ Ты уже участвуешь в розыгрыше!', ephemeral: true });
          return;
        }
        giveaway.participants.add(discordId);
        const msg = await interaction.channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [buildGiveawayEmbed(giveaway)], components: [buildJoinButton(giveawayId)] });
        await interaction.reply({ content: '🎉 Ты участвуешь в розыгрыше!', ephemeral: true });
        return;
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (!db) {
        await interaction.reply({
          content: getMessagesForLanguage(DEFAULT_LANGUAGE).statusLoading,
          ephemeral: true,
        });
        return;
      }
      if (
        interaction.customId === 'ticket_create_modal_ru' ||
        interaction.customId === 'ticket_create_modal_en'
      ) {
        await handleTicketCreateModalSubmit(interaction);
        return;
      }
      if (interaction.customId.startsWith('giveaway_steam_modal:')) {
        const giveawayId = interaction.customId.split(':')[1];
        const giveaway = giveaways.get(giveawayId);
        if (!giveaway || giveaway.ended) {
          await interaction.reply({ content: '❌ Розыгрыш уже завершён.', ephemeral: true });
          return;
        }
        const input = normalizeSteamId64(interaction.fields.getTextInputValue('steamid_input'));
        if (!isValidSteamId64(input)) {
          await interaction.reply({ content: getMessagesForLanguage(DEFAULT_LANGUAGE).invalidSteamId, ephemeral: true });
          return;
        }
        const discordId = interaction.user.id;
        const existingOwner = findDiscordIdBySteam(input);
        if (existingOwner && existingOwner !== discordId) {
          await interaction.reply({ content: getMessagesForLanguage(DEFAULT_LANGUAGE).steamidOwned, ephemeral: true });
          return;
        }
        db.links[discordId] = input;
        await savePrimaryDb();
        giveaway.participants.add(discordId);
        const msg = await interaction.channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [buildGiveawayEmbed(giveaway)], components: [buildJoinButton(giveawayId)] });
        await interaction.reply({ content: '🎉 Steam привязан и ты участвуешь в розыгрыше!', ephemeral: true });
        return;
      }
      return;
    }

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

    if (await handleLeaderboardInteraction(interaction)) {
      return;
    }

    if (interaction.commandName === 'ticketpanel') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      await handleTicketPanelCommand(interaction, interactionLanguage);
      return;
    }

    if (interaction.commandName === 'close') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      await handleTicketClose(interaction);
      return;
    }

    if (interaction.commandName === 'delete') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      await handleTicketDeleteCommand(interaction, interactionLanguage);
      return;
    }

    if (interaction.commandName === 'profile') {
      await handleProfileCommand(interaction, interactionLanguage);
      return;
    }

    if (interaction.commandName === 'giveaway') {
      if (!interaction.inGuild()) {
        await interaction.reply({ content: messages.onlyGuild, ephemeral: true });
        return;
      }
      await handleGiveawayCommand(interaction);
      return;
    }

    if (interaction.commandName === 'serverinfo') {
      if (!interaction.inGuild()) {
        await interaction.reply({
          content: messages.onlyGuild,
          ephemeral: true,
        });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: messages.noPermWhois,
          ephemeral: true,
        });
        return;
      }
      await handleServerInfoCommand(interaction, interactionLanguage);
      return;
    }

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

        try {
          const guild = interaction.guild ?? await client.guilds.fetch(config.guildId).catch(() => null);
          const guildMember = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
          if (guildMember) {
            await assignMemberRole(guildMember);
          }
        } catch (err) {
          // Ignore member role assignment errors to not block the command flow.
        }

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

        try {
          const guildMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (guildMember) {
            await assignMemberRole(guildMember);
          }
        } catch (err) {
          // Ignore member role assignment errors to not block the command flow.
        }

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
      await statsCard.handle(interaction);
      return;
    }

    if (interaction.commandName === 'vipstats') {
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
          await notifyVipRemoved(targetUser.id, 'admin', {
            admin: `<@${interaction.user.id}>`,
          });
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
        await notifyVipRemoved(targetUser.id, 'admin', {
          admin: `<@${interaction.user.id}>`,
        });

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
