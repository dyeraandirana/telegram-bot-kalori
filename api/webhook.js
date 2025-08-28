import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const body = req.body;

  // Ambil file_id foto dari Telegram
  const fileId = body?.message?.photo?.pop()?.file_id;
  if (!fileId) {
    return res.status(200).send("No photo");
  }

  // Ambil URL file foto dari Telegram
  const tgResp = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  ).then(r => r.json());

  const filePath = tgResp.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

  // Ambil gambar dan convert ke base64
  const imageBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());
  const base64Image = Buffer.from(imageBuffer).toString("base64");

  // PROMPT khusus analisis makanan
  const prompt = `
Saya mengunggah sebuah foto makanan (misalnya nasi goreng dengan telur, ayam suwir, dan kerupuk). 
Bisakah Anda:

1. Estimasi total kalori dari hidangan tersebut.  
2. Rangkum perkiraan kalori dalam sebuah tabel.  
3. Kategorikan kandungan makronutrien (karbohidrat, protein, dan lemak) secara terperinci.  
4. Berikan perhitungan makronutrien tersebut dalam bentuk tabel.  
`;

  // Kirim ke Gemini 2.5
  const geminiResp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
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

  const replyText =
    geminiResp?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Maaf, tidak bisa analisis.";

  // Kirim balasan ke Telegram
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

  return res.status(200).send("OK");
}
