const state = {
  config: null,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  query: '',
  sortBy: '',
  sortDir: 'asc',
  editingSteam64: null,
  selectedSteam64: null,
  lastItems: [],
  lastTotal: 0,
  lastPage: 1,
  lastPageSize: 50,
};

const el = (id) => document.getElementById(id);
const list = (selector) => Array.from(document.querySelectorAll(selector));

const API_ERROR_MESSAGES = {
  unauthorized: 'Неверный токен API.',
  db_not_ready: 'API ещё не готово. Попробуй чуть позже.',
  invalid_discord_id: 'Некорректный Discord ID.',
  invalid_steam64: 'Некорректный SteamID64.',
  steam64_not_found: 'SteamID64 не найден.',
  invalid_role: 'Неверный тариф.',
  invalid_days: 'Некорректное количество дней.',
  invalid_expires_at: 'Некорректная дата окончания.',
  missing_expires: 'Нужно указать срок.',
  origin_not_allowed: 'Источник не разрешён настройками API.',
};

let connectionStatus = null;
let configPath = null;
let apiUrlInput = null;
let apiTokenInput = null;
let refreshAllBtn = null;
let saveConfigBtn = null;
let testConnectionBtn = null;
let toggleTokenBtn = null;
let toggleThemeBtn = null;
let themeIcon = null;
let themeLabel = null;
let navLinks = null;
let brandMark = null;
let brandDot = null;
let searchInput = null;
let searchButton = null;
let vipTable = null;
let prevPageBtn = null;
let nextPageBtn = null;
let pageInfo = null;
let statTotal = null;
let statForever = null;
let statTimed = null;
let statInvalid = null;
let expiringList = null;
let statsTimestamp = null;
let refreshLogsBtn = null;
let logOutput = null;
let logsSection = null;

let giveDiscord = null;
let giveSteam = null;
let giveRole = null;
let giveVipBtn = null;
let removeDiscord = null;
let removeSteam = null;
let removeVipBtn = null;
let setDiscord = null;
let setSteam = null;
let setDays = null;
let setRole = null;
let setVipBtn = null;

let detailSteam = null;
let detailDiscord = null;
let detailTariff = null;
let detailExpires = null;
let detailStatus = null;
let detailHint = null;
let detailRefreshBtn = null;

let toast = null;
let sortButtons = [];
let bootstrapped = false;
let refreshInFlight = null;
let logsLoaded = false;

function mapElements() {
  connectionStatus = el('connectionStatus');
  configPath = el('configPath');
  apiUrlInput = el('apiUrl');
  apiTokenInput = el('apiToken');
  refreshAllBtn = el('refreshAll');
  saveConfigBtn = el('saveConfig');
  testConnectionBtn = el('testConnection');
  toggleTokenBtn = el('toggleToken');
  toggleThemeBtn = el('toggleTheme');
  themeIcon = toggleThemeBtn?.querySelector('.theme-icon');
  themeLabel = toggleThemeBtn?.querySelector('.theme-label');
  navLinks = document.querySelector('.nav-links');
  brandMark = document.querySelector('.brand-mark');
  brandDot = document.querySelector('.brand-dot');
  searchInput = el('searchInput');
  searchButton = el('searchButton');
  vipTable = el('vipTable');
  prevPageBtn = el('prevPage');
  nextPageBtn = el('nextPage');
  pageInfo = el('pageInfo');
  statTotal = el('statTotal');
  statForever = el('statForever');
  statTimed = el('statTimed');
  statInvalid = el('statInvalid');
  expiringList = el('expiringList');
  statsTimestamp = el('statsTimestamp');
  refreshLogsBtn = el('refreshLogs');
  logOutput = el('logOutput');
  logsSection = el('logs');

  giveDiscord = el('giveDiscord');
  giveSteam = el('giveSteam');
  giveRole = el('giveRole');
  giveVipBtn = el('giveVip');
  removeDiscord = el('removeDiscord');
  removeSteam = el('removeSteam');
  removeVipBtn = el('removeVip');
  setDiscord = el('setDiscord');
  setSteam = el('setSteam');
  setDays = el('setDays');
  setRole = el('setRole');
  setVipBtn = el('setVip');

  detailSteam = el('detailSteam');
  detailDiscord = el('detailDiscord');
  detailTariff = el('detailTariff');
  detailExpires = el('detailExpires');
  detailStatus = el('detailStatus');
  detailHint = el('detailHint');
  detailRefreshBtn = el('detailRefresh');

  toast = el('toast');
  sortButtons = list('.sort');
}

