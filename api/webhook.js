import fetch from "node-fetch";
import { google } from "googleapis";

// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

// Setup Google Sheets client
const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"]
);
const sheets = google.sheets({ version: "v4", auth });

// Gemini API call
async function analyzeFood(photoUrl) {
  const prompt = `
  Saya mengunggah sebuah foto makanan. Bisakah Anda:
  1. Deskripsikan makanan ini dengan gaya seperti teman bercerita.
  2. Estimasi total kalori dari hidangan tersebut.
  3. Kategorikan kandungan makronutrien (karbohidrat, protein, lemak).
  4. Berikan hasil dalam JSON terstruktur dengan format:
  {
    "deskripsi": "teks agak panjang",
    "kalori": 0,
    "karbo": 0,
    "protein": 0,
    "lemak": 0
  }
  Foto: ${photoUrl}
  `;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await res.json();
  try {
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (e) {
    console.error("Parse error:", e, data);
    return null;
  }
}

// Save to Google Sheets
async function saveToSheet({ nama, userId, photoUrl, deskripsi, kalori, karbo, protein, lemak }) {
  const timestamp = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A:G",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[timestamp, nama, userId, photoUrl, deskripsi, kalori, karbo, protein, lemak]],
    },
  });
}

// Telegram webhook handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot is running");
  }

  const update = req.body;

  if (update.message && update.message.photo) {
    const chatId = update.message.chat.id;
    const nama = update.message.from.first_name || "";
    const userId = update.message.from.id;
    const photoArr = update.message.photo;
    const fileId = photoArr[photoArr.length - 1].file_id;

    // Get photo URL
    const fileRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();
    const photoUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;

    // Analyze via Gemini
    const result = await analyzeFood(photoUrl);

    if (!result) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Maaf, aku nggak bisa analisis foto ini 😔",
        }),
      });
      return res.status(200).send("ok");
    }

    // Simpan ke Google Sheets
    await saveToSheet({
      nama,
      userId,
      photoUrl,
      deskripsi: result.deskripsi,
      kalori: result.kalori,
      karbo: result.karbo,
      protein: result.protein,
      lemak: result.lemak,
    });

    // Jawaban ke Telegram (hanya deskripsi aja, biar natural)
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: result.deskripsi,
      }),
    });
  }

  res.status(200).send("ok");
}
