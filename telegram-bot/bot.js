require("dotenv").config();
const TelegramBotApi = require("node-telegram-bot-api");
const TelegramBot = TelegramBotApi.default || TelegramBotApi;

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

// Initialize Gemini Client explicitly passing the token
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const receiptsFolder = path.join(__dirname, "receipts");
const apiBaseUrl = process.env.POS_API_URL || "http://localhost:8080";

async function posApi(endpoint, options = {}) {
  const response = await fetch(`${apiBaseUrl}/api/bot${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", "x-bot-secret": process.env.BOT_API_SECRET || process.env.BOT_TOKEN || "", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "POS request failed");
    error.status = response.status;
    throw error;
  }
  return data;
}

if (!fs.existsSync(receiptsFolder)) {
  fs.mkdirSync(receiptsFolder);
}

// 👑 ADMIN SETUP: Put your personal Telegram ID here to receive approval alerts
const ADMIN_ID = 123456789; 

// 🔒 SECURITY SETUP: Allowed user list array (Starts with just the Admin inside)
const ALLOWED_USERS = [ADMIN_ID]; 

// Authorization validation wall helper
async function isAuthorized(msg) {
  const userId = msg.from.id;
  try {
    await posApi(`/employee/${userId}`);
  } catch (error) {
    const message = error.status === 404
      ? `⛔ Telegram ID ${userId} is not linked. Copy this exact number into your employee record.`
      : error.status === 401
        ? '⚠️ The bot cannot authenticate with the POS backend. Check BOT_API_SECRET in both .env files.'
        : `⚠️ The bot cannot reach the POS backend: ${error.message}`;
    await bot.sendMessage(msg.chat.id, message);
    return false;
  }
  return true;
}

// In-memory data store tracking extraction state per user session
const userSessions = {};

console.log("🤖 Receipt bot is running with dynamic /id admin approvals...");

async function deliverDecisionNotifications() {
  try {
    const notifications = await posApi('/notifications');
    for (const notification of notifications) {
      const icon = notification.status === 'approved' ? '✅' : '❌';
      const result = notification.status === 'approved' ? 'accepted' : 'rejected';
      const type = notification.request_type.replaceAll('_', ' ');
      const note = notification.review_note ? `\nManager note: ${notification.review_note}` : '';
      try {
        await bot.sendMessage(notification.telegram_id, `${icon} Your ${type} request #${notification.request_id} was ${result}.${note}`);
        await posApi(`/notifications/${notification.request_id}/read`, { method: 'POST', body: '{}' });
      } catch (error) { console.error(`Could not deliver request result ${notification.request_id}:`, error.message); }
    }
  } catch (error) { console.error('Could not poll POS request results:', error.message); }
}

setInterval(deliverDecisionNotifications, 5000);
deliverDecisionNotifications();

// /id Request Command (Bypasses regular auth checking so new users can run it)
bot.onText(/\/id/, async (msg) => {
  const employeeId = msg.from.id;
  try {
    const employee = await posApi(`/employee/${employeeId}`);
    await bot.sendMessage(msg.chat.id, `✅ Linked to ${employee.user_name}.\nTelegram ID: ${employeeId}`);
  } catch {
    await bot.sendMessage(msg.chat.id, `Your Telegram ID is: ${employeeId}\nAsk a manager to add it to your employee record in Employee Management.`);
  }
  return;
  const firstName = msg.from.first_name;
  const lastName = msg.from.last_name || "";
  const username = msg.from.username ? `@${msg.from.username}` : "No username";

  // If they are already approved, just send them their ID
  if (ALLOWED_USERS.includes(employeeId)) {
    await bot.sendMessage(msg.chat.id, `✅ You are already authorized.\n🆔 Your Telegram ID: \`${employeeId}\``, { parse_mode: "Markdown" });
    return;
  }

  // Notify the employee that their request is pending
  await bot.sendMessage(
    msg.chat.id,
    `⏳ **Request Sent!**\nYour ID (\`${employeeId}\`) has been forwarded to the manager. Please wait for confirmation.`,
    { parse_mode: "Markdown" }
  );

  // Send approval interface button directly to the Admin
  const adminMessage = `🔔 **New Access Request Received!**\n\n` +
    `👤 **Employee Name:** ${firstName} ${lastName}\n` +
    `💬 **Username:** ${username}\n` +
    `🆔 **Telegram ID:** \`${employeeId}\`\n\n` +
    `Do you want to authorize this user to use the receipt scanner?`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve / Authorize", callback_data: `approve_user:${employeeId}` },
          { text: "❌ Decline", callback_data: `decline_user:${employeeId}` }
        ]
      ]
    }
  };

  await bot.sendMessage(ADMIN_ID, adminMessage, options);
});

