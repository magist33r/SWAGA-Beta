const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const ftp = require('basic-ftp');
const { Writable } = require('stream');
const { EmbedBuilder } = require('discord.js');

const DEFAULT_POLL_MS = 3000;
const DEFAULT_FOOTER_TEXT = '[SWAGA Duels]';
const DEFAULT_THUMBNAIL_URL =
  'https://cdn.discordapp.com/avatars/1374465481200767118/7aff0430022bbef80c91b6567f310064.png?size=512';
const DEFAULT_COLOR = 0xffffff;
const STATE_PATH = path.resolve(process.cwd(), '.history_state.json');
const PARSE_ERROR = Symbol('parse_error');

function resolveAbsolutePath(rawPath, fallbackName) {
  if (!rawPath) {
    if (!fallbackName) {
      return null;
    }
    return path.resolve(process.cwd(), fallbackName);
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}
function resolveLocalPathWithProfile(targetPath, profilePath) {
  const value = String(targetPath || '');
  const lower = value.toLowerCase();
  if (lower.startsWith('$profile:')) {
    if (!profilePath) {
      return null;
    }
    const suffix = value.slice('$profile:'.length).replace(/^[/\\]+/, '');
    return path.resolve(profilePath, suffix);
  }
  return resolveAbsolutePath(value);
}

function normalizeRemotePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolveRemotePathWithProfile(targetPath, profilePath) {
  const value = String(targetPath || '');
  const lower = value.toLowerCase();
  if (lower.startsWith('$profile:')) {
    if (!profilePath) {
      return null;
    }
    const suffix = value.slice('$profile:'.length).replace(/^[/\\]+/, '');
    return path.posix.join(normalizeRemotePath(profilePath), normalizeRemotePath(suffix));
  }
  return normalizeRemotePath(value);
}

function normalizeTimestamp(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  if (num > 1e12) {
    return Math.floor(num / 1000);
  }
  return Math.floor(num);
}

function buildEntryKey(entry) {
  return [
    entry?.Timestamp ?? '',
    entry?.Arena ?? '',
    entry?.WinnerSteamId64 ?? '',
    entry?.LoserSteamId64 ?? '',
  ].join('|');
}

function pruneSentKeys(sentKeys, maxSize) {
  const target = Number.isFinite(Number(maxSize)) ? Math.max(1, Number(maxSize)) : 1000;
  while (sentKeys.size > target) {
    const oldest = sentKeys.values().next().value;
    if (!oldest) {
      break;
    }
    sentKeys.delete(oldest);
  }
}

function normalizePollMs(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) {
    return Math.floor(num);
  }
  return fallback;
}

function normalizeColor(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) {
    return Math.floor(num);
  }
  return fallback;
}

function buildEmbed(entry, feed) {
  const winnerName = entry?.WinnerName || 'Unknown';
  const loserName = entry?.LoserName || 'Unknown';
  const winnerId = entry?.WinnerSteamId64 || '';
  const loserId = entry?.LoserSteamId64 || '';
  const arena = entry?.Arena || 'Unknown';
  const serverName = feed?.serverName || arena;

  const formatPlayer = (name, id) => {
    const trimmed = String(id || '').trim();
    if (!trimmed) {
      return name;
    }
    return `[${name}](<https://app.cftools.cloud/profile/${trimmed}>)`;
  };

  const description = `${formatPlayer(winnerName, winnerId)} выиграл дуэль у ${formatPlayer(loserName, loserId)} на арене \`${arena}\``;

  const footerText = feed?.footerText || DEFAULT_FOOTER_TEXT;
  const thumbnailUrl = feed?.thumbnailUrl || DEFAULT_THUMBNAIL_URL;
  const color = normalizeColor(feed?.color, DEFAULT_COLOR);

  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor(color)
    .setAuthor({ name: String(serverName || 'Unknown') })
    .setFooter({ text: footerText })
    .setThumbnail(thumbnailUrl);

  return embed;
}

