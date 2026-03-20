'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const PImage = require('pureimage');
const { AttachmentBuilder } = require('discord.js');

const fetch = require('node-fetch');

// ── Steam avatar fetch ────────────────────────────────────────────────────────
async function fetchSteamAvatarBuffer(steam64, steamApiKey) {
  if (!steamApiKey) return null;
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${steam64}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const player = data?.response?.players?.[0];
    // avatarfull = 184x184, use it
    const avatarUrl = player?.avatarfull || player?.avatarmedium;
    if (!avatarUrl) return null;

    const imgRes = await fetch(avatarUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) return null;
    const arrayBuf = await imgRes.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

async function decodeSteamAvatar(buffer) {
  if (!buffer) return null;
  try {
    const tmpPath = require('path').join(require('os').tmpdir(), `swga-av-${Date.now()}.jpg`);
    await require('fs/promises').writeFile(tmpPath, buffer);
    const img = await PImage.decodeJPEGFromStream(require('fs').createReadStream(tmpPath));
    await require('fs/promises').unlink(tmpPath).catch(() => {});
    return img;
  } catch {
    return null;
  }
}

const CARD_WIDTH = 1240;
const CARD_HEIGHT = 380;
const PHOTO_WIDTH = 400;
const CONTENT_X = PHOTO_WIDTH + 20;
const CONTENT_RIGHT_PADDING = 24;
const CONTENT_TOP = 20;
const CONTENT_BOTTOM = 20;
const CELL_GAP = 10;

const FONT_CANDIDATES_REGULAR = [
  'C:/Windows/Fonts/calibri.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/tahoma.ttf',
  'C:/Windows/Fonts/arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

const FONT_CANDIDATES_BOLD = [
  'C:/Windows/Fonts/calibrib.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/tahomabd.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

const HIT_ZONE_MAP_RU = {
  head: 'Голова',
  brain: 'Голова',
  torso: 'Торс',
  chest: 'Грудь',
  neck: 'Шея',
  leftarm: 'Лев. рука',
  rightarm: 'Прав. рука',
  leftleg: 'Лев. нога',
  rightleg: 'Прав. нога',
};

const HIT_ZONE_MAP_EN = {
  head: 'Head',
  brain: 'Head',
  torso: 'Torso',
  chest: 'Chest',
  neck: 'Neck',
  leftarm: 'Left arm',
  rightarm: 'Right arm',
  leftleg: 'Left leg',
  rightleg: 'Right leg',
};

const TEXT_RU = {
  labels: {
    kills: 'Убил игроков',
    deaths: 'Умер',
    zombies: 'Убил зомби',
    kd: 'КД',
    sessions: 'Сессий',
    longest: 'Дал. убийство',
    playtime: 'В игре',
    hitZone: 'Попадает в',
  },
  messages: {
    notConfigured: '⚠️ Статистика не настроена. Заполните блок "stats" в config.json.',
    badSteam: '❌ Неверный SteamID64. Нужны 17 цифр, начиная с 7656119.',
    invalidServer: '❌ Сервер "{server}" не найден. Доступно: {servers}.',
    noStats: '❌ Статистика для этого игрока не найдена.',
    noPlayer: '❌ Игрок не найден в CFTools.',
    fetchError: '⚠️ Не удалось получить статистику. Попробуйте позже.',
  },
  units: {
    day: 'д',
    hour: 'ч',
    meter: 'м',
    kilometer: 'км',
  },
};

const TEXT_EN = {
  labels: {
    kills: 'Player kills',
    deaths: 'Deaths',
    zombies: 'Zombie kills',
    kd: 'K/D',
    sessions: 'Sessions',
    longest: 'Longest kill',
    playtime: 'Playtime',
    hitZone: 'Most hit zone',
  },
  messages: {
    notConfigured: '⚠️ Stats are not configured. Fill the "stats" block in config.json.',
    badSteam: '❌ Invalid SteamID64. It must be 17 digits and start with 7656119.',
    invalidServer: '❌ Server "{server}" was not found. Available: {servers}.',
    noStats: '❌ No stats found for this player.',
    noPlayer: '❌ Player not found in CFTools.',
    fetchError: '⚠️ Failed to fetch stats. Try again later.',
  },
  units: {
    day: 'd',
    hour: 'h',
    meter: 'm',
    kilometer: 'km',
  },
};

let fontsLoadPromise = null;
let regularFamily = null;
let boldFamily = null;

function pickFontPath(candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function ensureFontsLoaded() {
  if (fontsLoadPromise) {
    return fontsLoadPromise;
  }

  fontsLoadPromise = (async () => {
    const regularPath = pickFontPath(FONT_CANDIDATES_REGULAR);
    const boldPath = pickFontPath(FONT_CANDIDATES_BOLD);

    if (regularPath) {
      regularFamily = 'StatsRegular';
      await PImage.registerFont(regularPath, regularFamily).load();
    }
    if (boldPath) {
      boldFamily = 'StatsBold';
      await PImage.registerFont(boldPath, boldFamily).load();
    }
  })().catch((err) => {
    fontsLoadPromise = null;
    throw err;
  });

  return fontsLoadPromise;
}

function setFont(ctx, size, isBold) {
  const family = isBold ? boldFamily || regularFamily : regularFamily || boldFamily;
  if (family) {
    ctx.font = `${size}pt "${family}"`;
    return;
  }
  ctx.font = `${size}pt sans-serif`;
}

function formatMessage(template, values = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (full, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return full;
  });
}

function normalizeServerSelector(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeName(value) {
  const trimmed = String(value || 'Unknown').trim();
  return (trimmed || 'Unknown').slice(0, 36);
}

function normalizeZoneName(rawZone, lang) {
  const key = String(rawZone || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!key) {
    return '-';
  }
  const map = lang === 'ru' ? HIT_ZONE_MAP_RU : HIT_ZONE_MAP_EN;
  return map[key] || String(rawZone).slice(0, 14);
}

function formatKd(kills, deaths) {
  const k = toNumber(kills, 0);
  const d = toNumber(deaths, 0);
  if (d <= 0) {
    return k.toFixed(2);
  }
  return (k / d).toFixed(2);
}

function formatPlaytime(seconds, langText) {
  const totalHours = Math.max(0, Math.floor(toNumber(seconds, 0) / 3600));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) {
    return `${days}${langText.units.day} ${hours}${langText.units.hour}`;
  }
  if (days > 0) {
    return `${days}${langText.units.day}`;
  }
  return `${hours}${langText.units.hour}`;
}

function formatDistance(meters, langText) {
  const value = Math.max(0, Math.floor(toNumber(meters, 0)));
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}${langText.units.kilometer}`;
  }
  return `${value}${langText.units.meter}`;
}

function pickFirstNumber(source, keys) {
  for (const key of keys) {
    const parts = key.split('.');
    let current = source;
    for (const part of parts) {
      current = current && typeof current === 'object' ? current[part] : undefined;
    }
    if (current !== undefined && current !== null && current !== '') {
      const value = Number(current);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return 0;
}

function getByPath(source, keyPath) {
  const parts = keyPath.split('.');
  let current = source;
  for (const part of parts) {
    current = current && typeof current === 'object' ? current[part] : undefined;
  }
  return current;
}

function pickFirstString(source, keys, fallback = '') {
  for (const key of keys) {
    const rawValue = getByPath(source, key);
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    const value = String(rawValue).trim();
    if (value) {
      return value;
    }
  }
  return fallback;
}

function pickFirstObject(source, keys, fallback = {}) {
  for (const key of keys) {
    const rawValue = getByPath(source, key);
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      return rawValue;
    }
  }
  return fallback;
}

function pickLastNonEmptyString(source, keys, fallback = '') {
  for (const key of keys) {
    const rawValue = getByPath(source, key);
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      continue;
    }
    for (let index = rawValue.length - 1; index >= 0; index -= 1) {
      const value = String(rawValue[index] || '').trim();
      if (value) {
        return value;
      }
    }
  }
  return fallback;
}

function findPrimaryRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload || {};
  }

  for (const [key, value] of Object.entries(payload)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    if (key === 'identities' || key === 'status' || key === 'error') {
      continue;
    }
    if (
      value.game ||
      value.omega ||
      value.player ||
      value.profile ||
      value.stats ||
      value.statistics
    ) {
      return value;
    }
  }

  return payload;
}

function unwrapStatsPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const queue = [raw];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const entry of current) {
        queue.push(entry);
      }
      continue;
    }

    const hasGame = current.game && typeof current.game === 'object';
    const hasPlayer = current.player && typeof current.player === 'object';
    const hasStats = current.stats && typeof current.stats === 'object';
    const hasDirectStats =
      Object.prototype.hasOwnProperty.call(current, 'kills') ||
      Object.prototype.hasOwnProperty.call(current, 'deaths') ||
      Object.prototype.hasOwnProperty.call(current, 'playtime') ||
      Object.prototype.hasOwnProperty.call(current, 'sessions') ||
      Object.prototype.hasOwnProperty.call(current, 'longest_kill');

    if (hasGame || hasPlayer || hasStats || hasDirectStats) {
      return current;
    }

    if (current.result !== undefined) {
      queue.push(current.result);
    }
    if (current.data !== undefined) {
      queue.push(current.data);
    }
    if (current.attributes !== undefined) {
      queue.push(current.attributes);
    }
    if (current.items !== undefined) {
      queue.push(current.items);
    }

    // Some CFTools responses keep stats under dynamic IDs, so traverse all object children.
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return raw;
}

function createSeededRandom(seedText) {
  let seed = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function drawVerticalGradient(ctx, width, height, topColor, bottomColor) {
  for (let y = 0; y < height; y += 1) {
    const ratio = y / Math.max(1, height - 1);
    const r = Math.round(topColor[0] + (bottomColor[0] - topColor[0]) * ratio);
    const g = Math.round(topColor[1] + (bottomColor[1] - topColor[1]) * ratio);
    const b = Math.round(topColor[2] + (bottomColor[2] - topColor[2]) * ratio);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, width, 1);
  }
}

function drawNoise(ctx, seedText) {
  const rng = createSeededRandom(seedText);
  for (let i = 0; i < 4800; i += 1) {
    const x = Math.floor(rng() * CARD_WIDTH);
    const y = Math.floor(rng() * CARD_HEIGHT);
    const alpha = 0.01 + rng() * 0.05;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle = null) {
  const drawX = Math.round(x);
  const drawY = Math.round(y);
  const drawW = Math.max(1, Math.round(width));
  const drawH = Math.max(1, Math.round(height));
  ctx.fillStyle = fillStyle;
  ctx.fillRect(drawX, drawY, drawW, drawH);
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.strokeRect(drawX, drawY, drawW, drawH);
  }
}

function drawSideBar(ctx) {
  for (let y = 0; y < CARD_HEIGHT; y += 1) {
    const ratio = y / Math.max(1, CARD_HEIGHT - 1);
    const r = Math.round(240 - ratio * 45);
    const g = Math.round(112 - ratio * 38);
    const b = Math.round(32 - ratio * 24);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, 5, 1);
  }
}

function drawPhotoFade(ctx) {
  for (let x = 0; x < 170; x += 1) {
    const ratio = x / 170;
    const alpha = 0.62 * ratio;
    ctx.fillStyle = `rgba(24,20,16,${alpha.toFixed(3)})`;
    ctx.fillRect(PHOTO_WIDTH - 170 + x, 0, 1, CARD_HEIGHT);
  }
}

function drawRightFade(ctx, startX) {
  const width = CARD_WIDTH - startX;
  for (let x = 0; x < width; x += 1) {
    const ratio = x / Math.max(1, width - 1);
    const alpha = 0.08 + ratio * 0.46;
    ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
    ctx.fillRect(startX + x, 0, 1, CARD_HEIGHT);
  }
}

function drawFallbackPhoto(ctx) {
  drawVerticalGradient(ctx, PHOTO_WIDTH, CARD_HEIGHT, [30, 22, 16], [9, 9, 11]);

  for (let i = 0; i < 140; i += 1) {
    const alpha = 0.18 * (1 - i / 140);
    ctx.fillStyle = `rgba(240,112,32,${alpha.toFixed(3)})`;
    ctx.fillRect(i * 2.8, 0, 2, CARD_HEIGHT);
  }

  ctx.fillStyle = 'rgba(255,220,170,0.08)';
  ctx.beginPath();
  ctx.moveTo(20, CARD_HEIGHT - 16);
  ctx.lineTo(125, 108);
  ctx.lineTo(280, 34);
  ctx.lineTo(384, CARD_HEIGHT - 20);
  ctx.closePath();
  ctx.fill();
}

async function decodeImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') {
    return PImage.decodePNGFromStream(fs.createReadStream(filePath));
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return PImage.decodeJPEGFromStream(fs.createReadStream(filePath));
  }
  throw new Error(`Unsupported image type: ${ext}`);
}

function drawCoverImage(ctx, image, targetX, targetY, targetW, targetH) {
  const srcW = image.width;
  const srcH = image.height;
  if (!srcW || !srcH) {
    return;
  }

  const srcRatio = srcW / srcH;
  const dstRatio = targetW / targetH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcRatio > dstRatio) {
    sw = Math.floor(srcH * dstRatio);
    sx = Math.floor((srcW - sw) / 2);
  } else if (srcRatio < dstRatio) {
    sh = Math.floor(srcW / dstRatio);
    sy = Math.floor((srcH - sh) / 2);
  }

  ctx.drawImage(image, sx, sy, sw, sh, targetX, targetY, targetW, targetH);
}

// ── Icon drawing helpers ───────────────────────────────────────────────────

function drawIconSkull(ctx, cx, cy, r) {
  ctx.fillStyle = '#F07020';
  // cranium
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r * 0.72, Math.PI, 0);
  ctx.quadraticCurveTo(cx + r * 0.72, cy + r * 0.55, cx + r * 0.4, cy + r * 0.6);
  ctx.lineTo(cx - r * 0.4, cy + r * 0.6);
  ctx.quadraticCurveTo(cx - r * 0.72, cy + r * 0.55, cx - r * 0.72, cy - r * 0.1);
  ctx.fill();
  // eye sockets
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(cx - r * 0.25, cy + r * 0.08, r * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.25, cy + r * 0.08, r * 0.18, 0, Math.PI * 2); ctx.fill();
  // teeth
  ctx.fillStyle = '#F07020';
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(cx + i * r * 0.22 - r * 0.08, cy + r * 0.6, r * 0.14, r * 0.28);
  }
}

function drawIconGrave(ctx, cx, cy, r) {
  ctx.fillStyle = '#F07020';
  // headstone rounded top
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.2, r * 0.46, Math.PI, 0);
  ctx.lineTo(cx + r * 0.46, cy + r * 0.35);
  ctx.lineTo(cx - r * 0.46, cy + r * 0.35);
  ctx.closePath();
  ctx.fill();
  // base plinth
  ctx.fillRect(cx - r * 0.55, cy + r * 0.35, r * 1.1, r * 0.22);
  // cross
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(cx - r * 0.06, cy - r * 0.55, r * 0.12, r * 0.55);
  ctx.fillRect(cx - r * 0.22, cy - r * 0.38, r * 0.44, r * 0.12);
}

function drawIconZombie(ctx, cx, cy, r) {
  ctx.fillStyle = '#F07020';
  // jagged mouth shape
  const pts = [
    [cx - r*0.72, cy - r*0.1],
    [cx - r*0.36, cy + r*0.65],
    [cx - r*0.18, cy + r*0.18],
    [cx, cy + r*0.65],
    [cx + r*0.18, cy + r*0.18],
    [cx + r*0.36, cy + r*0.65],
    [cx + r*0.72, cy - r*0.1],
    [cx + r*0.48, cy - r*0.72],
    [cx, cy - r*0.35],
    [cx - r*0.48, cy - r*0.72],
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  // eyes
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath(); ctx.arc(cx - r*0.22, cy - r*0.28, r*0.13, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r*0.22, cy - r*0.28, r*0.13, 0, Math.PI*2); ctx.fill();
}

function drawIconKD(ctx, cx, cy, r) {
  ctx.strokeStyle = '#F07020';
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = 'round';
  // tilde-like wave
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy + r * 0.15);
  ctx.bezierCurveTo(cx - r * 0.35, cy - r * 0.45, cx + r * 0.1, cy + r * 0.45, cx + r * 0.55, cy - r * 0.2);
  ctx.stroke();
  // arrow right
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.42, cy - r * 0.52);
  ctx.lineTo(cx + r * 0.78, cy - r * 0.2);
  ctx.lineTo(cx + r * 0.42, cy + r * 0.12);
  ctx.stroke();
}

function drawIconSessions(ctx, cx, cy, r) {
  ctx.strokeStyle = '#F07020';
  ctx.fillStyle = '#F07020';
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = 'round';
  // door frame
  ctx.strokeRect(cx - r * 0.5, cy - r * 0.72, r, r * 1.44);
  // arrow entering
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.2, cy);
  ctx.lineTo(cx + r * 0.75, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.45, cy - r * 0.28);
  ctx.lineTo(cx + r * 0.75, cy);
  ctx.lineTo(cx + r * 0.45, cy + r * 0.28);
  ctx.stroke();
}

function drawIconTarget(ctx, cx, cy, r) {
  ctx.strokeStyle = '#F07020';
  ctx.lineWidth = r * 0.15;
  // outer ring
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  // inner ring
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2); ctx.stroke();
  // center dot
  ctx.fillStyle = '#F07020';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2); ctx.fill();
  // crosshair lines
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.96); ctx.lineTo(cx, cy - r * 0.76);
  ctx.moveTo(cx, cy + r * 0.76); ctx.lineTo(cx, cy + r * 0.96);
  ctx.moveTo(cx - r * 0.96, cy); ctx.lineTo(cx - r * 0.76, cy);
  ctx.moveTo(cx + r * 0.76, cy); ctx.lineTo(cx + r * 0.96, cy);
  ctx.stroke();
}

function drawIconClock(ctx, cx, cy, r) {
  ctx.strokeStyle = '#F07020';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.lineCap = 'round';
  // hour hand
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.46); ctx.stroke();
  // minute hand
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.34, cy + r * 0.22); ctx.stroke();
}

function drawIconBody(ctx, cx, cy, r) {
  ctx.fillStyle = '#F07020';
  // head
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.56, r * 0.26, 0, Math.PI * 2); ctx.fill();
  // torso highlight (chest)
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.38, cy - r * 0.22);
  ctx.lineTo(cx + r * 0.38, cy - r * 0.22);
  ctx.lineTo(cx + r * 0.30, cy + r * 0.48);
  ctx.lineTo(cx - r * 0.30, cy + r * 0.48);
  ctx.closePath();
  ctx.fill();
  // arms
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = '#F07020';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.38, cy - r * 0.1);
  ctx.lineTo(cx - r * 0.72, cy + r * 0.42);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.38, cy - r * 0.1);
  ctx.lineTo(cx + r * 0.72, cy + r * 0.42);
  ctx.stroke();
}

const ICON_DRAW_FNS = {
  K: drawIconSkull,
  D: drawIconGrave,
  Z: drawIconZombie,
  KD: drawIconKD,
  S: drawIconSessions,
  L: drawIconTarget,
  T: drawIconClock,
  H: drawIconBody,
};

function drawIcon(ctx, iconKey, cx, cy, r) {
  const fn = ICON_DRAW_FNS[iconKey];
  if (fn) {
    ctx.save();
    fn(ctx, cx, cy, r);
    ctx.restore();
  }
}

// ── Stat cell ───────────────────────────────────────────────────────────────

function drawStatCell(ctx, options) {
  const { x, y, width, height, label, value, icon, big } = options;

  fillRoundedRect(
    ctx, x, y, width, height, 8,
    'rgba(255,255,255,0.04)',
    'rgba(255,255,255,0.07)'
  );

  // label
  setFont(ctx, big ? 13 : 12, false);
  ctx.fillStyle = '#AAAAAA';
  ctx.fillText(label, x + 12, y + 22);

  // icon — drawn via canvas paths, not text
  const iconR = big ? 15 : 11;
  const iconCX = x + 16 + iconR;
  const iconCY = y + height - 18 - iconR * 0.3;
  drawIcon(ctx, icon, iconCX, iconCY, iconR);

  // value
  const valueX = x + 16 + iconR * 2 + 12;
  setFont(ctx, big ? 36 : 28, true);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(String(value), valueX, y + height - 14);
}

function normalizeStats(raw, langText, lang, fallbackName = '') {
  const payload = unwrapStatsPayload(raw);
  const record = findPrimaryRecord(payload);
  const game = pickFirstObject(record, [
    'game.dayz',
    'game',
    'stats.dayz',
    'stats',
    'statistics.dayz',
    'statistics',
    'attributes.game',
    'attributes.stats',
  ]);
  const player = pickFirstObject(record, [
    'omega',
    'player',
    'profile',
    'identity',
    'attributes.player',
    'attributes.profile',
  ]);
  const hitZones = pickFirstObject(record, [
    'game.dayz.zones',
    'game.dayz.hit_zones',
    'game.zones',
    'game.hit_zones',
    'stats.zones',
    'stats.hit_zones',
    'statistics.zones',
    'statistics.hit_zones',
    'zones',
    'hit_zones',
  ]);

  let topZone = '-';
  let topHits = -1;
  for (const [zoneName, hits] of Object.entries(hitZones)) {
    const numericHits = toNumber(hits, 0);
    if (numericHits > topHits) {
      topHits = numericHits;
      topZone = zoneName;
    }
  }
  if (topHits < 0) {
    topZone = pickFirstString(record, [
      'game.most_hit_zone',
      'game.dayz.most_hit_zone',
      'stats.most_hit_zone',
      'statistics.most_hit_zone',
      'most_hit_zone',
    ], '-');
  }

  const kills = pickFirstNumber(record, [
    'game.dayz.kills.players',
    'game.kills.players',
    'stats.kills.players',
    'statistics.kills.players',
    'game.kills',
    'stats.kills',
    'statistics.kills',
    'kills',
    'player.kills',
  ]);
  const deaths = pickFirstNumber(record, [
    'game.dayz.deaths',
    'game.deaths',
    'stats.deaths',
    'statistics.deaths',
    'deaths',
    'player.deaths',
  ]);
  const sessions = pickFirstNumber(record, [
    'omega.sessions',
    'player.sessions',
    'profile.sessions',
    'sessions',
    'game.sessions',
    'stats.sessions',
  ]);
  const playtime = pickFirstNumber(record, [
    'omega.playtime',
    'player.playtime',
    'player.play_time',
    'profile.playtime',
    'profile.play_time',
    'playtime',
    'stats.playtime',
    'game.playtime',
  ]);
  const longestKill = pickFirstNumber(record, [
    'game.dayz.longest_kill',
    'game.dayz.longest_shot',
    'game.longest_kill',
    'game.longestKill',
    'stats.longest_kill',
    'statistics.longest_kill',
    'longest_kill',
    'longestKill',
  ]);
  const zombies = pickFirstNumber(record, [
    'game.dayz.kills.infected',
    'game.dayz.kills.ai',
    'game.kills.infected',
    'game.kills.ai',
    'game.infected_kills',
    'game.zombies_killed',
    'game.zombie_kills',
    'game.killed_infected',
    'game.zeds_killed',
    'game.zeds',
    'stats.infected_kills',
    'stats.zombies_killed',
    'statistics.infected_kills',
    'statistics.zombies_killed',
    'infected_kills',
    'zombies_killed',
  ]);

  const resolvedName = pickFirstString(record, [
    'player.name',
    'omega.name',
    'player.username',
    'profile.name',
    'identity.name',
    'name',
    'attributes.player_name',
    'attributes.name',
  ], pickLastNonEmptyString(record, ['omega.name_history'], fallbackName || player.name || 'Unknown'));

  const hasAnyStatsStructure = Boolean(
    record &&
      typeof record === 'object' &&
      (
        (game && Object.keys(game).length > 0) ||
        (player && Object.keys(player).length > 0) ||
        Object.keys(hitZones).length > 0
      )
  );
  const hasMetrics =
    kills > 0 ||
    deaths > 0 ||
    zombies > 0 ||
    sessions > 0 ||
    playtime > 0 ||
    longestKill > 0 ||
    topZone !== '-' ||
    hasAnyStatsStructure;

  return {
    name: sanitizeName(resolvedName || 'Unknown'),
    kills: String(Math.max(0, Math.floor(kills))),
    deaths: String(Math.max(0, Math.floor(deaths))),
    zombies: String(Math.max(0, Math.floor(zombies))),
    kd: formatKd(kills, deaths),
    sessions: String(Math.max(0, Math.floor(sessions))),
    longest: formatDistance(longestKill, langText),
    playtime: formatPlaytime(playtime, langText),
    hitZone: normalizeZoneName(topZone, lang),
    hasMetrics,
  };
}

function detectLanguage(interaction) {
  const locale = String(interaction?.locale || interaction?.guildLocale || '').toLowerCase();
  if (locale.startsWith('ru')) {
    return 'ru';
  }
  return 'en';
}

class CFToolsClient {
  constructor(options) {
    this.applicationId = String(options.applicationId || '').trim();
    this.applicationSecret = String(options.applicationSecret || '').trim();
    this.serverId = String(options.serverId || '').trim();
    this.apiUrl = String(options.apiUrl || 'https://data.cftools.cloud').replace(/\/$/, '');
    this.token = null;
    this.tokenExpiryMs = 0;
  }

  async getToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiryMs - 30000) {
      return this.token;
    }

    const response = await fetch(`${this.apiUrl}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id: this.applicationId,
        secret: this.applicationSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`CFTools auth failed: ${response.status} ${body}`);
    }

    const payload = await response.json();
    this.token = payload.token;
    const expirySeconds = Number(payload.expiry) || 86340;
    this.tokenExpiryMs = now + expirySeconds * 1000;
    return this.token;
  }

  async getPlayerStats(steam64, serverIdOverride = '') {
    const token = await this.getToken();
    const serverId = String(serverIdOverride || this.serverId || '').trim();
    if (!serverId) {
      throw new Error('STATS_SERVER_NOT_CONFIGURED');
    }

    const lookupResponse = await fetch(
      `${this.apiUrl}/v1/users/lookup?identifier=${encodeURIComponent(steam64)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!lookupResponse.ok) {
      if (lookupResponse.status === 404) {
        throw new Error('NO_STATS');
      }
      throw new Error(`CFTools lookup failed: ${lookupResponse.status}`);
    }

    const lookup = await lookupResponse.json();
    const cftoolsId = lookup?.cftools_id;
    if (!cftoolsId) {
      throw new Error('PLAYER_NOT_FOUND');
    }

    const statsResponse = await fetch(
      `${this.apiUrl}/v2/server/${serverId}/player?cftools_id=${encodeURIComponent(cftoolsId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!statsResponse.ok) {
      if (statsResponse.status === 404) {
        throw new Error('NO_STATS');
      }
      throw new Error(`CFTools stats failed: ${statsResponse.status}`);
    }
    const statsPayload = await statsResponse.json();
    const lookupName = String(
      lookup?.name || lookup?.username || lookup?.display_name || ''
    ).trim();
    return {
      statsPayload,
      lookupName,
      serverId,
    };
  }
}

class StatsCard {
  constructor(config) {
    const statsConfig = config?.stats && typeof config.stats === 'object' ? config.stats : {};
    const leaderboardConfig =
      config?.leaderboard && typeof config.leaderboard === 'object' ? config.leaderboard : {};
    const firstLeaderboardServer =
      Array.isArray(leaderboardConfig.servers) && leaderboardConfig.servers[0]
        ? leaderboardConfig.servers[0]
        : {};

    const source = {
      cfCloudApplicationId:
        statsConfig.cfCloudApplicationId ||
        firstLeaderboardServer.cfCloudApplicationId ||
        leaderboardConfig.cfCloudApplicationId ||
        '',
      cfCloudApplicationSecret:
        statsConfig.cfCloudApplicationSecret ||
        firstLeaderboardServer.cfCloudApplicationSecret ||
        leaderboardConfig.cfCloudApplicationSecret ||
        '',
      cfCloudServerId:
        statsConfig.cfCloudServerId ||
        firstLeaderboardServer.cfCloudServerId ||
        leaderboardConfig.cfCloudServerId ||
        '',
      cfCloudApiUrl:
        statsConfig.cfCloudApiUrl ||
        firstLeaderboardServer.cfCloudApiUrl ||
        leaderboardConfig.cfCloudApiUrl ||
        'https://data.cftools.cloud',
      backgroundImagePath:
        statsConfig.backgroundImagePath ||
        statsConfig.backgroundImage ||
        firstLeaderboardServer.backgroundImagePath ||
        '',
      titlePrefix: statsConfig.titlePrefix || '',
      steamApiKey:
        statsConfig.steamApiKey ||
        firstLeaderboardServer.steamApiKey ||
        '',
    };

    const configuredServerIds = [];
    const pushServerId = (value) => {
      const id = String(value || '').trim();
      if (!id) {
        return;
      }
      if (!configuredServerIds.includes(id)) {
        configuredServerIds.push(id);
      }
    };
    const serverLookup = new Map();
    const knownServers = [];
    const addServerToken = (token, serverId) => {
      const key = normalizeServerSelector(token);
      const id = String(serverId || '').trim();
      if (!key || !id) {
        return;
      }
      if (!serverLookup.has(key)) {
        serverLookup.set(key, id);
      }
    };
    const addKnownServer = (entry, index) => {
      const serverId = String(entry?.cfCloudServerId || '').trim();
      if (!serverId) {
        return;
      }
      const key = String(entry?.key || `s${index + 1}`).trim();
      const name = String(entry?.name || key).trim() || key;
      knownServers.push({ key, name, serverId });
      addServerToken(key, serverId);
      addServerToken(name, serverId);
      pushServerId(serverId);
    };

    pushServerId(source.cfCloudServerId);
    addServerToken('default', source.cfCloudServerId);
    if (Array.isArray(statsConfig.serverIds)) {
      for (const id of statsConfig.serverIds) {
        pushServerId(id);
      }
    }
    if (Array.isArray(leaderboardConfig.servers)) {
      for (let index = 0; index < leaderboardConfig.servers.length; index += 1) {
        addKnownServer(leaderboardConfig.servers[index], index);
      }
    }

    this.client = new CFToolsClient({
      applicationId: source.cfCloudApplicationId,
      applicationSecret: source.cfCloudApplicationSecret,
      serverId: source.cfCloudServerId,
      apiUrl: source.cfCloudApiUrl,
    });

    this.enabled = Boolean(
      source.cfCloudApplicationId && source.cfCloudApplicationSecret && configuredServerIds.length
    );
    this.serverIds = configuredServerIds;
    this.knownServers = knownServers;
    this.serverLookup = serverLookup;

    this.backgroundImagePath = String(source.backgroundImagePath || '').trim();
    this.titlePrefix = String(source.titlePrefix || '').trim();
    this.steamApiKey = String(source.steamApiKey || statsConfig.steamApiKey || '').trim();
    this.backgroundImage = null;
    this.backgroundImageLoaded = false;
  }

  resolveServerId(selector) {
    const key = normalizeServerSelector(selector);
    if (!key) {
      return '';
    }
    return this.serverLookup.get(key) || '';
  }

  getAvailableServerKeys() {
    if (!this.knownServers.length) {
      return this.serverIds.map((serverId) => String(serverId).trim()).filter(Boolean);
    }
    return this.knownServers.map((entry) => entry.key).filter(Boolean);
  }

  async loadBackgroundImage() {
    if (this.backgroundImageLoaded) {
      return this.backgroundImage;
    }
    this.backgroundImageLoaded = true;

    if (!this.backgroundImagePath) {
      return null;
    }

    const resolvedPath = path.isAbsolute(this.backgroundImagePath)
      ? this.backgroundImagePath
      : path.resolve(process.cwd(), this.backgroundImagePath);

    try {
      this.backgroundImage = await decodeImageFile(resolvedPath);
    } catch (err) {
      console.warn('[stats-card] Failed to load background image:', err?.message || err);
      this.backgroundImage = null;
    }

    return this.backgroundImage;
  }

  async renderCard(normalized, langText, avatarImage = null) {
    await ensureFontsLoaded().catch(() => {});

    const image = PImage.make(CARD_WIDTH, CARD_HEIGHT);
    const ctx = image.getContext('2d');

    drawVerticalGradient(ctx, CARD_WIDTH, CARD_HEIGHT, [24, 20, 16], [9, 9, 11]);
    drawNoise(ctx, normalized.name);
    drawSideBar(ctx);

    // Photo: avatar > background image > fallback
    const backgroundImage = await this.loadBackgroundImage();
    if (avatarImage) {
      drawCoverImage(ctx, avatarImage, 0, 0, PHOTO_WIDTH, CARD_HEIGHT);
    } else if (backgroundImage) {
      drawCoverImage(ctx, backgroundImage, 0, 0, PHOTO_WIDTH, CARD_HEIGHT);
    } else {
      drawFallbackPhoto(ctx);
    }

    drawPhotoFade(ctx);
    drawRightFade(ctx, CONTENT_X - 20);

    const panelX = CONTENT_X;
    const panelY = CONTENT_TOP;
    const panelW = CARD_WIDTH - CONTENT_X - CONTENT_RIGHT_PADDING;
    const panelH = CARD_HEIGHT - CONTENT_TOP - CONTENT_BOTTOM;
    fillRoundedRect(ctx, panelX, panelY, panelW, panelH, 8, 'rgba(9,9,12,0.35)');

    const left = panelX + 18;
    const usableW = panelW - 36;

    setFont(ctx, 36, true);
    ctx.fillStyle = '#FFFFFF';
    const title = this.titlePrefix ? `${this.titlePrefix} ${normalized.name}` : normalized.name;
    ctx.fillText(title, left, 78);

    const row1Y = 108;
    const bigH = 88;
    const row2Y = row1Y + bigH + CELL_GAP;
    const smallH = 72;
    const row3Y = row2Y + smallH + CELL_GAP;

    const col3 = Math.floor((usableW - CELL_GAP * 2) / 3);
    const col2 = Math.floor((usableW - CELL_GAP) / 2);

    const labels = langText.labels;

    drawStatCell(ctx, {
      x: left,
      y: row1Y,
      width: col3,
      height: bigH,
      label: labels.kills,
      value: normalized.kills,
      icon: 'K',
      big: true,
    });
    drawStatCell(ctx, {
      x: left + col3 + CELL_GAP,
      y: row1Y,
      width: col3,
      height: bigH,
      label: labels.deaths,
      value: normalized.deaths,
      icon: 'D',
      big: true,
    });
    drawStatCell(ctx, {
      x: left + (col3 + CELL_GAP) * 2,
      y: row1Y,
      width: col3,
      height: bigH,
      label: labels.zombies,
      value: normalized.zombies,
      icon: 'Z',
      big: true,
    });
    drawStatCell(ctx, {
      x: left,
      y: row2Y,
      width: col3,
      height: smallH,
      label: labels.kd,
      value: normalized.kd,
      icon: 'KD',
      big: false,
    });
    drawStatCell(ctx, {
      x: left + col3 + CELL_GAP,
      y: row2Y,
      width: col3,
      height: smallH,
      label: labels.sessions,
      value: normalized.sessions,
      icon: 'S',
      big: false,
    });
    drawStatCell(ctx, {
      x: left + (col3 + CELL_GAP) * 2,
      y: row2Y,
      width: col3,
      height: smallH,
      label: labels.longest,
      value: normalized.longest,
      icon: 'L',
      big: false,
    });
    drawStatCell(ctx, {
      x: left,
      y: row3Y,
      width: col2,
      height: smallH,
      label: labels.playtime,
      value: normalized.playtime,
      icon: 'T',
      big: false,
    });
    drawStatCell(ctx, {
      x: left + col2 + CELL_GAP,
      y: row3Y,
      width: col2,
      height: smallH,
      label: labels.hitZone,
      value: normalized.hitZone,
      icon: 'H',
      big: false,
    });

    const outputPath = path.join(
      os.tmpdir(),
      `swaga-stats-${Date.now()}-${Math.random().toString(16).slice(2)}.png`
    );

    try {
      await PImage.encodePNGToStream(image, fs.createWriteStream(outputPath));
      return await fsp.readFile(outputPath);
    } finally {
      await fsp.unlink(outputPath).catch(() => {});
    }
  }

  async handle(interaction) {
    const lang = detectLanguage(interaction);
    const langText = lang === 'ru' ? TEXT_RU : TEXT_EN;

    if (!this.enabled) {
      await interaction.reply({
        content: langText.messages.notConfigured,
        ephemeral: true,
      });
      return;
    }

    const steam64 = String(interaction.options.getString('steamid', true) || '').trim();
    if (!/^\d{17}$/.test(steam64) || !steam64.startsWith('7656119')) {
      await interaction.reply({
        content: langText.messages.badSteam,
        ephemeral: true,
      });
      return;
    }

    const selectedServer = String(interaction.options.getString('server', false) || '').trim();
    const selectedServerId = selectedServer ? this.resolveServerId(selectedServer) : '';
    if (selectedServer && !selectedServerId) {
      const availableKeys = this.getAvailableServerKeys();
      await interaction.reply({
        content: formatMessage(langText.messages.invalidServer, {
          server: selectedServer,
          servers: availableKeys.join(', ') || '-',
        }),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const avatarPromise = fetchSteamAvatarBuffer(steam64, this.steamApiKey);
      const serverIds = selectedServerId
        ? [selectedServerId]
        : this.serverIds.length
        ? this.serverIds
        : [this.client.serverId];
      let chosenStats = null;
      let fallbackStats = null;
      let lastError = null;

      for (const serverId of serverIds) {
        try {
          const statsResult = await this.client.getPlayerStats(steam64, serverId);
          const normalizedCandidate = normalizeStats(
            statsResult?.statsPayload,
            langText,
            lang,
            statsResult?.lookupName || ''
          );

          if (!fallbackStats) {
            fallbackStats = {
              normalized: normalizedCandidate,
              result: statsResult,
            };
          }

          if (normalizedCandidate.hasMetrics) {
            chosenStats = {
              normalized: normalizedCandidate,
              result: statsResult,
            };
            break;
          }
        } catch (err) {
          const message = String(err?.message || '');
          if (message === 'NO_STATS') {
            continue;
          }
          lastError = err;
          if (message === 'PLAYER_NOT_FOUND' || message === 'STATS_SERVER_NOT_CONFIGURED') {
            break;
          }
        }
      }

      if (!chosenStats && fallbackStats) {
        chosenStats = fallbackStats;
      }

      if (!chosenStats) {
        if (lastError) {
          throw lastError;
        }
        await interaction.editReply({ content: langText.messages.noStats });
        return;
      }

      const avatarBuffer = await avatarPromise;
      const avatarImage = await decodeSteamAvatar(avatarBuffer);
      const cardBuffer = await this.renderCard(chosenStats.normalized, langText, avatarImage);
      const attachment = new AttachmentBuilder(cardBuffer, {
        name: `stats-${steam64}.png`,
      });
      await interaction.editReply({ files: [attachment] });
    } catch (err) {
      const message = String(err?.message || '');
      if (message === 'NO_STATS') {
        await interaction.editReply({ content: langText.messages.noStats });
        return;
      }
      if (message === 'PLAYER_NOT_FOUND' || message.includes('Player not found in CFTools')) {
        await interaction.editReply({ content: langText.messages.noPlayer });
        return;
      }
      if (message === 'STATS_SERVER_NOT_CONFIGURED') {
        await interaction.editReply({ content: langText.messages.notConfigured });
        return;
      }

      console.error('[stats-card] Error:', err?.message || err);
      await interaction.editReply({ content: langText.messages.fetchError });
    }
  }
}

module.exports = StatsCard;