// /start Command
bot.onText(/\/start/, async (msg) => {
  if (!await isAuthorized(msg)) return;

  bot.sendMessage(
    msg.chat.id,
    `Hello ${msg.from.first_name}! 👋\n\nCommands:\n/shifts - this week's shifts\n/checkin - request shift check-in\n/receive_stock - scan a delivery receipt\n/use_stock INGREDIENT | QUANTITY - report ingredients used\n/refund REQUEST_NUMBER - attach the next image to a website refund request`
  );
});

bot.onText(/\/shifts/, async (msg) => {
  if (!await isAuthorized(msg)) return;
  try {
    const data = await posApi(`/shifts/${msg.from.id}`);
    if (!data.shifts.length) return bot.sendMessage(msg.chat.id, "No more shifts scheduled this week.");
    const lines = data.shifts.map(shift => `${shift.shift_date}: ${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)}${shift.notes ? ` (${shift.notes})` : ""}`);
    await bot.sendMessage(msg.chat.id, `📅 ${data.user.user_name}'s shifts\n\n${lines.join("\n")}`);
  } catch (error) { await bot.sendMessage(msg.chat.id, `❌ ${error.message}`); }
});

bot.onText(/^\/checkin(?:@\w+)?(?:\s+(\d+))?\s*$/, async (msg, match) => {
  if (!await isAuthorized(msg)) return;
  try {
    const data = await posApi(`/shifts/${msg.from.id}`);
    const todayShifts = data.shifts.filter(item => String(item.shift_date).slice(0, 10) === data.today);
    if (!todayShifts.length) return bot.sendMessage(msg.chat.id, 'You have no scheduled shifts today.');
    if (!match[1] && todayShifts.length > 1) {
      return bot.sendMessage(msg.chat.id, `Choose the shift you are checking in for:\n\n${todayShifts.map(shift => `/checkin ${shift.shift_id} — ${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)}`).join('\n')}`);
    }
    const shift = match[1] ? todayShifts.find(item => String(item.shift_id) === match[1]) : todayShifts[0];
    if (!shift) return bot.sendMessage(msg.chat.id, 'That shift is not on your schedule today. Use /shifts to see your schedule.');
    const request = await posApi('/requests', { method: 'POST', body: JSON.stringify({ telegramId: msg.from.id, type: 'shift_checkin', payload: { shiftId: shift.shift_id } }) });
    await bot.sendMessage(msg.chat.id, `⏳ Check-in request #${request.requestId} sent for manager confirmation.`);
  } catch (error) { await bot.sendMessage(msg.chat.id, `❌ ${error.message}`); }
});

bot.onText(/\/receive_stock/, async (msg) => {
  if (!await isAuthorized(msg)) return;
  userSessions[msg.chat.id] = { mode: 'stock_receipt' };
  await bot.sendMessage(msg.chat.id, "📷 Send a photo of the delivery receipt.");
});

bot.onText(/\/use_stock(?:\s+(.+))?/, async (msg, match) => {
  if (!await isAuthorized(msg)) return;
  const parts = String(match[1] || '').split('|').map(value => value.trim());
  const quantity = Number(parts[1]);
  if (!parts[0] || !Number.isFinite(quantity) || quantity <= 0) {
    return bot.sendMessage(msg.chat.id, 'Usage: /use_stock Ingredient Name | Quantity\nExample: /use_stock Whole Milk 3.5% | 2');
  }
  try {
    const request = await posApi('/requests', { method: 'POST', body: JSON.stringify({ telegramId: msg.from.id, type: 'stock_usage', payload: { itemName: parts[0], quantity, reportedAt: new Date().toISOString() } }) });
    await bot.sendMessage(msg.chat.id, `⏳ Stock usage request #${request.requestId} sent for manager confirmation.`);
  } catch (error) { await bot.sendMessage(msg.chat.id, `❌ ${error.message}`); }
});

bot.onText(/\/refund(?:\s+(\d+))?/, async (msg, match) => {
  if (!await isAuthorized(msg)) return;
  if (!match[1]) return bot.sendMessage(msg.chat.id, "First submit the refund form on the POS website, then use: /refund REQUEST_NUMBER");
  userSessions[msg.chat.id] = { mode: 'refund', requestId: match[1] };
  await bot.sendMessage(msg.chat.id, `📷 Send the evidence image for refund request #${match[1]}.`);
});

