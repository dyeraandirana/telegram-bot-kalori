import fetch from "node-fetch";
import { google } from "googleapis";

// --- Google Sheets Auth ---
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);
const sheets = google.sheets({ version: "v4", auth });

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;
const SHEET_ID = process.env.SHEET_ID;
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent";

export default async function handler(req, res) {
  try {
    const update = req.body;
    console.log("📩 Incoming update:", JSON.stringify(update, null, 2));

    const message = update.message;
    if (!message) {
      console.log("⚠️ No message found");
      return res.status(200).end();
    }

    const chatId = message.chat.id;
    console.log("✅ ChatID:", chatId);

    // --- handle photo ---
    if (message.photo) {
      console.log("🖼 Photo detected");

      // Ambil foto dengan resolusi terbesar
      const fileId = message.photo[message.photo.length - 1].file_id;
      console.log("➡️ fileId:", fileId);

      // Get file path dari Telegram
      const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
      const fileData = await fileResp.json();
      console.log("📂 File data:", JSON.stringify(fileData));

      if (!fileData.ok) {
        console.error("❌ getFile gagal:", fileData);
        return res.status(200).end();
      }

      const filePath = fileData.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
      console.log("🔗 File URL:", fileUrl);

      // --- Kirim ke Gemini ---
      console.log("🚀 Kirim ke Gemini...");
      const geminiResp = await fetch(
        `${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: "Tolong analisis makanan di foto ini. Berikan deskripsi singkat seperti teman yang bercerita, lalu tabel gizi (kalori, karbo, protein, lemak) dalam angka." },
                  { inlineData: { mimeType: "image/png", data: "" } }, // kita isi data url kalau mau base64
                ],
              },
            ],
          }),
        }
      );

      const geminiData = await geminiResp.json();
      console.log("📨 Gemini response:", JSON.stringify(geminiData));

      let replyText = "Maaf, analisis gagal.";
      if (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
        replyText = geminiData.candidates[0].content.parts[0].text;
      }

      // --- Kirim balik ke Telegram ---
      console.log("💬 Kirim balik ke Telegram...");
      const tgSend = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
        }),
      });
      const tgResult = await tgSend.json();
      console.log("✅ Telegram sendMessage result:", JSON.stringify(tgResult));

      return res.status(200).json({ ok: true });
    }

    console.log("⚠️ Tidak ada foto, tidak diproses");
    return res.status(200).end();
  } catch (err) {
    console.error("🔥 Error di handler:", err);
    return res.status(500).json({ error: err.message });
  }
}
