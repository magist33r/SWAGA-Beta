import React, { useEffect } from 'react';
import { bootstrap } from '../app.js';

export default function App() {
  useEffect(() => {
    bootstrap();
  }, []);

  return (
    <div>
      <div className="bg-glow" />
      <div className="bg-noise" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <nav className="nav glass">
        <div className="brand">
          <div className="brand-mark">
            <span className="brand-dot" />
          </div>
          <div className="brand-text">
            <span className="brand-title">VIP Manager</span>
            <span className="brand-subtitle">SWAGA VIP CONTROL</span>
          </div>
        </div>

        <div className="nav-links">
          <a className="nav-link is-active" href="#home">
            Главная
          </a>
          <a className="nav-link" href="#contact">
            Подключение
          </a>
          <a className="nav-link" href="#stats">
            Статистика
          </a>
          <a className="nav-link" href="#catalog">
            VIP
          </a>
          <a className="nav-link" href="#actions">
            Операции
          </a>
          <a className="nav-link" href="#logs">
            Логи
          </a>
        </div>

        <div className="nav-actions">
          <div className="status offline" id="connectionStatus">
            <span className="dot" />
            <span>API не отвечает</span>
          </div>
          <button className="btn ghost icon" id="toggleTheme" type="button">
            <span className="theme-icon" aria-hidden="true" />
            <span className="theme-label">Светлая тема</span>
          </button>
          <button className="btn primary" id="refreshAll" type="button">
            Обновить всё
          </button>
        </div>
      </nav>

      <main className="app">
        <section className="hero glass" id="home">
          <div className="hero-content">
            <p className="eyebrow">SWAGA VIP CONTROL</p>
            <h1>Управление VIP для DayZ</h1>
            <p className="subtitle">
              Выдача и снятие VIP, контроль сроков, синхронизация с Discord и быстрый аудит действий
              через единый GUI.
            </p>
            <div className="hero-cta">
              <a className="btn primary" href="#catalog">
                Открыть VIP список
              </a>
              <a className="btn secondary" href="#contact">
                Настроить подключение
              </a>
            </div>
            <div className="hero-badges">
              <span className="badge">Atomic JSON</span>
              <span className="badge neutral">Role Sync</span>
              <span className="badge">Auto Expire</span>
            </div>
          </div>

          <div className="hero-side">
            <div className="hero-card glass">
              <div className="hero-card-header">
                <span className="chip">Live</span>
                <span className="meta">Текущее состояние API</span>
              </div>
              <div className="hero-card-body">
                <div className="hero-metric">
                  <span className="meta">API time</span>
                  <strong id="healthTime">-</strong>
                </div>
                <div className="hero-metric">
                  <span className="meta">Version</span>
                  <strong id="healthVersion">-</strong>
                </div>
                <div className="hero-metric">
                  <span className="meta">Latency</span>
                  <strong id="healthLatency">-</strong>
                </div>
              </div>
            </div>
            <div className="hero-glass-note glass">
              Последняя проверка подключения: <strong id="healthUpdated">-</strong>
            </div>
          </div>
        </section>

        <section className="dashboard">
          <section className="panel glass settings" id="contact">
            <div className="panel-header">
              <h2>Подключение</h2>
              <span className="meta" id="configPath" />
            </div>
            <div className="field">
              <label htmlFor="apiUrl">API URL</label>
              <input id="apiUrl" type="text" placeholder="http://127.0.0.1:8787" />
            </div>
            <div className="field">
              <label htmlFor="apiToken">Токен</label>
              <div className="inline">
                <input id="apiToken" type="password" placeholder="Введите токен API" />
                <button className="btn ghost" id="toggleToken" type="button">
                  Показать
                </button>
              </div>
            </div>
            <div className="actions-inline">
              <button className="btn" id="saveConfig" type="button">
                Сохранить
              </button>
              <button className="btn ghost" id="testConnection" type="button">
                Проверить
              </button>
            </div>
            <p className="hint">
              Убедитесь, что API включен в конфиге бота и порт доступен на сервере.
            </p>
          </section>

          <section className="panel glass stats" id="stats">
            <div className="panel-header">
              <h2>Статистика</h2>
              <span className="meta" id="statsTimestamp">
                -
              </span>
            </div>
            <div className="stats-grid">
              <div className="stat glass">
                <p className="stat-label">Всего VIP</p>
                <p className="stat-value" id="statTotal">
                  -
                </p>
              </div>
              <div className="stat glass">
                <p className="stat-label">Навсегда</p>
                <p className="stat-value" id="statForever">
                  -
                </p>
              </div>
              <div className="stat glass">
                <p className="stat-label">Срочные</p>
                <p className="stat-value" id="statTimed">
                  -
                </p>
              </div>
              <div className="stat glass">
                <p className="stat-label">Проблемные привязки</p>
                <p className="stat-value" id="statInvalid">
                  -
                </p>
              </div>
              <div className="stat glass">
                <p className="stat-label">Всего привязок</p>
                <p className="stat-value" id="statLinks">
                  -
                </p>
              </div>
            </div>
            <div className="expiring" id="expiringList">
              <p className="muted">Нет данных о ближайших истечениях.</p>
            </div>
          </section>

          <section className="panel glass list" id="catalog">
            <div className="panel-header panel-header-wrap">
              <h2>VIP</h2>
              <div className="search-group">
                <div className="search">
                  <input id="searchInput" type="text" placeholder="Поиск по Steam64 или Discord ID" />
                  <button className="btn ghost" id="searchButton" type="button">
                    Найти
                  </button>
                </div>
                <div className="inline">
                  <label className="meta compact-label" htmlFor="statusFilter">
                    Фильтр:
                  </label>
                  <select id="statusFilter">
                    <option value="all">Все</option>
                    <option value="active">Активные</option>
                    <option value="forever">Навсегда</option>
                    <option value="expired">Истекшие</option>
                    <option value="unlinked">Без Discord</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="table-wrap glass">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Steam64</th>
                    <th>Discord ID</th>
                    <th>
                      <button className="sort" data-sort="tariff" type="button">
                        Тариф
                      </button>
                    </th>
                    <th>Статус</th>
                    <th>
                      <div className="th-wrap">
                        <button className="sort" data-sort="expiresAt" type="button">
                          Срок
                        </button>
                        <span className="th-hint" title="Сортировка по дате истечения">
                          Подсказка
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody id="vipTable">
                  <tr>
                    <td colSpan="6" className="empty">
                      Нет данных
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button className="btn ghost" id="prevPage" type="button">
                Назад
              </button>
              <span id="pageInfo">1 / 1</span>
              <button className="btn ghost" id="nextPage" type="button">
                Вперёд
              </button>
            </div>
          </section>

          <section className="panel glass detail" id="detail">
            <div className="panel-header">
              <h2>Детали</h2>
              <span className="meta">Выберите запись в таблице</span>
            </div>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="meta">Steam64</span>
                <strong id="detailSteam">-</strong>
              </div>
              <div className="detail-item">
                <span className="meta">Discord</span>
                <strong id="detailDiscord">-</strong>
              </div>
              <div className="detail-item">
                <span className="meta">Тариф</span>
                <strong id="detailTariff">-</strong>
              </div>
              <div className="detail-item">
                <span className="meta">Срок</span>
                <strong id="detailExpires">-</strong>
              </div>
            </div>
            <div className="detail-status">
              <span className="badge" id="detailStatus">
                Нет данных
              </span>
              <span className="meta" id="detailHint">
                Выберите запись, чтобы увидеть детали.
              </span>
            </div>
            <div className="detail-actions">
              <button className="btn secondary" id="detailRefresh" type="button">
                Обновить данные
              </button>
            </div>
          </section>

          <section className="panel glass actions" id="actions">
            <div className="panel-header">
              <h2>Операции</h2>
              <span className="meta">Управление VIP и whitelist</span>
            </div>

            <div className="card glass">
              <h3>Выдать VIP</h3>
              <div className="field">
                <label>Discord ID</label>
                <input id="giveDiscord" type="text" placeholder="Укажи Discord ID" />
              </div>
              <div className="field">
                <label>Steam64</label>
                <input id="giveSteam" type="text" placeholder="7656119..." />
              </div>
              <div className="field">
                <label>Тариф</label>
                <select id="giveRole" defaultValue="VIP">
                  <option value="VIP Test">VIP Test</option>
                  <option value="VIP 14 Days">VIP 14 Days</option>
                  <option value="VIP Monthly">VIP Monthly</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
              <button className="btn primary" id="giveVip" type="button">
                Выдать
              </button>
            </div>

            <div className="card glass">
              <h3>Снять VIP</h3>
              <div className="field">
                <label>Discord ID</label>
                <input id="removeDiscord" type="text" placeholder="Укажи Discord ID" />
              </div>
              <div className="field">
                <label>Steam64</label>
                <input id="removeSteam" type="text" placeholder="7656119..." />
              </div>
              <button className="btn danger" id="removeVip" type="button">
                Снять
              </button>
            </div>

            <div className="card glass">
              <h3>Изменить срок</h3>
              <div className="field">
                <label>Discord ID</label>
                <input id="setDiscord" type="text" placeholder="Укажи Discord ID" />
              </div>
              <div className="field">
                <label>Steam64</label>
                <input id="setSteam" type="text" placeholder="7656119..." />
              </div>
              <div className="field">
                <label>Дни (0 = навсегда)</label>
                <input id="setDays" type="number" min="0" defaultValue="30" />
              </div>
              <div className="field">
                <label>Тариф (опционально)</label>
                <select id="setRole">
                  <option value="">Без изменения</option>
                  <option value="VIP Test">VIP Test</option>
                  <option value="VIP 14 Days">VIP 14 Days</option>
                  <option value="VIP Monthly">VIP Monthly</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
              <button className="btn" id="setVip" type="button">
                Сохранить
              </button>
            </div>
          </section>

          <section className="panel glass logs" id="logs">
            <div className="panel-header panel-header-wrap">
              <h2>Логи API</h2>
              <button className="btn ghost" id="refreshLogs" type="button">
                Обновить логи
              </button>
            </div>
            <div className="logs-controls">
              <input id="logsSearch" type="text" placeholder="Поиск по логам..." />
              <select id="logsLevel">
                <option value="all">Все</option>
                <option value="error">Только ошибки</option>
                <option value="warn">Предупреждения</option>
                <option value="vip">VIP операции</option>
                <option value="api">API запросы</option>
              </select>
              <select id="logsLimit" defaultValue="500">
                <option value="200">200 строк</option>
                <option value="500">500 строк</option>
                <option value="1000">1000 строк</option>
              </select>
            </div>
            <p className="meta" id="logsMeta">
              Логи не загружены.
            </p>
            <pre id="logOutput">Логи не загружены.</pre>
          </section>
        </section>

        <div className="toast" id="toast" />
      </main>
    </div>
  );
}