async function loadState(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const data = JSON.parse(raw);
    const lastLen = Number.isFinite(Number(data?.lastLen)) ? Number(data.lastLen) : null;
    const sentKeys = new Set(Array.isArray(data?.sentKeys) ? data.sentKeys : []);
    return { lastLen, sentKeys };
  } catch (err) {
    return { lastLen: null, sentKeys: new Set() };
  }
}

async function saveState(statePath, state) {
  const payload = {
    lastLen: Number.isFinite(Number(state.lastLen)) ? Number(state.lastLen) : 0,
    sentKeys: [...state.sentKeys],
  };
  await fs.writeFile(statePath, JSON.stringify(payload, null, 2), 'utf8');
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

async function readFtpFile(ftpConfig, remotePath) {
  if (!ftpConfig || !ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
    throw new Error('FTP config is missing host/user/password');
  }
  if (!remotePath) {
    throw new Error('FTP path is missing');
  }
  return withFtpClient(ftpConfig, async (client) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    await client.downloadTo(writable, remotePath);
    return Buffer.concat(chunks).toString('utf8');
  });
}

async function readHistory(source) {
  let raw;
  try {
    if (source.type === 'ftp') {
      raw = await readFtpFile(source.ftp, source.path);
    } else {
      raw = await fs.readFile(source.path, 'utf8');
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    const message = String(err?.message || '');
    if (source.type === 'ftp' && message.includes('550')) {
      return null;
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return PARSE_ERROR;
  }
}
function normalizeHistoryFeeds(config) {
  const history = config?.history;
  const defaults = {
    pollMs: normalizePollMs(history?.pollMs, DEFAULT_POLL_MS),
    serverName: history?.serverName,
    footerText: history?.footerText,
    thumbnailUrl: history?.thumbnailUrl,
    color: history?.color,
  };

  let feeds = [];
  if (Array.isArray(history)) {
    feeds = history;
  } else if (Array.isArray(history?.feeds)) {
    feeds = history.feeds;
  } else if (history && (history.path || history.channelId || history.serverName)) {
    feeds = [history];
  }

  return feeds.map((feed) => ({ ...defaults, ...feed }));
}
function buildServerMap(config) {
  const map = new Map();
  if (!Array.isArray(config?.servers)) {
    return map;
  }
  for (const entry of config.servers) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const name = String(entry.name || '').trim();
    if (!name) {
      continue;
    }
    const type = entry.type || (entry.ftp ? 'ftp' : 'local');
    map.set(name, {
      name,
      type,
      profilePath: entry.profilePath || null,
      ftp: entry.ftp || null,
    });
  }
  return map;
}

function resolveFeedSource(feed, serverMap) {
  const serverName = feed?.server ? String(feed.server) : null;
  const server = serverName ? serverMap.get(serverName) : null;
  const type = feed?.type || server?.type || (feed?.ftp ? 'ftp' : 'local');
  const profilePath = feed?.profilePath || server?.profilePath || null;
  const ftpConfig = feed?.ftp || server?.ftp || null;
  const rawPath = feed?.path || 'history.json';
  const resolvedPath = type === 'ftp'
    ? resolveRemotePathWithProfile(rawPath, profilePath)
    : resolveLocalPathWithProfile(rawPath, profilePath);

  return {
    type,
    path: resolvedPath,
    ftp: ftpConfig,
    server,
    serverName,
  };
}

function resolveStatePath(feed, isMulti, index) {
  if (feed?.statePath) {
    return resolveAbsolutePath(feed.statePath);
  }
  if (!isMulti) {
    return STATE_PATH;
  }
  const idSource = `${feed?.name || index}|${feed?.server || ''}|${feed?.path || ''}|${feed?.channelId || ''}|${feed?.serverName || ''}`;
  const hash = crypto.createHash('sha1').update(idSource).digest('hex').slice(0, 10);
  return path.resolve(process.cwd(), `.history_state.${hash}.json`);
}

function startHistoryFeed(client, config) {
  const envChannelId = process.env.HISTORY_CHANNEL_ID;
  const envPath = process.env.HISTORY_PATH;
  const envPollMs = process.env.POLL_MS;

  let feeds = normalizeHistoryFeeds(config);

  if (envChannelId || envPath) {
    const base = feeds[0] || {};
    feeds = [
      {
        ...base,
        channelId: envChannelId || base.channelId,
        path: envPath || base.path,
        pollMs: normalizePollMs(envPollMs, base.pollMs || DEFAULT_POLL_MS),
      },
    ];
  }

  if (feeds.length === 0) {
    console.warn('[history-feed] No history feeds configured.');
    return;
  }

  const isMulti = feeds.length > 1;
  const serverMap = buildServerMap(config);

  for (const [index, feed] of feeds.entries()) {
    const channelId = feed?.channelId && String(feed.channelId).trim();
    if (!channelId) {
      const label = feed?.name ? ` (${feed.name})` : '';
      console.warn(`[history-feed] Missing channelId${label}. Feed disabled.`);
      continue;
    }

    const source = resolveFeedSource(feed, serverMap);
    if (source.serverName && !source.server) {
      const label = feed?.name ? ` (${feed.name})` : '';
      console.warn(`[history-feed] Server not found${label}: ${source.serverName}`);
      continue;
    }
    if (!source.path) {
      const label = feed?.name ? ` (${feed.name})` : '';
      console.warn(`[history-feed] Invalid history path${label}.`);
      continue;
    }
    if (source.type === 'ftp' && !source.ftp) {
      const label = feed?.name ? ` (${feed.name})` : '';
      console.warn(`[history-feed] FTP config missing${label}.`);
      continue;
    }
    const pollMs = normalizePollMs(feed?.pollMs, DEFAULT_POLL_MS);
    const historyWindow = Math.max(1, Number(feed?.historyWindow) || 50);
    const maxTrackedKeys = Math.max(historyWindow, Number(feed?.maxTrackedKeys) || historyWindow * 20);
    const statePath = resolveStatePath(feed, isMulti, index);

    let statePromise = loadState(statePath);
    let isRunning = false;

    const tick = async () => {
      if (isRunning) {
        return;
      }
      isRunning = true;
      try {
        const state = await statePromise;
        const history = await readHistory(source);
        if (history === null) {
          return;
        }
        if (history === PARSE_ERROR) {
          return;
        }
        if (!Array.isArray(history)) {
          return;
        }

        const recentEntries = history.slice(-historyWindow);

        if (state.lastLen === null) {
          state.lastLen = history.length;
          for (const entry of recentEntries) {
            const key = buildEntryKey(entry);
            if (key) {
              state.sentKeys.add(key);
            }
          }
          pruneSentKeys(state.sentKeys, maxTrackedKeys);
          await saveState(statePath, state);
          return;
        }

        const entries = recentEntries.filter((entry) => {
          const key = buildEntryKey(entry);
          return key && !state.sentKeys.has(key);
        });

        if (entries.length === 0) {
          state.lastLen = history.length;
          await saveState(statePath, state);
          return;
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          console.warn('[history-feed] Channel not found or not text-based.');
          return;
        }

        for (const entry of entries) {
          const key = buildEntryKey(entry);
          if (!key || state.sentKeys.has(key)) {
            continue;
          }
          const embed = buildEmbed(entry, feed);
          await channel.send({ embeds: [embed] });
          state.sentKeys.add(key);
        }

        state.lastLen = history.length;
        pruneSentKeys(state.sentKeys, maxTrackedKeys);
        await saveState(statePath, state);
      } catch (err) {
        console.warn('[history-feed] Tick failed:', err);
      } finally {
        isRunning = false;
      }
    };

    tick();
    setInterval(() => {
      void tick();
    }, pollMs);
  }
}

module.exports = { startHistoryFeed };




