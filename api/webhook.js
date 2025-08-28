import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const body = req.body;

  try {
    if (body.message?.photo) {
      const chatId = body.message.chat.id;
      const photos = body.message.photo;
      const fileId = photos[photos.length - 1].file_id;

      // 1. ambil link file dari telegram
      const fileInfo = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
      ).then(r => r.json());

      const filePath = fileInfo.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

      // 2. ambil foto sebagai base64
      const imageBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());
      const base64Image = Buffer.from(imageBuffer).toString("base64");

      // 3. kirim ke Gemini
      const geminiResp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=" + process.env.GEMINI_API_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: "Tolong analisis foto makanan ini dan perkirakan jumlah kalorinya dalam bahasa Indonesia." },
                  { inline_data: { mime_type: "image/jpeg", data: base64Image } }
                ]
              }
            ]
          })
        }
      ).then(r => r.json());

      const resultText = geminiResp?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, tidak bisa analisis.";

      // 4. balas ke user
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: resultText })
      });
    }
  } catch (err) {
    console.error("Error:", err);
  }

  return res.status(200).send("OK");
}
