import fetch from "node-fetch";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

export default async function handler(req, res) {
  try {
    const update = req.body;
    console.log("📩 Incoming update:", JSON.stringify(update, null, 2));

    const message = update.message;
    if (!message) return res.status(200).end();

    const chatId = message.chat.id;

    if (message.photo) {
      const fileId = message.photo[message.photo.length - 1].file_id;

      // Ambil file path dari Telegram
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

      // BALAS langsung di Telegram pakai URL foto
      const tgSend = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Foto diterima!\nLink: ${fileUrl}`,
        }),
      });

      const tgResult = await tgSend.json();
      console.log("✅ Telegram sendMessage result:", JSON.stringify(tgResult));
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("🔥 Error di handler:", err);
    return res.status(500).json({ error: err.message });
  }
}