// Receive and Process Receipt Photos
bot.on("photo", async (msg) => {
  if (!await isAuthorized(msg)) return;

  const chatId = msg.chat.id;
  try {
    // Base64 expands images by ~1/3; keep evidence below the hosted API's 4 MB JSON limit.
    const photo = [...msg.photo].reverse().find(photo => !photo.file_size || photo.file_size <= 2.8 * 1024 * 1024);
    if (!photo) throw new Error('Please send a smaller photo (under 2.8 MB).');
    const pendingSession = userSessions[chatId];
    if (pendingSession?.mode === 'refund') {
      const evidencePath = await bot.downloadFile(photo.file_id, receiptsFolder);
      const evidenceData = `data:image/jpeg;base64,${fs.readFileSync(evidencePath).toString('base64')}`;
      const request = await posApi(`/refund-evidence/${pendingSession.requestId}`, { method: 'POST', body: JSON.stringify({ telegramId: msg.from.id, evidenceData }) });
      delete userSessions[chatId];
      return bot.sendMessage(chatId, `✅ Evidence attached to refund request #${request.requestId}. It is ready for manager review.`);
    }
    if (pendingSession?.mode !== 'stock_receipt') return bot.sendMessage(chatId, "Use /receive_stock before sending a delivery receipt.");
    const file = await bot.getFile(photo.file_id);

    const timestamp = Date.now();
    const filename = `receipt_${msg.from.id}_${timestamp}.jpg`;
    const filePath = path.join(receiptsFolder, filename);

    await bot.downloadFile(photo.file_id, receiptsFolder);

    const downloadedPath = path.join(receiptsFolder, path.basename(file.file_path));
    if (fs.existsSync(downloadedPath)) {
      fs.renameSync(downloadedPath, filePath);
    }

    console.log(`📷 Receipt received from ${msg.from.first_name}. Sending to Vision AI...`);
    const statusMsg = await bot.sendMessage(chatId, "⏳ Analyzing receipt image layout and math...");

    const structuredData = await parseReceiptWithAI(filePath);
    await bot.deleteMessage(chatId, statusMsg.message_id);

    userSessions[chatId] = {
      mode: 'stock_receipt',
      data: structuredData,
      isWaitingForEdit: false
    };

    await sendConfirmationPrompt(chatId);

  } catch (error) {
    console.error("Critical Execution Error:", error);
    bot.sendMessage(chatId, `❌ ${error.message || 'Something went wrong while processing the image.'}`);
  }
});

