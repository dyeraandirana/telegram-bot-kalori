import fetch from "node-fetch";
import { google } from "googleapis";

// Konfigurasi
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

// Setup Google Sheets API
const auth = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ["https://www.googleapis.com/auth/spreadsheets"]
);
const sheets = google.sheets({ version: "v4", auth });

// Helper: kirim pesan ke Telegram
async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const update = req.body;
    const message = update.message;

    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id || "";
    const userName =
      message.from?.first_name +
        (message.from?.last_name ? " " + message.from?.last_name : "") || "Anonim";

    let fileId;

    // Kasus 1: kirim sebagai foto
    if (message.photo) {
      const photo = message.photo[message.photo.length - 1];
      fileId = photo.file_id;
    }
    // Kasus 2: kirim sebagai dokumen gambar
    else if (message.document && message.document.mime_type.startsWith("image/")) {
      fileId = message.document.file_id;
    } else {
      await sendMessage(chatId, "Maaf, saya hanya bisa memproses foto/gambar 🙏");
      return res.status(200).json({ ok: true });
    }

    // Ambil file_path dari Telegram
    const fileResp = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileResp.json();

    if (!fileData.ok) {
      await sendMessage(chatId, "Maaf, tidak bisa mengambil file dari Telegram.");
      return res.status(200).json({ ok: true });
    }

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;

    // Analisis dengan Gemini
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Saya mengunggah sebuah foto makanan. 
Tolong analisis:
1. Estimasi total kalori dari hidangan tersebut.  
2. Rincikan makronutrien (karbohidrat, protein, lemak).  
3. Buat tabel sederhana untuk hasilnya.  
4. Buat deskripsi agak panjang seolah-olah menjelaskan ke teman dengan santai.  

Format JSON:
{
  "deskripsi": "penjelasan lengkap",
  "kalori": 0,
  "karbo": 0,
  "protein": 0,
  "lemak": 0
}`
                },
                { inline_data: { mime_type: "image/jpeg", data: "" } },
                { text: `Gambar ada di sini: ${fileUrl}` }
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiResp.json();
    const output = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      parsed = {
        deskripsi: output || "Tidak ada deskripsi.",
        kalori: 0,
        karbo: 0,
        protein: 0,
        lemak: 0,
      };
    }

    // Kirim jawaban singkat ke Telegram
    await sendMessage(chatId, parsed.deskripsi);

    // Simpan ke Google Sheets
    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            timestamp,
            userName,
            userId,
            fileUrl,
            parsed.deskripsi,
            parsed.kalori,
            parsed.karbo,
            parsed.protein,
            parsed.lemak,
          ],
        ],
      },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error webhook:", err);
    return res.status(500).send("Internal Server Error");
  }
}
