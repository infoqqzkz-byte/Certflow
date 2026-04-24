import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("Bot started 🚀");

// 🔥 МАППИНГ (ТР ТС + СГР)
function detectHint(text) {
  const t = text.toLowerCase();

  // ТР ТС
  if (t.includes("аттракцион")) return "ТР ЕАЭС 038/2016";
  if (t.includes("масло")) return "ТР ТС 030/2012";
  if (t.includes("пищ")) return "ТР ТС 021/2011";
  if (t.includes("игрушк")) return "ТР ТС 008/2011";
  if (t.includes("одежд")) return "ТР ТС 017/2011";
  if (t.includes("обув")) return "ТР ТС 017/2011";
  if (t.includes("детск")) return "ТР ТС 007/2011";
  if (t.includes("лиф")) return "ТР ТС 011/2011";
  if (t.includes("газ")) return "ТР ТС 016/2011";
  if (t.includes("электро") || t.includes("кабель")) return "ТР ТС 004/2011 и 020/2011";
  if (t.includes("оборудование")) return "ТР ТС 010/2011";

  // СГР
  if (t.includes("космет")) return "Проверь СГР (ТР ТС 009/2011)";
  if (t.includes("бад")) return "Проверь СГР (ТР ТС 021/2011)";
  if (t.includes("детское питание")) return "СГР обязательно (ТР ТС 021/2011)";
  if (t.includes("химия")) return "Проверь СГР (бытовая химия)";

  return "";
}

// 🔥 /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🤖 CertFlow AI

Я помогаю:

📦 Определить код ТН ВЭД  
📋 Проверить необходимость СГР  
📑 Определить:
   • декларацию соответствия  
   • сертификат соответствия  

📚 Установить применимый ТР ТС  

🧾 Подсказать по регистрации товара в НКТ  


📌 Пример:
"Подлежит ли косметика СГР?"
"Как зарегистрировать товар НКТ"
"Определить код ТН ВЭД на кабель высоковольтный ƒ"`
  );
});

// 🔥 основной обработчик
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith("/")) return;

    const hint = detectHint(text);

    const userPrompt = `
Ты эксперт по сертификации ЕАЭС.

ЗАДАЧА:
1. Определи продукцию
2. Определи ТН ВЭД
3. Определи:
   - СГР
   - декларация
   - сертификат
4. Укажи ТР ТС
5. Обоснуй

Используй file_search.

Подсказка:
${hint}

Если нет данных:
"В загруженных документах информация не найдена"

Формат:

🔎 Продукция:
📦 ТН ВЭД:
📋 Требования:
📚 ТР ТС:
💡 Обоснование:

Вопрос: ${text}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: userPrompt,
      tools: [
        {
          type: "file_search",
          vector_store_ids: ["vs_69d8c21d7be88191b890a2e51983aa15"]
        }
      ]
    });

    let reply = response.output_text;

    // 🔥 фильтр
    if (!reply.includes("ТР") && !reply.includes("не найдена")) {
      reply = "В загруженных документах информация не найдена";
    }

    bot.sendMessage(chatId, reply);

  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, "Ошибка 😢");
  }
});