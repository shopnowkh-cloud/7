import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import json
import logging
from http.server import BaseHTTPRequestHandler
from telegram import Update

import bot as _bot

logger = logging.getLogger(__name__)

_loop = asyncio.new_event_loop()
asyncio.set_event_loop(_loop)

_initialized = False


async def _init_once():
    global _initialized
    if _initialized:
        return
    _bot._register_handlers()
    _bot.application.post_init = _bot._on_startup_webhook
    await _bot.application.initialize()
    _initialized = True


async def _handle_update(update_data: dict):
    await _init_once()
    update = Update.de_json(update_data, _bot._bot)
    await _bot.application.process_update(update)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            update_data = json.loads(body)
            _loop.run_until_complete(_handle_update(update_data))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
        except Exception as e:
            logger.error(f"Webhook error: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Telegram webhook active.")

    def log_message(self, format, *args):
        pass
