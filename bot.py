import os
import io
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, WebhookHandler
import google.generativeai as genai

# Konfigurasi diambil dari Vercel Environment Variables
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)

gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest')

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text('Halo! Kirimkan saya foto makanan, saya akan mencoba mengestimasi kalorinya.')

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.info("Foto diterima, sedang diproses...")
    await update.message.reply_text('Sedang menganalisis foto, mohon tunggu...')

    try:
        photo_file = await update.message.photo[-1].get_file()
        photo_bytes = io.BytesIO(await photo_file.download_as_bytearray())

        gemini_prompt = "Sebagai ahli gizi, berikan estimasi kalori dan makronutrien (karbohidrat, protein, lemak) untuk makanan dalam foto ini. Sajikan jawaban dengan jelas dan ringkas."
        
        response = gemini_model.generate_content([gemini_prompt, photo_bytes])
        
        await update.message.reply_text(response.text)

    except Exception as e:
        logger.error(f"Terjadi kesalahan: {e}")
        await update.message.reply_text(f"Maaf, terjadi kesalahan saat memproses gambar.")

async def webhook(request):
    """Fungsi utama untuk webhook Vercel."""
    
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, start))

    update = Update.de_json(request.json, application.bot)
    await application.process_update(update)

def main():
    """Fungsi ini tidak berjalan di Vercel, tapi diperlukan untuk local testing."""
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, start))
    application.run_polling()

if __name__ == '__main__':
    # Saat di Vercel, fungsi webhook akan dipanggil
    # Saat di lokal, main akan dipanggil
    if "VERCEL_ENV" in os.environ:
        from vercel_app import VercelApp
        app = VercelApp(webhook)
    else:
        main()
