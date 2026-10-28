// ============================================================
// Локальный сервер: лендинг + отправка заявок в Telegram
// ============================================================
//
// Запуск:
//   cd D:\projects\repair-landing\telegram-bot
//   npm start
//
// Сервер отдаёт лендинг из родительской папки и принимает
// POST /api/lead. Токен бота хранится только в .env и никогда
// не попадает в браузер.
// ============================================================

const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { loadEnv } = require('./load-env');

loadEnv();

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.HOST || '127.0.0.1';

const parsedPort = Number(process.env.PORT || 8787);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 8787;

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const CHAT_ID = (process.env.CHAT_ID || '').trim();
const DRY_RUN = process.env.DRY_RUN === '1';
const TELEGRAM_API_BASE = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');

// Отдаём только файлы лендинга. Это защищает .env и .git
// от случайной выдачи через локальный сервер.
const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/style.css', 'style.css'],
  ['/script.js', 'script.js'],
  ['/favicon.svg', 'favicon.svg'],
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const SERVICES = new Map([
  ['cosmetic', 'Косметический ремонт'],
  ['capital', 'Капитальный ремонт'],
  ['turnkey', 'Отделка под ключ'],
  ['other', 'Другое'],
]);

// ---------- Ответы ----------

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });

  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });

  res.end(text);
}

// ---------- Валидация заявки ----------

/**
 * Проверяет данные с формы.
 * @param {unknown} input
 * @returns {{ errors: Record<string, string>, lead: { name: string, phone: string, service: string, message: string, consent: boolean } }}
 */
function validateLead(input) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};

  const name = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  const service = String(data.service || '').trim();
  const message = String(data.message || '').trim();
  const consent = data.consent === true;
  const phoneDigits = phone.replace(/\D/g, '');

  if (name.length < 2) {
    errors.name = 'Укажите имя — хотя бы 2 символа.';
  } else if (name.length > 80) {
    errors.name = 'Имя не длиннее 80 символов.';
  }

  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    errors.phone = 'Укажите телефон в формате +7 (999) 000-00-00.';
  }

  if (!SERVICES.has(service)) {
    errors.service = 'Выберите вид работ.';
  }

  if (message.length > 500) {
    errors.message = 'Комментарий не длиннее 500 символов.';
  }

  if (!consent) {
    errors.consent = 'Нужно согласие на обработку данных.';
  }

  return {
    errors,
    lead: { name, phone, service, message, consent },
  };
}