function showToast(message, type = 'info') {
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.add('show');
  toast.style.background = type === 'error' ? '#e44949' : 'rgba(10, 12, 18, 0.9)';
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function setConnectionStatus(online, text) {
  if (connectionStatus) {
    connectionStatus.classList.toggle('online', online);
    connectionStatus.classList.toggle('offline', !online);
    const label = connectionStatus.querySelector('span:last-child');
    if (label) {
      label.textContent = text || (online ? 'API онлайн' : 'API не отвечает');
    }
  }
  if (brandMark) {
    brandMark.classList.toggle('online', online);
    brandMark.classList.toggle('offline', !online);
  }
  if (brandDot) {
    brandDot.classList.toggle('online', online);
    brandDot.classList.toggle('offline', !online);
  }
}

function formatTariff(item) {
  return item.tariff || item.roleName || 'VIP';
}

function formatExpires(expiresAt) {
  if (!expiresAt) {
    return 'Навсегда';
  }
  const date = new Date(expiresAt * 1000);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocalValue(expiresAt) {
  if (!expiresAt) {
    return '';
  }
  const date = new Date(expiresAt * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = next;
  if (themeIcon) {
    themeIcon.style.boxShadow =
      next === 'dark'
        ? '0 0 12px rgba(10, 132, 255, 0.4)'
        : '0 0 12px rgba(10, 132, 255, 0.45)';
  }
  if (themeLabel) {
    themeLabel.textContent = next === 'dark' ? 'Темная тема' : 'Светлая тема';
  }
  if (state.config) {
    state.config.theme = next;
  }
}

function getActiveTheme() {
  return document.body?.dataset?.theme === 'dark' ? 'dark' : 'light';
}

function updateSortIndicators() {
  sortButtons.forEach((button) => {
    button.classList.remove('active', 'asc', 'desc');
    if (button.dataset.sort === state.sortBy) {
      button.classList.add('active', state.sortDir);
    }
  });
}

function buildApiUrl(path) {
  const base = state.config.apiBaseUrl.replace(/\/+$/, '');
  return `${base}${path}`;
}

async function apiRequest(path, options = {}) {
  if (!state.config) {
    throw new Error('config_not_loaded');
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-api-token': state.config.apiToken || '',
    ...(options.headers || {}),
  };
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const errorCode = data.error || response.statusText || 'request_failed';
    const message = API_ERROR_MESSAGES[errorCode] || errorCode;
    throw new Error(message);
  }
  return data;
}

async function loadConfig() {
  const result = await window.vipGui.getConfig();
  state.config = result.config;
  apiUrlInput.value = state.config.apiBaseUrl || '';
  apiTokenInput.value = state.config.apiToken || '';
  if (configPath) {
    configPath.textContent = result.path || '';
  }
  applyTheme(state.config.theme || 'light');
}

async function saveConfig() {
  const payload = {
    apiBaseUrl: apiUrlInput.value.trim() || 'http://127.0.0.1:8787',
    apiToken: apiTokenInput.value.trim(),
    theme: state.config?.theme || 'light',
  };
  const result = await window.vipGui.saveConfig(payload);
  state.config = result.config;
  showToast('Настройки сохранены');
}

async function persistTheme() {
  if (!state.config) {
    return;
  }
  const payload = {
    apiBaseUrl: state.config.apiBaseUrl,
    apiToken: state.config.apiToken,
    theme: state.config.theme || 'light',
  };
  const result = await window.vipGui.saveConfig(payload);
  state.config = result.config;
}

async function testConnection(options = {}) {
  const silent = Boolean(options.silent);
  try {
    const data = await apiRequest('/api/health');
    setConnectionStatus(true, `API онлайн: ${data.time}`);
    if (!silent) {
      showToast('Соединение установлено');
    }
  } catch (err) {
    setConnectionStatus(false, 'API не отвечает');
    if (!silent) {
      showToast(`Ошибка подключения: ${err.message}`, 'error');
    }
  }
}

function renderDetail(item) {
  if (!detailSteam || !detailDiscord || !detailTariff || !detailExpires || !detailStatus) {
    return;
  }
  if (!item) {
    detailSteam.textContent = '-';
    detailDiscord.textContent = '-';
    detailTariff.textContent = '-';
    detailExpires.textContent = '-';
    detailStatus.textContent = 'Нет данных';
    if (detailHint) {
      detailHint.textContent = 'Выберите запись в таблице, чтобы увидеть детали.';
    }
    return;
  }

  detailSteam.textContent = item.steam64;
  detailDiscord.textContent = item.discordId || '-';
  detailTariff.textContent = formatTariff(item);
  detailExpires.textContent = formatExpires(item.expiresAt);
  detailStatus.textContent = item.expiresAt ? 'VIP активен' : 'VIP навсегда';
  if (detailHint) {
    detailHint.textContent = item.expiresAt
      ? `Действует до: ${formatExpires(item.expiresAt)}`
      : 'VIP выдан навсегда.';
  }
}

function renderExpiryEditor(cell, item) {
  const editor = document.createElement('div');
  editor.className = 'expires-editor';

  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.value = toDatetimeLocalValue(item.expiresAt);

  const foreverLabel = document.createElement('label');
  foreverLabel.className = 'inline';
  const foreverToggle = document.createElement('input');
  foreverToggle.type = 'checkbox';
  foreverToggle.checked = item.expiresAt === 0;
  const foreverText = document.createElement('span');
  foreverText.textContent = 'Навсегда';
  foreverLabel.append(foreverToggle, foreverText);

  if (foreverToggle.checked) {
    input.disabled = true;
  }

  foreverToggle.addEventListener('change', () => {
    input.disabled = foreverToggle.checked;
    if (foreverToggle.checked) {
      input.value = '';
    }
  });

  const actions = document.createElement('div');
  actions.className = 'expires-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary small';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Сохранить';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn ghost small';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Отмена';

  actions.append(saveBtn, cancelBtn);
  editor.append(input, foreverLabel, actions);
  cell.innerHTML = '';
  cell.appendChild(editor);

  cancelBtn.addEventListener('click', () => {
    state.editingSteam64 = null;
    renderVipList(state.lastItems, state.lastTotal, state.lastPage, state.lastPageSize);
  });

  saveBtn.addEventListener('click', async () => {
    let expiresAt = 0;
    if (!foreverToggle.checked) {
      if (!input.value) {
        showToast('Укажите дату окончания', 'error');
        return;
      }
      const date = new Date(input.value);
      if (Number.isNaN(date.getTime())) {
        showToast('Некорректная дата', 'error');
        return;
      }
      expiresAt = Math.floor(date.getTime() / 1000);
    }

    try {
      await apiRequest('/api/vip/set', {
        method: 'POST',
        body: JSON.stringify({
          steam64: item.steam64,
          expiresAt,
        }),
      });
      showToast('Срок обновлён');
      state.editingSteam64 = null;
      await refreshAll();
    } catch (err) {
      showToast(`Ошибка сохранения: ${err.message}`, 'error');
    }
  });
}

function renderVipList(items, total, page, pageSize) {
  state.lastItems = items;
  state.lastTotal = total;
  state.lastPage = page;
  state.lastPageSize = pageSize;
  if (state.editingSteam64 && !items.some((item) => item.steam64 === state.editingSteam64)) {
    state.editingSteam64 = null;
  }

  vipTable.innerHTML = '';
  if (!items.length) {
    vipTable.innerHTML = '<tr><td colspan="5" class="empty">Нет данных</td></tr>';
    renderDetail(null);
  } else {
    let selectedItem = null;

    items.forEach((item, index) => {
      const row = document.createElement('tr');
      const isSelected = item.steam64 === state.selectedSteam64;
      if (isSelected) {
        selectedItem = item;
        row.classList.add('selected');
      }

      const indexCell = document.createElement('td');
      indexCell.textContent = (page - 1) * pageSize + index + 1;

      const steamCell = document.createElement('td');
      steamCell.textContent = item.steam64;

      const discordCell = document.createElement('td');
      discordCell.textContent = item.discordId || '-';

      const tariffCell = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = 'badge';
      tag.textContent = formatTariff(item);
      tariffCell.appendChild(tag);

      const expiresCell = document.createElement('td');
      expiresCell.className = 'expires-cell';

      if (state.editingSteam64 === item.steam64) {
        renderExpiryEditor(expiresCell, item);
      } else {
        const value = document.createElement('span');
        value.className = 'expires-value';
        value.textContent = formatExpires(item.expiresAt);
        value.title = 'Двойной клик для редактирования срока';
        value.addEventListener('dblclick', () => {
          state.editingSteam64 = item.steam64;
          renderVipList(state.lastItems, state.lastTotal, state.lastPage, state.lastPageSize);
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'btn ghost small';
        editBtn.type = 'button';
        editBtn.textContent = 'Изменить';
        editBtn.addEventListener('click', () => {
          state.editingSteam64 = item.steam64;
          renderVipList(state.lastItems, state.lastTotal, state.lastPage, state.lastPageSize);
        });

        expiresCell.append(value, editBtn);
      }

      row.append(indexCell, steamCell, discordCell, tariffCell, expiresCell);
      row.addEventListener('click', (event) => {
        if (event.target.closest('button')) {
          return;
        }
        state.selectedSteam64 = item.steam64;
        renderDetail(item);
        vipTable.querySelectorAll('tr').forEach((rowItem) => {
          rowItem.classList.remove('selected');
        });
        row.classList.add('selected');
      });
      vipTable.appendChild(row);
    });

    if (!selectedItem && items.length > 0) {
      selectedItem = items[0];
      state.selectedSteam64 = selectedItem.steam64;
      const firstRow = vipTable.querySelector('tr');
      if (firstRow) {
        firstRow.classList.add('selected');
      }
    }
    renderDetail(selectedItem);
  }

  state.totalPages = Math.max(1, Math.ceil(total / pageSize));
  pageInfo.textContent = `${page} / ${state.totalPages}`;
  prevPageBtn.disabled = page <= 1;
  nextPageBtn.disabled = page >= state.totalPages;
  updateSortIndicators();
}

async function loadVipList() {
  try {
    const params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('pageSize', String(state.pageSize));
    if (state.query) {
      params.set('q', state.query);
    }
    if (state.sortBy) {
      params.set('sortBy', state.sortBy);
      params.set('sortDir', state.sortDir);
    }
    const data = await apiRequest(`/api/vip/list?${params.toString()}`);
    renderVipList(data.items || [], data.total || 0, data.page || 1, data.pageSize || state.pageSize);
  } catch (err) {
    showToast(`Не удалось загрузить список: ${err.message}`, 'error');
  }
}

async function loadStats() {
  try {
    const data = await apiRequest('/api/vip/stats');
    statTotal.textContent = data.total ?? '0';
    statForever.textContent = data.forever ?? '0';
    statTimed.textContent = data.timed ?? '0';
    statInvalid.textContent = data.invalidLinks ?? '0';
    statsTimestamp.textContent = new Date().toLocaleTimeString('ru-RU');

    expiringList.innerHTML = '';
    if (Array.isArray(data.expiring) && data.expiring.length > 0) {
      data.expiring.forEach((entry) => {
        const line = document.createElement('div');
        line.textContent = `Истекает через ${entry.hours} ч: ${entry.count}`;
        expiringList.appendChild(line);
      });
    } else {
      expiringList.innerHTML = '<p class="muted">Нет данных о ближайших истечениях.</p>';
    }
  } catch (err) {
    showToast(`Не удалось загрузить статистику: ${err.message}`, 'error');
  }
}

async function loadLogs() {
  logsLoaded = true;
  try {
    const data = await apiRequest('/api/logs?limit=500');
    const lines = data.lines || [];
    logOutput.textContent = lines.length ? lines.join('\n') : 'Логи пусты.';
  } catch (err) {
    logOutput.textContent = 'Не удалось загрузить логи.';
    showToast(`Логи: ${err.message}`, 'error');
  }
}

async function giveVip() {
  const payload = {
    discordId: giveDiscord.value.trim() || undefined,
    steam64: giveSteam.value.trim() || undefined,
    roleName: giveRole.value,
  };
  if (!payload.discordId && !payload.steam64) {
    showToast('Укажите Discord ID или Steam64', 'error');
    return;
  }
  try {
    await apiRequest('/api/vip/give', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('VIP выдан');
    await refreshAll();
  } catch (err) {
    showToast(`Ошибка выдачи: ${err.message}`, 'error');
  }
}

async function removeVip() {
  const payload = {
    discordId: removeDiscord.value.trim() || undefined,
    steam64: removeSteam.value.trim() || undefined,
  };
  if (!payload.discordId && !payload.steam64) {
    showToast('Укажите Discord ID или Steam64', 'error');
    return;
  }
  try {
    await apiRequest('/api/vip/remove', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('VIP снят');
    await refreshAll();
  } catch (err) {
    showToast(`Ошибка снятия: ${err.message}`, 'error');
  }
}

async function setVip() {
  const days = Number(setDays.value);
  if (!Number.isFinite(days) || days < 0) {
    showToast('Введите корректное число дней', 'error');
    return;
  }
  const payload = {
    discordId: setDiscord.value.trim() || undefined,
    steam64: setSteam.value.trim() || undefined,
    days,
  };
  if (setRole.value) {
    payload.roleName = setRole.value;
  }
  if (!payload.discordId && !payload.steam64) {
    showToast('Укажите Discord ID или Steam64', 'error');
    return;
  }
  try {
    await apiRequest('/api/vip/set', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('Срок обновлён');
    await refreshAll();
  } catch (err) {
    showToast(`Ошибка сохранения: ${err.message}`, 'error');
  }
}

async function refreshAll(options = {}) {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const includeLogs = Boolean(options.includeLogs);
  const tasks = [loadVipList(), loadStats()];
  if (includeLogs) {
    tasks.push(loadLogs());
  }
  refreshInFlight = Promise.all(tasks).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function scheduleInitialLoad() {
  const run = () => {
    void testConnection({ silent: true });
    void refreshAll({ includeLogs: false });
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 250);
  }
}

function setupLazyLogs() {
  if (!logsSection || !logOutput || logsLoaded) {
    return;
  }

  const trigger = () => {
    if (logsLoaded) {
      return;
    }
    void loadLogs();
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          trigger();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(logsSection);
  } else {
    setTimeout(trigger, 1200);
  }
}

function setupScrollFx() {
  let rafId = null;
  const update = () => {
    document.documentElement.style.setProperty('--scroll', String(window.scrollY));
    rafId = null;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(update);
    },
    { passive: true }
  );
}

function setupNavIcons() {
  const iconMap = {
    '#home':
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    '#contact':
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10v4h-3v4h3v4h-3v8h-4v-8H7v-4h3V6H7z"/></svg>',
    '#stats':
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16v2H4zM6 10h3v8H6zM11 6h3v12h-3zM16 12h3v6h-3z"/></svg>',
    '#catalog':
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 7-6.2-3.4-6.2 3.4 1.2-7-5-4.9 6.9-1z"/></svg>',
    '#actions':
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10v4H4zM16 5h4v4h-4zM4 10h4v4H4zM10 10h10v4H10zM4 15h12v4H4zM18 15h2v4h-2z"/></svg>',
    '#logs':
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm2 4h10v2H7zm0 4h7v2H7z"/></svg>',
  };

  list('.nav-link').forEach((link) => {
    if (link.querySelector('.nav-icon')) {
      return;
    }
    const href = link.getAttribute('href');
    const icon = iconMap[href];
    if (!icon) {
      return;
    }
    const label = link.textContent.trim();
    link.textContent = '';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'nav-icon';
    iconSpan.innerHTML = icon;

    const textSpan = document.createElement('span');
    textSpan.className = 'nav-text';
    textSpan.textContent = label;

    link.setAttribute('aria-label', label);
    link.append(iconSpan, textSpan);
  });

  if (refreshAllBtn && !refreshAllBtn.querySelector('.refresh-icon')) {
    const label = refreshAllBtn.textContent.trim();
    refreshAllBtn.textContent = '';
    refreshAllBtn.classList.add('icon');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'refresh-icon';
    iconSpan.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7V3h-4l1.7 1.7A7 7 0 1 0 12 21a7 7 0 0 0 6.6-4.5h-2.2A5 5 0 1 1 12 7c1.2 0 2.4.4 3.3 1.3L13 10h6z"/></svg>';

    const textSpan = document.createElement('span');
    textSpan.className = 'btn-text';
    textSpan.textContent = label;

    refreshAllBtn.append(iconSpan, textSpan);
  }

  if (toggleThemeBtn && !toggleThemeBtn.querySelector('.btn-text')) {
    const label = themeLabel?.textContent?.trim() || toggleThemeBtn.textContent.trim();
    toggleThemeBtn.textContent = '';
    toggleThemeBtn.classList.add('icon');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'theme-icon';
    iconSpan.setAttribute('aria-hidden', 'true');

    const textSpan = document.createElement('span');
    textSpan.className = 'theme-label btn-text';
    textSpan.textContent = label || 'Тема';

    toggleThemeBtn.append(iconSpan, textSpan);
  }

  themeIcon = toggleThemeBtn?.querySelector('.theme-icon') || null;
  themeLabel = toggleThemeBtn?.querySelector('.theme-label') || null;

  const navActions = document.querySelector('.nav-actions');
  if (navActions && !navActions.querySelector('.nav-burger')) {
    const burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'btn ghost icon nav-burger';
    burger.setAttribute('aria-label', 'Меню');
    burger.innerHTML =
      '<span class="burger-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16v2H4zM4 11h16v2H4zM4 15h16v2H4z"/></svg></span>';
    navActions.appendChild(burger);

    burger.addEventListener('click', () => {
      if (!navLinks) {
        return;
      }
      const isOpen = navLinks.classList.toggle('is-open');
      burger.classList.toggle('is-open', isOpen);
    });
  }
}

function bindEvents() {
  if (searchButton && searchInput) {
    searchButton.addEventListener('click', () => {
      state.query = searchInput.value.trim();
      state.page = 1;
      loadVipList();
    });

    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        state.query = searchInput.value.trim();
        state.page = 1;
        loadVipList();
      }
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        loadVipList();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        state.page += 1;
        loadVipList();
      }
    });
  }

  sortButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextSort = button.dataset.sort;
      if (state.sortBy === nextSort) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortBy = nextSort;
        state.sortDir = 'asc';
      }
      state.page = 1;
      loadVipList();
    });
  });

  if (refreshAllBtn) {
    refreshAllBtn.addEventListener('click', () => {
      refreshAll({ includeLogs: true });
    });
  }
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', loadLogs);
  }

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
      await saveConfig();
    });
  }

  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', () => {
      testConnection();
    });
  }

  if (giveVipBtn) {
    giveVipBtn.addEventListener('click', giveVip);
  }
  if (removeVipBtn) {
    removeVipBtn.addEventListener('click', removeVip);
  }
  if (setVipBtn) {
    setVipBtn.addEventListener('click', setVip);
  }

  if (toggleTokenBtn && apiTokenInput) {
    toggleTokenBtn.addEventListener('click', () => {
      const isPassword = apiTokenInput.type === 'password';
      apiTokenInput.type = isPassword ? 'text' : 'password';
      toggleTokenBtn.textContent = isPassword ? 'Скрыть' : 'Показать';
    });
  }

  if (toggleThemeBtn) {
    toggleThemeBtn.addEventListener('click', async () => {
      const next = getActiveTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      await persistTheme();
    });
  }

  if (detailRefreshBtn) {
    detailRefreshBtn.addEventListener('click', async () => {
      await refreshAll({ includeLogs: false });
      showToast('Данные обновлены');
    });
  }
}

export async function bootstrap() {
  if (bootstrapped) {
    return;
  }
  bootstrapped = true;
  mapElements();
  setupNavIcons();
  bindEvents();
  await loadConfig();
  setupLazyLogs();
  setupScrollFx();
  scheduleInitialLoad();
}
