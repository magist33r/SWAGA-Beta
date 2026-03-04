const { EmbedBuilder } = require('discord.js');
const fetch = globalThis.fetch || require('node-fetch');
let CFToolsClientBuilder = null;
try {
  ({ CFToolsClientBuilder } = require('cftools-sdk'));
} catch (err) {
  CFToolsClientBuilder = null;
}

const DEFAULT_CFCLOUD_API_URL = 'https://data.cftools.cloud';
const LEGACY_CFCLOUD_API_HOST = 'api.cftools.cloud';
const SUPPORTED_STATISTICS = new Set([
  'kills',
  'deaths',
  'suicides',
  'playtime',
  'longest_kill',
  'longest_shot',
  'kdratio',
]);

function normalizeStatistic(value) {
  const normalized = String(value || 'kills').trim().toLowerCase();
  return SUPPORTED_STATISTICS.has(normalized) ? normalized : 'kills';
}

function normalizeCfCloudApiUrl(value) {
  const raw = String(value || DEFAULT_CFCLOUD_API_URL).trim();
  try {
    const parsed = new URL(raw);
    const wasLegacyHost = parsed.host.toLowerCase() === LEGACY_CFCLOUD_API_HOST;
    if (wasLegacyHost) {
      parsed.host = 'data.cftools.cloud';
    }
    return {
      url: parsed.toString().replace(/\/$/, ''),
      wasLegacyHost,
    };
  } catch (err) {
    return {
      url: DEFAULT_CFCLOUD_API_URL,
      wasLegacyHost: false,
    };
  }
}

function extractErrorDetails(payload, fallbackText) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.error === 'string' && payload.error.trim()) {
      if (
        payload.error === 'access-policy' &&
        payload['access-policy'] &&
        typeof payload['access-policy'].details === 'string'
      ) {
        return `${payload.error}:${payload['access-policy'].details}`;
      }
      return payload.error;
    }
    if (typeof payload.details === 'string' && payload.details.trim()) {
      return payload.details;
    }
  }
  if (!fallbackText) {
    return '';
  }
  return fallbackText.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function formatInteger(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('en-US');
}

function clipText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 1) {
    return text.slice(0, maxLength);
  }
  return `${text.slice(0, maxLength - 1)}~`;
}

