// ============================================================
// Получение CHAT_ID для Telegram-бота
// ============================================================
//
// 1. Создайте бота через @BotFather.
// 2. Вставьте токен в telegram-bot/.env.
// 3. Откройте бота в Telegram и нажмите Start.
// 4. Запустите: npm run chat-id
// ============================================================

const { loadEnv } = require('./load-env');

loadEnv();

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

async function main() {
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN не найден.');
    console.error('Заполните telegram-bot/.env и запустите команду снова.');
    process.exitCode = 1;
    return;
  }

  const meResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
  const me = await meResponse.json().catch(() => ({}));

  if (!meResponse.ok || me.ok === false) {
    console.error('Не удалось проверить токен:', me.description || `HTTP ${meResponse.status}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Бот: @${me.result.username} (${me.result.first_name})`);

  const updatesResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
  const updates = await updatesResponse.json().catch(() => ({}));

  if (!updatesResponse.ok || updates.ok === false) {
    console.error('Не удалось получить сообщения:', updates.description || `HTTP ${updatesResponse.status}`);

    if (updates.error_code === 409) {
      console.error('У бота установлен webhook. Для локального теста его нужно удалить.');
    }

    process.exitCode = 1;
    return;
  }

  const chats = new Map();

  for (const update of updates.result || []) {
    const chat =
      update.message?.chat ||
      update.edited_message?.chat ||
      update.channel_post?.chat;

    if (chat) {
      chats.set(chat.id, chat);
    }
  }

  if (chats.size === 0) {
    console.log('Сообщений пока нет.');
    console.log('Откройте бота в Telegram, нажмите Start и отправьте /start.');
    console.log('Затем запустите npm run chat-id снова.');
    return;
  }

  console.log('\nНайденные чаты:');

  for (const [id, chat] of chats) {
    const name =
      [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
      chat.title ||
      chat.username ||
      'без имени';

    console.log(`CHAT_ID=${id} — ${name}`);
  }

  console.log('\nСкопируйте CHAT_ID в telegram-bot/.env.');
}

main().catch((error) => {
  console.error('Ошибка:', error.message);
  process.exitCode = 1;
});
