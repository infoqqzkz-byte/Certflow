import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import db from "./db.js";

// ======================
// INIT
// ======================

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ADMIN_ID = Number(process.env.ADMIN_ID);
const FREE_LIMIT = 3;

console.log("🚀 CertFlow AI started");

// ======================
// SAFE SEND
// ======================

async function safeSend(chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (e) {
    console.log("❌ send error:", chatId, e.message);
  }
}

// ======================
// USER
// ======================

function getUser(chatId) {
  let user = db.prepare("SELECT * FROM users WHERE id = ?").get(chatId);

  if (!user) {
    db.prepare("INSERT INTO users (id, count) VALUES (?, 0)").run(chatId);
    user = { id: chatId, count: 0, subscribed_until: null };
  }

  return user;
}

function isSubscribed(user) {
  return user.subscribed_until && new Date(user.subscribed_until) > new Date();
}

// ======================
// CLEAN
// ======================

function clean(text) {
  return text
    .replace(/【[^】]*】/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isEmpty(text) {
  if (!text) return true;
  const t = text.toLowerCase();

  return (
    !t.includes("тн") &&
    !t.includes("сертифик") &&
    !t.includes("сгр") &&
    !t.includes("тр") &&
    !t.includes("декларац")
  );
}

// ======================
// START
// ======================

bot.onText(/\/start/, (msg) => {
  safeSend(
    msg.chat.id,
`🚀 Проверь товар перед импортом в Казахстан за 10 секунд

Я скажу:
— нужен ли сертификат или СГР  
— какой ТН ВЭД код выбрать  
— какие требования и риски  

⚠️ Избежите штрафов и проблем на таможне

📩 Напишите:
👉 название товара  
или  
👉 код ТН ВЭД`,
    {
      reply_markup: {
        keyboard: [
          ["🔍 Проверить товар"],
          ["📦 Найти ТН ВЭД", "ℹ️ Как это работает"],
        ],
        resize_keyboard: true,
      },
    }
  );
});

// ======================
// BUY
// ======================

bot.onText(/\/buy/, (msg) => {
  safeSend(
    msg.chat.id,
`💳 Подписка CertFlow AI

Цена: 3300₸ / месяц  
Kaspi: +7777 0000 747

После оплаты нажмите кнопку 👇`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💰 Я оплатил", callback_data: "paid_request" }],
        ],
      },
    }
  );
});

// ======================
// CALLBACK
// ======================

bot.on("callback_query", async (query) => {
  const chatId = query.message?.chat?.id;
  const data = query.data;

  if (!chatId) return;

  // пользователь оплатил
  if (data === "paid_request") {
    await safeSend(chatId, "📨 Заявка отправлена админу");

    await safeSend(
      ADMIN_ID,
      `💳 Новая заявка\nUser: ${chatId}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Одобрить", callback_data: `approve_${chatId}` },
              { text: "❌ Отклонить", callback_data: `reject_${chatId}` },
            ],
          ],
        },
      }
    );
  }

  // одобрение
  if (data.startsWith("approve_")) {
    const userId = data.split("_")[1];

    const end = new Date();
    end.setMonth(end.getMonth() + 1);

    db.prepare(`
      UPDATE users
      SET subscribed_until = ?
      WHERE id = ?
    `).run(end.toISOString(), userId);

    await safeSend(chatId, "✅ Подписка выдана");
    await safeSend(userId, "🎉 Подписка активирована");
  }

  // отклонение
  if (data.startsWith("reject_")) {
    const userId = data.split("_")[1];

    db.prepare(`
      UPDATE users
      SET subscribed_until = NULL
      WHERE id = ?
    `).run(userId);

    await safeSend(chatId, "❌ Отклонено");
    await safeSend(userId, "❌ Оплата не подтверждена");
  }

  // полный разбор
  if (data === "full_report") {
    await safeSend(
      chatId,
`🔍 Полный разбор включает:

— точный ТН ВЭД  
— список документов  
— этапы оформления  
— риски  

👉 Напишите товар`
    );
  }
});

// ======================
// MAIN
// ======================

bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    // кнопки
    if (text === "🔍 Проверить товар") {
      return safeSend(
        chatId,
`Напишите товар 👇

Пример:
«Косметика»
«Одежда»
«БАДы»`
      );
    }

    if (text === "📦 Найти ТН ВЭД") {
      return safeSend(
        chatId,
`Введите товар 👇

Пример:
«Игрушки»
«Электроника»`
      );
    }

    if (text === "ℹ️ Как это работает") {
      return safeSend(
        chatId,
`Я анализирую товар и даю:

— ТН ВЭД  
— документы  
— техрегламент  
— риски  

Просто напишите товар`
      );
    }

    const user = getUser(chatId);
    const subscribed = isSubscribed(user);

    if (!subscribed && user.count >= FREE_LIMIT) {
      return safeSend(
        chatId,
`🚫 Бесплатные запросы закончились

👉 /buy`
      );
    }

    db.prepare("UPDATE users SET count = count + 1 WHERE id = ?").run(chatId);

    await safeSend(chatId, "⏳ Анализирую...");

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
Ты эксперт по сертификации ЕАЭС.

Ответ строго в формате:

📦 Товар:
📌 ТН ВЭД:
📄 Требуется:
📚 Техрегламент:
⚠️ Риски:
📊 Уровень риска:

Вопрос: ${text}
      `,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [process.env.VECTOR_STORE_ID],
        },
      ],
    });

    let reply = response.output_text;

    if (!reply || isEmpty(reply)) {
      reply = "⚠️ Недостаточно данных";
    }

    await safeSend(chatId, clean(reply));

    // дожим
    await safeSend(
      chatId,
`📄 Хотите полный разбор?

👉 Нажмите кнопку`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📄 Получить полный разбор", callback_data: "full_report" }],
          ],
        },
      }
    );

    // напоминание
    setTimeout(() => {
      safeSend(
        chatId,
`💡 Попробуйте ещё:

«Косметика»
«Одежда»
«Электроника»`
      );
    }, 60000);

  } catch (err) {
    console.log(err);
    safeSend(msg.chat.id, "Ошибка 😢");
  }
});