/**
 * Читает JSON из запроса с ограничением размера.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
async function readJson(req) {
  let body = '';
  req.setEncoding('utf8');

  for await (const chunk of req) {
    body += chunk;

    if (Buffer.byteLength(body, 'utf8') > 16 * 1024) {
      const error = new Error('Слишком большой запрос.');
      error.code = 'TOO_LARGE';
      throw error;
    }
  }

  if (!body.trim()) {
    const error = new Error('Пустой запрос.');
    error.code = 'BAD_JSON';
    throw error;
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Некорректный JSON.');
    error.code = 'BAD_JSON';
    throw error;
  }
}

// ---------- Telegram ----------

function formatLead(lead) {
  const time = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Moscow',
  }).format(new Date());

  return [
    '🛠 Новая заявка с лендинга «МастерДом»',
    '',
    `👤 Имя: ${lead.name}`,
    `📞 Телефон: ${lead.phone}`,
    `🧰 Услуга: ${SERVICES.get(lead.service) || lead.service}`,
    `💬 Комментарий: ${lead.message || '—'}`,
    '✅ Согласие: да',
    `🕒 Время: ${time} (МСК)`,
  ].join('\n');
}

async function sendTelegram(text) {
  if (DRY_RUN) {
    console.log('\n--- DRY RUN: сообщение не отправлено ---');
    console.log(text);
    console.log('--- конец сообщения ---\n');
    return;
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    const error = new Error('Telegram-бот не настроен.');
    error.code = 'CONFIG';
    throw error;
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.ok === false) {
    const error = new Error(result.description || `Telegram HTTP ${response.status}`);
    error.code = 'TELEGRAM';
    throw error;
  }
}

// ---------- API ----------

async function handleLead(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Используйте POST.' });
    return;
  }

  const contentType = req.headers['content-type'] || '';

  if (!contentType.includes('application/json')) {
    sendJson(res, 415, {
      ok: false,
      error: 'Ожидается Content-Type: application/json.',
    });
    return;
  }

  let input;

  try {
    input = await readJson(req);
  } catch (error) {
    const status = error.code === 'TOO_LARGE' ? 413 : 400;
    sendJson(res, status, { ok: false, error: error.message });
    return;
  }

  const { errors, lead } = validateLead(input);

  if (Object.keys(errors).length > 0) {
    sendJson(res, 400, { ok: false, errors });
    return;
  }

  try {
    await sendTelegram(formatLead(lead));
    console.log(`Заявка от ${lead.name} отправлена${DRY_RUN ? ' (DRY RUN)' : ''}.`);

    sendJson(res, 200, {
      ok: true,
      dryRun: DRY_RUN,
    });
  } catch (error) {
    console.error('Ошибка отправки в Telegram:', error.message);

    if (error.code === 'CONFIG') {
      sendJson(res, 503, {
        ok: false,
        error: 'Telegram-бот не настроен. Заполните telegram-bot/.env.',
      });
      return;
    }

    sendJson(res, 502, {
      ok: false,
      error: 'Не удалось отправить заявку в Telegram. Попробуйте позже.',
    });
  }
}

function handleHealth(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Используйте GET.' });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    telegramConfigured: Boolean(BOT_TOKEN && CHAT_ID),
    dryRun: DRY_RUN,
  });
}

// ---------- Статика ----------

async function handleStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }

  const fileName = STATIC_FILES.get(pathname);

  if (!fileName) {
    sendText(res, 404, 'Not found');
    return;
  }

  try {
    let data = await fs.readFile(path.join(ROOT, fileName));

    if (fileName === 'index.html') {
      // Подставляем endpoint только на локальном сервере.
      // На GitHub Pages meta-тег остаётся пустым — форма работает в демо-режиме.
      const html = data.toString('utf8');
      const injected = html.replace(
        '<meta name="form-endpoint" content="">',
        '<meta name="form-endpoint" content="/api/lead">'
      );

      data = Buffer.from(injected, 'utf8');
    }

    const headers = {
      'Content-Type': MIME_TYPES[path.extname(fileName)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': data.length,
    };

    res.writeHead(200, headers);

    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
  } catch (error) {
    console.error('Не удалось прочитать файл:', error.message);
    sendText(res, 500, 'Internal server error');
  }
}

// ---------- Сервер ----------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (pathname === '/api/health') {
      handleHealth(req, res);
      return;
    }

    if (pathname === '/api/lead') {
      await handleLead(req, res);
      return;
    }

    await handleStatic(req, res, pathname);
  } catch (error) {
    console.error('Необработанная ошибка:', error);

    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: 'Внутренняя ошибка сервера.' });
    } else {
      res.end();
    }
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} занят. Измените PORT в .env или остановите другой сервер.`);
  } else {
    console.error('Ошибка сервера:', error);
  }

  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Лендинг: http://${HOST}:${PORT}/`);
  console.log(`Health:  http://${HOST}:${PORT}/api/health`);

  if (DRY_RUN) {
    console.log('Режим: DRY_RUN — сообщения выводятся в консоль, в Telegram не уходят.');
  } else if (BOT_TOKEN && CHAT_ID) {
    console.log('Telegram: настроен.');
  } else {
    console.log('Telegram: НЕ настроен — заполните .env (BOT_TOKEN, CHAT_ID).');
  }
});

process.on('SIGINT', () => {
  console.log('\nОстанавливаю сервер...');
  server.close(() => process.exit(0));
});