// Primary parsing mechanism executing Gemini Native Vision request
async function parseReceiptWithAI(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const imagePart = {
    inlineData: {
      data: fileBuffer.toString("base64"),
      mimeType: "image/jpeg"
    }
  };

  const prompt = `
    Look directly at this delivery receipt image.
    Extract the following details:
    1. Employee/Customer Name (or "Unknown" if missing)
    2. A list of items. For each item extract: Name, Quantity (qty), Unit Price, and Total Line Price.
    3. The Grand Total Price of the entire receipt.

    CRITICAL RULES FOR ACCURACY:
    - Look closely at column alignments. Do not confuse separate rows or columns.
    - Double check the math: ensure that (qty * unit_price) matches the total_price for every line item.
    - Fix common character misreads.
    - Exclude tax or shipping fees from individual items, but make sure the Grand Total captures the complete bottom line.

    Respond ONLY with a valid JSON object matching this schema structure:
    {
      "name": "string or null",
      "items": [
        { "item_name": "string", "qty": number, "unit_price": number, "total_price": number }
      ],
      "grand_total": number
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [imagePart, prompt], 
      config: { responseMimeType: "application/json" } 
    });

    return JSON.parse(response.text.trim());
  } catch (err) {
    console.error("❌ Gemini API Vision Error Details:", err.message || err);
    return { name: "Error parsing", items: [], grand_total: 0 };
  }
}

// Visual layout rendering structure
async function sendConfirmationPrompt(chatId) {
  const receipt = userSessions[chatId].data;
  
  let itemLines = "";
  if (receipt.items && receipt.items.length > 0) {
    receipt.items.forEach(item => {
      itemLines += `📦 ${item.item_name}\n   └ Qty: ${item.qty} | Unit: $${item.unit_price} | Total: $${item.total_price}\n`;
    });
  } else {
    itemLines = " No items found.";
  }

  const messageText = `📋 **Extracted Receipt Details**\n\n` +
    `👤 **Name:** ${receipt.name || "Not Found"}\n\n` +
    `🛒 **Items:**\n${itemLines}\n` +
    `💰 **Grand Total:** $${receipt.grand_total || 0}\n\n` +
    `Does this look correct?`;

  const options = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Yes, Save", callback_data: "confirm_ok" },
          { text: "✏️ No, Edit", callback_data: "confirm_edit" }
        ]
      ]
    }
  };

  await bot.sendMessage(chatId, messageText, options);
}

// Inline Keyboard Button Action Router
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);

  // Parse custom dynamic approval strings
  if (data.startsWith("approve_user:") || data.startsWith("decline_user:")) {
    const [action, targetUserIdStr] = data.split(":");
    const targetUserId = parseInt(targetUserIdStr, 10);

    // Clean up the card in the admin chat
    await bot.deleteMessage(chatId, messageId);

    if (action === "approve_user") {
      // Add the user to the runtime validation array list
      if (!ALLOWED_USERS.includes(targetUserId)) {
        ALLOWED_USERS.push(targetUserId);
      }
      
      // Notify Admin and Employee
      await bot.sendMessage(ADMIN_ID, `🟢 User ID \`${targetUserId}\` has been **Approved** and added to the whitelist.`, { parse_mode: "Markdown" });
      await bot.sendMessage(targetUserId, "🎉 **Access Granted!** Your registration was approved by the manager. You can now use the bot and send receipts.");
    } 
    else if (action === "decline_user") {
      await bot.sendMessage(ADMIN_ID, `🔴 User ID \`${targetUserId}\` has been **Declined**.`, { parse_mode: "Markdown" });
      await bot.sendMessage(targetUserId, "❌ **Access Denied.** Your registration request was declined by the manager.");
    }
    return;
  }

  // Standard Receipt flow confirmation actions
  await bot.deleteMessage(chatId, messageId);
  if (!userSessions[chatId]) return;

  if (data === "confirm_ok") {
    try {
      const request = await posApi('/requests', { method: 'POST', body: JSON.stringify({ telegramId: callbackQuery.from.id, type: 'stock_receipt', payload: userSessions[chatId].data }) });
      await bot.sendMessage(chatId, `⏳ Receipt request #${request.requestId} sent for manager confirmation.`);
      delete userSessions[chatId];
    } catch (error) { await bot.sendMessage(chatId, `❌ ${error.message}`); }
  } 
  else if (data === "confirm_edit") {
    userSessions[chatId].isWaitingForEdit = true;
    await bot.sendMessage(chatId, "✏️ Please type what needs to be changed (e.g., 'Change the total to 45.00').");
  }
});

// Handle normal text messages (For edits and fallback logging)
bot.on("message", async (msg) => {
  if (msg.photo) return;
  if (msg.text && msg.text.startsWith("/")) return;
  if (!await isAuthorized(msg)) return; 
  
  const chatId = msg.chat.id;

  if (userSessions[chatId] && userSessions[chatId].isWaitingForEdit) {
    const correctionInstruction = msg.text;
    
    const statusMsg = await bot.sendMessage(chatId, "🔄 AI is updating the structured receipt details...");
    const currentDataStr = JSON.stringify(userSessions[chatId].data);
    
    const updatePrompt = `
      You are modifying an existing receipt data object based on a user correction request.
      Current Data: ${currentDataStr}
      User Correction Instruction: "${correctionInstruction}"Apply the requested change and return the completely updated JSON object using the identical schema structure.`;
      try {
        const response = await ai.models.generateContent(
        {   model: "gemini-3.5-flash",
            contents: updatePrompt,
            config: { responseMimeType: "application/json" }
        });
        userSessions[chatId].data = JSON.parse(response.text.trim());
        userSessions[chatId].isWaitingForEdit = false;
        await bot.deleteMessage(chatId, statusMsg.message_id);
        await sendConfirmationPrompt(chatId);
    } catch (err) {
      console.error("❌ Gemini Edit Error Details:", err.message || err);
      await bot.sendMessage(chatId, "❌ Failed to apply edits. Please try again.");
      }
      return;
    }if (msg.text) {
      console.log(`💬 ${msg.from.first_name}: ${msg.text}`);
    }
  }
);