function sanitizeInlineCode(value) {
  return String(value || '').replace(/`/g, "'");
}

function statisticLabel(statistic) {
  switch (statistic) {
    case 'kills':
      return 'Kills';
    case 'deaths':
      return 'Deaths';
    case 'suicides':
      return 'Suicides';
    case 'playtime':
      return 'Playtime';
    case 'longest_kill':
      return 'Longest Kill';
    case 'longest_shot':
      return 'Longest Shot';
    case 'kdratio':
      return 'K/D Ratio';
    default:
      return 'Kills';
  }
}

function padLeft(text, width) {
  return String(text).slice(0, width).padStart(width, ' ');
}

function padRight(text, width) {
  return String(text).slice(0, width).padEnd(width, ' ');
}

function padCenter(text, width) {
  const value = String(text).slice(0, width);
  const remaining = Math.max(0, width - value.length);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return `${' '.repeat(left)}${value}${' '.repeat(right)}`;
}

class LeaderboardGenerator {
  constructor(options = {}) {
    this.cfCloudApiKey = String(options.cfCloudApiKey || '').trim();
    this.cfCloudServerId = String(options.cfCloudServerId || '').trim();
    this.cfCloudApplicationId = String(options.cfCloudApplicationId || '').trim();
    this.cfCloudApplicationSecret = String(options.cfCloudApplicationSecret || '').trim();
    this.cfCloudEnterpriseToken = String(options.cfCloudEnterpriseToken || '').trim();
    this.statistic = normalizeStatistic(options.cfCloudStatistic);

    const normalizedApiUrl = normalizeCfCloudApiUrl(options.cfCloudApiUrl);
    this.cfCloudApiUrl = normalizedApiUrl.url;
    this.topCount = Math.max(1, Math.min(50, Number(options.topCount) || 10));
    this.updateInterval = Math.max(60000, Number(options.updateInterval) || 300000);
    this.cache = null;
    this.lastUpdate = 0;
    this.sdkClient = this.createSdkClient();

    if (normalizedApiUrl.wasLegacyHost) {
      console.warn(
        '[leaderboard] cfCloudApiUrl=api.cftools.cloud is blocked for bot requests, switched to data.cftools.cloud.'
      );
    }
  }

  createSdkClient() {
    if (!CFToolsClientBuilder) {
      return null;
    }
    if (!this.cfCloudApplicationId || !this.cfCloudApplicationSecret || !this.cfCloudServerId) {
      return null;
    }

    try {
      let builder = new CFToolsClientBuilder()
        .withServerApiId(this.cfCloudServerId)
        .withCredentials(this.cfCloudApplicationId, this.cfCloudApplicationSecret);
      if (this.cfCloudEnterpriseToken) {
        builder = builder.withEnterpriseApi(this.cfCloudEnterpriseToken);
      }
      return builder.build();
    } catch (err) {
      console.warn('[leaderboard] Failed to initialize cftools-sdk:', err?.message || err);
      return null;
    }
  }

  registerCustomFont() {
    // Kept for backward compatibility with previous module interface.
  }

  async fetchLeaderboardDataWithSdk() {
    const rows = await this.sdkClient.getLeaderboard({
      // cftools-sdk currently maps order direction opposite to API expectation.
      // Use ASC here to get "top/highest first" leaderboard values.
      order: 'ASC',
      statistic: this.statistic,
      limit: this.topCount,
    });
    return rows.map((entry) => ({
      name: entry?.name,
      kills: entry?.kills,
      deaths: entry?.deaths,
      kdratio: entry?.killDeathRatio,
      playtime: entry?.playtime,
      longest_kill: entry?.longestKill,
      hits: entry?.hits,
    }));
  }

  async fetchLeaderboardData() {
    if (this.sdkClient) {
      return this.fetchLeaderboardDataWithSdk();
    }
    if (!this.cfCloudApiKey) {
      throw new Error(
        'CF.Cloud credentials are missing. Set cfCloudApiKey, or cfCloudApplicationId + cfCloudApplicationSecret.'
      );
    }

    const endpoint = new URL(
      `/v1/server/${this.cfCloudServerId}/leaderboard`,
      `${this.cfCloudApiUrl}/`
    );
    endpoint.searchParams.set('stat', this.statistic);
    endpoint.searchParams.set('order', '-1');
    endpoint.searchParams.set('limit', String(this.topCount));

    const response = await fetch(
      endpoint.toString(),
      {
        headers: {
          Authorization: `Bearer ${this.cfCloudApiKey}`,
          Accept: 'application/json',
        },
      }
    );

    const bodyText = await response.text();
    let payload = null;
    if (bodyText) {
      try {
        payload = JSON.parse(bodyText);
      } catch (err) {
        payload = null;
      }
    }

    if (!response.ok) {
      const details = extractErrorDetails(payload, bodyText);
      const hint =
        response.status === 403 && details === 'invalid-token'
          ? ' (token invalid for Data API)'
          : '';
      throw new Error(`CF.Cloud API error: ${response.status}${details ? ` (${details})` : ''}${hint}`);
    }

    if (payload !== null) {
      return payload;
    }
    return {};
  }

  parseLeaderboardData(rawData) {
    const source = Array.isArray(rawData?.leaderboard)
      ? rawData.leaderboard
      : Array.isArray(rawData?.data)
      ? rawData.data
      : Array.isArray(rawData)
      ? rawData
      : [];

    return source.slice(0, this.topCount).map((player, index) => {
      const kills = Number(player?.kills) || 0;
      const deaths = Number(player?.deaths) || 0;
      const ratioRaw =
        player?.kdratio !== undefined && player?.kdratio !== null
          ? Number(player.kdratio)
          : deaths > 0
          ? kills / deaths
          : kills;
      const ratio = Number.isFinite(ratioRaw) ? ratioRaw.toFixed(2) : '0.00';
      const accuracyNum = Number(player?.accuracy);
      const accuracy = Number.isFinite(accuracyNum) ? `${Math.round(accuracyNum)}%` : 'N/A';
      const longestKill = Number(player?.longest_kill) || 0;
      const playtimeSec = Number(player?.playtime) || 0;

      return {
        rank: index + 1,
        name: String(player?.name || player?.username || 'Unknown'),
        kills,
        deaths,
        ratio,
        playtimeHours: Math.max(0, Math.floor(playtimeSec / 3600)),
        longestKillMeters: Math.max(0, Math.round(longestKill)),
        accuracy,
      };
    });
  }

  async updateLeaderboard(force = false) {
    const now = Date.now();
    if (!force && this.cache && now - this.lastUpdate < this.updateInterval) {
      return this.cache;
    }

    const rawData = await this.fetchLeaderboardData();
    const players = this.parseLeaderboardData(rawData);
    const payload = {
      generatedAtUnix: Math.floor(now / 1000),
      players,
    };

    this.cache = payload;
    this.lastUpdate = now;
    return payload;
  }

  buildLeaderboardEmbed(payload, options = {}) {
    const players = Array.isArray(payload?.players) ? payload.players : [];
    const generatedAt = Number(payload?.generatedAtUnix) || Math.floor(Date.now() / 1000);
    const serverName = String(options.serverName || '').trim();

    let description = 'No data';
    if (players.length > 0) {
      const separator = '\u2796';
      const lines = [`## **#**  ${separator} K/D  ${separator} Player:`];

      for (const player of players) {
        const row =
          `\`\u2116${player.rank}\` ${separator} ` +
          `\`${formatInteger(player.kills)}/${formatInteger(player.deaths)}\` ${separator} ` +
          `\`${sanitizeInlineCode(clipText(player.name, 42))}\``;

        if (`${lines.join('\n')}\n${row}`.length > 3900) {
          break;
        }
        lines.push(row);
      }

      description = lines.join('\n');
    }

    return new EmbedBuilder()
      .setDescription(description)
      .setColor(0xffffff)
      .setFooter({
        text: serverName
          ? `\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u2022 ${serverName}`
          : '\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435',
      })
      .setTimestamp(generatedAt * 1000);
  }

  async autoPostLeaderboard(channel, interval = 3600000, options = {}) {
    const post = async () => {
      try {
        const payload = await this.updateLeaderboard(true);
        const embed = this.buildLeaderboardEmbed(payload, {
          refreshed: true,
          serverName: options.serverName,
        });
        await channel.send({ embeds: [embed] });
      } catch (err) {
        console.warn('[leaderboard] auto-post failed:', err?.message || err);
      }
    };

    setInterval(() => {
      void post();
    }, Math.max(60000, Number(interval) || 3600000));
  }
}

module.exports = LeaderboardGenerator;
