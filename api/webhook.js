import fetch from "node-fetch";
import { google } from "googleapis";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// setup google auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function appendToSheet(row) {
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A:A",
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  const body = req.body;
  console.log("Incoming update:", JSON.stringify(body));

  try {
    const message = body.message;
    if (!message || !message.photo) {
      return res.status(200).send("No photo");
    }

    // ambil file photo resolusi terbesar
    const fileId = message.photo[message.photo.length - 1].file_id;

    // ambil file_path dari Telegram
    const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileData = await fileResp.json();
    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;

    // kirim ke Gemini
    const prompt = `
Saya mengunggah sebuah foto makanan. 
Tolong:
1. Deskripsikan makanan secara singkat, gaya seperti teman yang cerita.
2. Estimasi total kalori.
3. Buat tabel kalori & makronutrien (Karbo, Protein, Lemak).
Format JSON seperti:
{
  "description": "deskripsi singkat",
  "kalori": 0,
  "karbo": 0,
  "protein": 0,
  "lemak": 0
}
    `;

    const geminiResp = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: "" } }, // opsional kalau perlu inline
            { text: `Foto URL: ${fileUrl}` }
          ]
        }]
      }),
    });

    const geminiData = await geminiResp.json();
    console.log("Gemini response:", JSON.stringify(geminiData));

    let textReply = "Maaf, tidak bisa analisis.";
    let kalori = "", karbo = "", protein = "", lemak = "", description = "";

    if (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const raw = geminiData.candidates[0].content.parts[0].text;
      try {
        const parsed = JSON.parse(raw);
        description = parsed.description;
        kalori = parsed.kalori;
        karbo = parsed.karbo;
        protein = parsed.protein;
        lemak = parsed.lemak;

        textReply = `${description}\n\nPerkiraan kalori: ${kalori} kcal\nKarbo: ${karbo}g | Protein: ${protein}g | Lemak: ${lemak}g`;
      } catch (err) {
        console.error("JSON parse error:", err);
        textReply = raw;
      }
    }

    // kirim balasan ke Telegram
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: textReply,
      }),
    });

    // simpan ke Google Sheets
    const timestamp = new Date().toISOString();
    const nama = `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim();
    const userId = message.from.id;

    await appendToSheet([timestamp, nama, userId, fileUrl, description, kalori, karbo, protein, lemak]);

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Error:", err);
    return res.status(200).send("Error");
  }
}
