import os
import io
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters
import google.generativeai as genai
from http.server import HTTPServer
from telegram.ext.callbackcontext import CallbackContext
from telegram.ext.callbackqueryhandler import CallbackQueryHandler
from telegram.ext.messagehandler import MessageHandler

# Konfigurasi diambil dari Vercel Environment Variables
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)

gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest')

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Mengirim pesan sambutan saat perintah /start diberikan."""
    await update.message.reply_text('Halo! Kirimkan saya foto makanan, saya akan mencoba mengestimasi kalorinya.')

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Menangani foto yang diterima, menganalisisnya, dan membalas."""
    logger.info("Foto diterima, sedang diproses...")
    await update.message.reply_text('Sedang menganalisis foto, mohon tunggu...')

    try:
        # Dapatkan file foto
        photo_file = await update.message.photo[-1].get_file()
        photo_bytes = io.BytesIO(await photo_file.download_as_bytearray())

        # Buat prompt dan kirim ke Gemini bersama dengan gambar
        gemini_prompt = "Sebagai ahli gizi, berikan estimasi kalori dan makronutrien (karbohidrat, protein, lemak) untuk makanan dalam foto ini. Sajikan jawaban dengan jelas dan ringkas."
        
        # Panggilan ke Gemini Multimodal (Langsung dengan gambar)
        response = gemini_model.generate_content([gemini_prompt, photo_bytes])
        
        # Kirim respons kembali ke Telegram
        await update.message.reply_text(response.text)

    except Exception as e:
        logger.error(f"Terjadi kesalahan: {e}")
        await update.message.reply_text(f"Maaf, terjadi kesalahan saat memproses gambar.")

def main() -> None:
    """Jalankan bot."""
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, start))

    application.run_webhook(
        listen="0.0.0.0",
        port=int(os.environ.get('PORT', '8443')),
        url_path=os.environ.get("URL_PATH", TELEGRAM_BOT_TOKEN),
        webhook_url=os.environ.get("WEBHOOK_URL", f"https://<YOUR_VERCEL_APP_URL>.vercel.app/{TELEGRAM_BOT_TOKEN}")
    )

if __name__ == "__main__":
    main()
