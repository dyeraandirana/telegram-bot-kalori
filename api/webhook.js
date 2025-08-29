import fetch from "node-fetch";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

export default async function handler(req, res) {
  try {
    console.log("📩 Incoming update:", JSON.stringify(req.body, null, 2));

    const message = req.body.message;
    if (!message) {
      console.log("⚠️ No message in update");
      return res.status(200).end();
    }

    const chatId = message.chat.id;

    if (message.photo) {
      console.log("🖼 Ada foto");
      const fileId = message.photo[message.photo.length - 1].file_id;

      // Ambil file path
      const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
      const fileData = await fileResp.json();
      console.log("📂 File data:", fileData);

      if (!fileData.ok) {
        console.error("❌ Gagal getFile:", fileData);
        return res.status(200).end();
      }

      const filePath = fileData.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
      console.log("🔗 File URL:", fileUrl);

      // Test reply
      const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Foto diterima!\n${fileUrl}`,
        }),
      });

      const result = await resp.json();
      console.log("📤 Hasil sendMessage:", result);
    } else {
      console.log("✉️ Ada text:", message.text);
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Kamu bilang: ${message.text}`,
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("🔥 ERROR di handler:", err);
    return res.status(500).json({ error: err.message });
  }
}
