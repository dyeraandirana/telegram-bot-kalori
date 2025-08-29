// api/webhook.js
export default async function handler(req, res) {
  try {
    // Log semua update yang masuk
    console.log("Incoming update:", JSON.stringify(req.body, null, 2));

    const update = req.body;

    // Pastikan ada message
    if (!update.message) {
      console.log("⚠️ No message field in update");
      return res.status(200).send("no message");
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || "";
    const photo = update.message.photo;

    console.log("✅ ChatID:", chatId);
    console.log("📝 Text:", text);
    console.log("🖼 Photo:", photo ? "yes" : "no");

    // Case 1: kalau ada foto
    if (photo) {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "📸 Foto diterima! (lagi aku proses...)",
        }),
      });
    } 
    // Case 2: kalau text
    else if (text) {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Halo! Kamu mengirim: ${text}`,
        }),
      });
    } 
    // Case 3: lainnya
    else {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Aku belum bisa memahami pesan ini 🤔",
        }),
      });
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).send("error");
  }
}
