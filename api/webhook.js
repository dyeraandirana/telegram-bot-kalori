import fetch from "node-fetch";
import { google } from "googleapis";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const body = req.body;

  // ✅ Ambil foto dari Telegram
  const fileId = body?.message?.photo?.pop()?.file_id;
  if (!fileId) {
    return res.status(200).send("No photo uploaded");
  }

  const tgResp = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  ).then(r => r.json());

  const filePath = tgResp.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

  // ✅ Convert foto ke base64
  const imageBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());
  const base64Image = Buffer.from(imageBuffer).toString("base64");

  // ✅ Prompt untuk Gemini (minta JSON)
  const prompt = `
Saya mengunggah foto makanan. Tolong analisis dan jawab hanya dalam JSON valid.

Format JSON:
{
  "kalori": 0,
  "karbo": 0,
  "protein": 0,
  "lemak": 0
}

Isi nilai berdasarkan perkiraan dari makanan dalam foto. Jangan ada teks lain selain JSON.
`;

  // ✅ Panggil Gemini
  const geminiResp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      process.env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Image } }
            ]
          }
        ]
      })
    }
  ).then(r => r.json());

  let resultText =
    geminiResp?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  // ✅ Bersihkan agar benar-benar JSON
  resultText = resultText.trim().replace(/```json|```/g, "");

  let data;
  try {
    data = JSON.parse(resultText);
  } catch (err) {
    console.error("JSON parse error:", err.message, resultText);
    data = { kalori: 0, karbo: 0, protein: 0, lemak: 0 };
  }

  // ✅ Balas ke Telegram dengan tabel rapi
  const replyText = `
📊 *Hasil Analisis Kalori*

Kalori : *${data.kalori}* kcal
Karbo  : *${data.karbo}* g
Protein: *${data.protein}* g
Lemak  : *${data.lemak}* g
`;

  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: body.message.chat.id,
        text: replyText,
        parse_mode: "Markdown"
      })
    }
  );

  // ✅ Simpan ke Google Sheets
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.SHEET_ID;

    const userName = body.message.from.first_name || "Anonim";
    const userId = body.message.from.id;
    const timestamp = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1!A:H",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            timestamp,
            userName,
            userId,
            fileUrl,
            data.kalori,
            data.karbo,
            data.protein,
            data.lemak
          ]
        ]
      }
    });
  } catch (err) {
    console.error("❌ Gagal simpan ke Sheet:", err.message);
  }

  return res.status(200).send("OK");
}
