import fetch from "node-fetch";
import { google } from "googleapis";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const body = req.body;
    const message = body.message;

    if (!message || !message.photo) {
      return res.status(200).send("No photo received");
    }

    const chatId = message.chat.id;
    const userId = message.from.id;
    const userName = message.from.first_name || "Anon";

    // ambil foto resolusi paling besar
    const photoId = message.photo[message.photo.length - 1].file_id;
    const fileUrl = await getTelegramFileUrl(photoId);

    // analisis dengan Gemini
    const analysis = await analyzeWithGemini(fileUrl);

    // kirim balasan ke Telegram (deskripsi ramah)
    await sendTelegramMessage(chatId, analysis.deskripsi);

    // simpan ke Google Sheets
    await saveToGoogleSheets({
      timestamp: new Date().toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }),
      nama: userName,
      userId: userId,
      fotoUrl: fileUrl,
      deskripsi: analysis.deskripsi,
      kalori: analysis.kalori,
      karbo: analysis.karbo,
      protein: analysis.protein,
      lemak: analysis.lemak,
    });

    res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error: " + err.message);
  }
}

// ================= Helpers ================= //

async function getTelegramFileUrl(fileId) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
  );
  const data = await res.json();
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${data.result.file_path}`;
}

async function analyzeWithGemini(imageUrl) {
  const prompt = `
Saya mengunggah sebuah foto makanan. Tolong analisis:

1. Estimasi total kalori dari hidangan tersebut.
2. Buat ringkasan yang terdengar natural dan ramah, seolah-olah kamu seorang teman yang menjelaskan kalorinya kepada temannya.
3. Sertakan deskripsi singkat tentang sumber kalori (karbo, protein, lemak).
4. Output harus dalam format JSON seperti ini:

{
  "deskripsi": "penjelasan ramah",
  "kalori": number,
  "karbo": number,
  "protein": number,
  "lemak": number
}
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: await fetchBase64(imageUrl) } }
            ],
          },
        ],
      }),
    }
  );

  const data = await res.json();
  try {
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  } catch {
    return {
      deskripsi: "Maaf, aku belum bisa analisis makanan ini 🙏",
      kalori: 0,
      karbo: 0,
      protein: 0,
      lemak: 0,
    };
  }
}

async function fetchBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function sendTelegramMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function saveToGoogleSheets(row) {
  const auth = new google.auth.JWT(
    GOOGLE_CLIENT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "Sheet1!A:I",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          row.timestamp,
          row.nama,
          row.userId,
          row.fotoUrl,
          row.deskripsi,
          row.kalori,
          row.karbo,
          row.protein,
          row.lemak,
        ],
      ],
    },
  });
}
