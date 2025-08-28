import os
import io
import logging
import json
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
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

# Buat bot dan tambahkan handler
app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, start))

# Definisikan fungsi webhook yang akan dipanggil oleh Vercel
async def webhook(request):
    """Menangani webhook dari Telegram."""
    try:
        data = await request.json()
        update = Update.de_json(data, app.bot)
        await app.process_update(update)
        return {'statusCode': 200}
    except Exception as e:
        logger.error(f"Error processing webhook: {e}")
        return {'statusCode': 500, 'body': f'Error: {e}'}

# Vercel akan mencari variabel 'app' di level atas
app.run_webhook = webhook
