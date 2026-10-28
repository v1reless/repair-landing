// ============================================================
// Автоматическая тестовая заявка
// ============================================================
//
// Сначала запустите сервер:
//   npm start
//
// Потом в другом терминале:
//   npm test
// ============================================================

const ENDPOINT = process.env.LEAD_ENDPOINT || 'http://127.0.0.1:8787/api/lead';

const lead = {
  name: 'Автотест',
  phone: '+7 (999) 000-00-00',
  service: 'capital',
  message: 'Автоматическая тестовая заявка. Проверка Telegram-бота.',
  consent: true,
  _subject: 'Тестовая заявка с лендинга',
};

async function main() {
  console.log(`Отправляю тестовую заявку на ${ENDPOINT}...`);

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(lead),
  });

  const data = await response.json().catch(() => ({}));

  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(data, null, 2));

  if (!response.ok || data.ok === false) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Не удалось отправить заявку:', error.message);
  console.error('Проверьте, что сервер запущен: npm start');
  process.exitCode = 1;
});
