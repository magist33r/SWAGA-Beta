const { ActivityType } = require('discord.js');

const ACTIVITY_TYPE_MAP = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
};

function normalizeStatusConfig(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {};
  const text = String(cfg.text || '').trim();
  const typeKey = String(cfg.type || 'playing').trim().toLowerCase();
  const type = ACTIVITY_TYPE_MAP[typeKey] ?? ActivityType.Playing;
  const enabled = cfg.enabled === true || (cfg.enabled !== false && text.length > 0);

  return {
    enabled,
    text: text || 'SWAGA Deathmatch',
    type,
    typeKey: ACTIVITY_TYPE_MAP[typeKey] ? typeKey : 'playing',
  };
}

function createStatusModule(rawConfig) {
  const config = normalizeStatusConfig(rawConfig);

  function apply(client) {
    if (!config.enabled || !client?.user) {
      return false;
    }
    client.user.setActivity(config.text, { type: config.type });
    return true;
  }

  return {
    ...config,
    apply,
  };
}

module.exports = {
  ACTIVITY_TYPE_MAP,
  normalizeStatusConfig,
  createStatusModule,
};
