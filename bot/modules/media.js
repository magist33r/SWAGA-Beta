const URL_REGEX = /https?:\/\/[^\s<>()]+/gi;

function normalizeChannelIds(value) {
  if (Array.isArray(value)) {
    return value.map((id) => String(id || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [];
}

function extractTextUrls(content) {
  const text = String(content || '');
  const matches = text.match(URL_REGEX);
  if (!matches) {
    return [];
  }
  return [...new Set(matches.map((url) => String(url).trim()).filter(Boolean))];
}

function extractAttachmentUrls(message) {
  if (!message?.attachments || typeof message.attachments.values !== 'function') {
    return [];
  }
  const urls = [];
  for (const attachment of message.attachments.values()) {
    if (attachment?.url) {
      urls.push(String(attachment.url));
    }
  }
  return [...new Set(urls)];
}

function extractEmbedUrls(message) {
  if (!Array.isArray(message?.embeds)) {
    return [];
  }
  const urls = [];
  for (const embed of message.embeds) {
    if (embed?.url) {
      urls.push(String(embed.url));
    }
    if (embed?.image?.url) {
      urls.push(String(embed.image.url));
    }
    if (embed?.video?.url) {
      urls.push(String(embed.video.url));
    }
    if (embed?.thumbnail?.url) {
      urls.push(String(embed.thumbnail.url));
    }
  }
  return [...new Set(urls)];
}

function extractMediaUrls(message) {
  const textUrls = extractTextUrls(message?.content);
  const attachmentUrls = extractAttachmentUrls(message);

  const primary = [
    ...attachmentUrls,
    ...textUrls,
  ];
  const dedupedPrimary = [...new Set(primary.map((url) => String(url).trim()).filter(Boolean))];
  if (dedupedPrimary.length > 0) return dedupedPrimary;

  // Fallback: embeds only when user sent no text URLs and no attachments
  const embedUrls = extractEmbedUrls(message);
  return [...new Set(embedUrls.map((url) => String(url).trim()).filter(Boolean))];
}

function extractMediaUrl(content) {
  const urls = extractTextUrls(content);
  return urls.length > 0 ? urls[0] : null;
}

function buildRepostContent(urls, authorId, announceAuthor) {
  const MAX_LENGTH = 1900;
  const urlBlock = urls.join('\n');
  const authorLine = announceAuthor ? `\nОпубликовал: <@${authorId}>` : '';
  const content = `${urlBlock}${authorLine}`;
  if (content.length <= MAX_LENGTH) {
    return content;
  }
  return `${content.slice(0, MAX_LENGTH - 1)}…`;
}

function createMediaModule(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const enabled = Boolean(cfg.enabled);
  const channelIds = normalizeChannelIds(cfg.channelIds || cfg.channels || []);
  const notifyOnDelete = cfg.notifyOnDelete !== false;
  const announceAuthor = cfg.announceAuthor !== false;
  const likeEmoji = String(cfg.likeEmoji || '👍').trim() || '👍';
  const dislikeEmoji = String(cfg.dislikeEmoji || '👎').trim() || '👎';

  async function handleMessage(message) {
    if (!enabled) return false;
    if (!message || message.author?.bot) return false;
    if (!channelIds.includes(String(message.channelId || ''))) return false;

    const mediaUrls = extractMediaUrls(message);

    if (mediaUrls.length === 0) {
      await message.delete().catch(() => null);

      if (notifyOnDelete) {
        const warning =
          `❌ Твоё сообщение в <#${message.channelId}> было удалено.\n` +
          'В этом канале можно публиковать только медиа-контент: ссылки, вложения или embed.';
        await message.author.send(warning).catch(() => null);
      }
      return true;
    }

    await message.delete().catch(() => null);

    const repostContent = buildRepostContent(mediaUrls, message.author.id, announceAuthor);
    const posted = await message.channel.send(repostContent).catch(() => null);
    if (!posted) {
      return true;
    }

    await posted.react(likeEmoji).catch(() => null);
    await posted.react(dislikeEmoji).catch(() => null);
    return true;
  }

  return {
    enabled,
    channelIds,
    handleMessage,
  };
}

module.exports = {
  createMediaModule,
  extractMediaUrl,
  extractMediaUrls,
  extractTextUrls,
};
