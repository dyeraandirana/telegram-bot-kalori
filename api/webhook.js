import fetch from "node-fetch";
import { google } from "googleapis";

// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

// Google Sheets auth
const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

// 🔹 Gemini API call
async function analyzeFood(imageUrl) {
  const prompt = `
Saya mengunggah sebuah foto makanan. Tolong lakukan analisis:

1. Jelaskan secara singkat tapi ramah, seperti teman yang menjelaskan isi makanan tersebut.
2. Estimasikan total kalori.
3. Hitung kandungan makronutrien (karbohidrat, protein, lemak).
4. Jawablah dalam format JSON dengan struktur:
{
  "deskripsi": "penjelasan ramah",
  "kalori": angka,
  "karbo": angka,
  "protein": angka,
  "lemak": angka
}
  `;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: imageUrl } }
            ]
          }
        ]
      }),
    }
  );

  const data = await response.json();

  try {
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch (err) {
    console.error("Gemini parsing error:", err, data);
    return {
      deskripsi: "Maaf, aku belum bisa menganalisis fotonya.",
      kalori: 0,
      karbo: 0,
      protein: 0,
      lemak: 0
    };
  }
}

// 🔹 Save to Google Sheets
async function saveToSheet({ nama, userId, fotoUrl, result }) {
  const timestamp = new Date().toLocaleString("en-GB", { timeZone: "Asia/Jakarta" });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A:G",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          timestamp,
          nama,
          userId,
          fotoUrl,
          result.deskripsi,
          result.kalori,
          result.karbo,
          result.protein,
          result.lemak
        ]
      ]
    }
  });
}

// 🔹 Telegram webhook
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Bot aktif 🚀");
  }

  try {
    const update = req.body;

    if (update.message?.photo) {
      const chatId = update.message.chat.id;
      const nama = update.message.from.first_name || "User";
      const userId = update.message.from.id;

      // Ambil file_id (resolusi tertinggi)
      const fileId = update.message.photo.slice(-1)[0].file_id;

      // Dapatkan file_path dari Telegram API
      const fileResp = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileResp.json();
      const filePath = fileData.result.file_path;

      const fotoUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;

      // Analisis dengan Gemini
      const result = await analyzeFood(fotoUrl);

      // Simpan ke Google Sheets
      await saveToSheet({ nama, userId, fotoUrl, result });

      // Balas ke Telegram
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: result.deskripsi
        })
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Internal Server Error");
  }
}
