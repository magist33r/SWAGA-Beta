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

const VIPLIST_PAGE_SIZE = 20;

module.exports = {
  VIP_ROLES,
  VIP_ROLE_NAMES,
  GIVEAWAY_VIP_ROLE_NAME,
  GIVEAWAY_PRIZE_OPTIONS,
  VIPLIST_PAGE_SIZE,
};
