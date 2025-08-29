// api/webhook.js
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(200).send("OK");

    const update = req.body;
    console.log("📩 Incoming update:", JSON.stringify(update, null, 2));

    const msg = update.message;
    if (!msg) return res.status(200).send("no message");

    const chatId = msg.chat.id;

    // Balas teks biasa (echo)
    if (msg.text) {
      const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: `Kamu nulis: ${msg.text}` }),
      });
      console.log("📤 sendMessage(text):", await resp.json());
      return res.status(200).send("ok");
    }

    // Ambil gambar baik sebagai photo maupun document (screenshot/file)
    let fileId = null;
    if (msg.photo?.length) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      console.log("🖼 photo file_id:", fileId);
    } else if (msg.document?.mime_type?.startsWith("image/")) {
      fileId = msg.document.file_id;
      console.log("🖼 document file_id:", fileId);
    }

    if (!fileId) {
      const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "Kirim teks atau foto ya 🙏" }),
      });
      console.log("📤 sendMessage(no file):", await resp.json());
      return res.status(200).send("ok");
    }

    // Dapatkan file_path dari Telegram
    const fileInfo = await (await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`)).json();
    console.log("📂 getFile:", fileInfo);

    if (!fileInfo.ok) {
      const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "Gagal ambil file dari Telegram 😕" }),
      });
      console.log("📤 sendMessage(getFile fail):", await resp.json());
      return res.status(200).send("ok");
    }

    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.result.file_path}`;
    console.log("🔗 fileUrl:", fileUrl);

    // Balas link fotonya (tes)
    const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `✅ Foto diterima!\n${fileUrl}` }),
    });
    console.log("📤 sendMessage(photo):", await resp.json());

    return res.status(200).send("ok");
  } catch (e) {
    console.error("🔥 handler error:", e);
    return res.status(500).send("error");
  }
}
