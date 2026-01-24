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
              Автоматизация белого списка и ролей: выдача VIP, отслеживание сроков,
              синхронизация с Discord и аудит действий администраторов.
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
                <span className="meta">Сводка по серверу</span>
              </div>
              <div className="hero-card-body">
                <div className="hero-metric">
                  <span className="meta">Сервер</span>
                  <strong>Primary</strong>
                </div>
                <div className="hero-metric">
                  <span className="meta">Whitelist</span>
                  <strong>SWG Loadout</strong>
                </div>
                <div className="hero-metric">
                  <span className="meta">Статус</span>
                  <strong>Auto Expire</strong>
                </div>
              </div>
            </div>
            <div className="hero-glass-note glass">
              Данные обновляются в фоне. Изменения применяются атомарно, чтобы whitelist всегда
              оставался консистентным.
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
            <div className="actions">
              <button className="btn" id="saveConfig" type="button">
                Сохранить
              </button>
              <button className="btn ghost" id="testConnection" type="button">
                Проверить
              </button>
            </div>
            <p className="hint">
              Убедись, что API доступен и открыт порт 8787. При работе с VPN обнови URL и токен
              в настройках.
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
                <p className="stat-label">Срок</p>
                <p className="stat-value" id="statTimed">
                  -
                </p>
              </div>
              <div className="stat glass">
                <p className="stat-label">Ошибочные привязки</p>
                <p className="stat-value" id="statInvalid">
                  -
                </p>
              </div>
            </div>
            <div className="expiring" id="expiringList">
              <p className="muted">Нет данных о ближайших истечениях.</p>
            </div>
          </section>

          <section className="panel glass list" id="catalog">
            <div className="panel-header">
              <h2>VIP</h2>
              <div className="search">
                <input id="searchInput" type="text" placeholder="Поиск по Steam64 или Discord ID" />
                <button className="btn ghost" id="searchButton" type="button">
                  Найти
                </button>
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
                    <td colSpan="5" className="empty">
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
                Вперед
              </button>
            </div>
          </section>

          <section className="panel glass detail" id="detail">
            <div className="panel-header">
              <h2>Детали</h2>
              <span className="meta">Выбери запись в таблице</span>
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
            <div className="panel-header">
              <h2>Логи (последние 500 строк)</h2>
              <button className="btn ghost" id="refreshLogs" type="button">
                Обновить логи
              </button>
            </div>
            <pre id="logOutput">Логи не загружены.</pre>
          </section>
        </section>

        <div className="toast" id="toast" />
      </main>
    </div>
  );
}
