"""Telegram sidecar worker (Telethon).

Long-running process that owns the MTProto user clients for Social Monitor:
the multi-step login flow, connection lifecycle and NewMessage listening.

Every captured message is forwarded to the NestJS API internal ingest
endpoint (POST /api/internal/telegram/ingest) — dedup, target resolution and
notification routing stay in NestJS. Media payloads are never downloaded.

Env vars:
  TELEGRAM_API_ID / TELEGRAM_API_HASH        Telegram API credentials (required)
  TELEGRAM_INGEST_URL                        default http://localhost:3001/api/internal/telegram/ingest
  INTERNAL_API_SECRET                        shared secret (X-Internal-Secret header)
  TELEGRAM_WORKER_HOST / TELEGRAM_WORKER_PORT  default 0.0.0.0 / 9400
  TELEGRAM_CONNECT_TIMEOUT                   default 20 (seconds)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

from aiohttp import ClientSession, ClientTimeout, web
from telethon import TelegramClient, events
from telethon.errors import (
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession
from telethon.tl.types import Channel, Chat, User
from telethon.tl.types.auth import SentCodeTypeApp

API_ID = int(os.environ.get("TELEGRAM_API_ID") or 0)
API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
INGEST_URL = os.environ.get(
    "TELEGRAM_INGEST_URL",
    "http://localhost:3001/api/internal/telegram/ingest",
)
INTERNAL_SECRET = os.environ.get("INTERNAL_API_SECRET", "")
HOST = os.environ.get("TELEGRAM_WORKER_HOST", "0.0.0.0")
PORT = int(os.environ.get("TELEGRAM_WORKER_PORT") or 9400)
CONNECT_TIMEOUT = float(os.environ.get("TELEGRAM_CONNECT_TIMEOUT") or 20)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("telegram-worker")


class ApiError(Exception):
    """Maps to a JSON error response toward the NestJS proxy."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def json_error(status: int, code: str, message: str) -> web.Response:
    return web.json_response({"message": message, "code": code}, status=status)


@web.middleware
async def error_middleware(request: web.Request, handler):
    try:
        return await handler(request)
    except ApiError as error:
        return json_error(error.status, error.code, error.message)
    except web.HTTPException:
        raise
    except Exception as error:  # pragma: no cover - defensive
        log.exception("unhandled error on %s %s", request.method, request.path)
        return json_error(500, "INTERNAL_ERROR", str(error))


def dialog_to_dto(dialog: Any) -> dict:
    """Maps a Telethon dialog to the TelegramDialogDto shape used by NestJS."""
    entity = getattr(dialog, "entity", None)
    username = None
    if isinstance(entity, Channel):
        dtype = "megagroup" if entity.megagroup else "channel"
        username = entity.username
    elif isinstance(entity, Chat):
        dtype = "group"
    elif isinstance(entity, User):
        dtype = "user"
        username = entity.username
    else:
        dtype = "user"
    return {
        "id": str(dialog.id),
        "title": dialog.title or "",
        "username": username,
        "type": dtype,
    }


class TelegramWorker:
    """Holds one Telethon client per logged-in account."""

    def __init__(self) -> None:
        self.clients: dict[str, TelegramClient] = {}
        self.code_hashes: dict[str, str] = {}
        self.current_phone: str | None = None
        self.http: ClientSession | None = None

    # ------------------------------------------------------------- helpers

    def check_secret(self, request: web.Request) -> None:
        if INTERNAL_SECRET and request.headers.get("X-Internal-Secret") != INTERNAL_SECRET:
            raise ApiError(401, "UNAUTHORIZED", "invalid internal secret")

    def ensure_credentials(self) -> None:
        if not API_ID or not API_HASH:
            raise ApiError(
                503,
                "TELEGRAM_NOT_CONFIGURED",
                "TELEGRAM_API_ID and TELEGRAM_API_HASH are not configured",
            )

    def require_client(self, phone: str) -> TelegramClient:
        client = self.clients.get(phone)
        if client is None:
            raise ApiError(
                400,
                "TELEGRAM_NO_PENDING_LOGIN",
                "No in-memory client for this phone. Call /login/start first.",
            )
        return client

    def require_current_client(self) -> TelegramClient:
        if not self.current_phone or self.current_phone not in self.clients:
            raise ApiError(
                409,
                "TELEGRAM_NOT_CONNECTED",
                "No active Telegram session. Login first via /api/telegram/login.",
            )
        return self.clients[self.current_phone]

    async def connect_client(self, client: TelegramClient, phone: str) -> None:
        try:
            await asyncio.wait_for(client.connect(), CONNECT_TIMEOUT)
        except Exception as error:
            try:
                await client.disconnect()
            except Exception:
                pass
            self.clients.pop(phone, None)
            log.error("connect failed phone=%s: %s", phone, error)
            raise ApiError(
                503,
                "TELEGRAM_CONNECT_TIMEOUT",
                "连接 Telegram 服务器超时：当前网络无法直连 Telegram，请通过代理运行或将 API 部署到可访问 Telegram 的服务器",
            )
        log.info("telegram.connected phone=%s", phone)

    def attach_listener(self, client: TelegramClient, phone: str) -> None:
        client.add_event_handler(
            lambda event: asyncio.create_task(self.on_new_message(phone, event)),
            events.NewMessage(),
        )

    # --------------------------------------------------- message forwarding

    async def on_new_message(self, phone: str, event: Any) -> None:
        try:
            message = event.message
            content = message.message
            if not content:
                return
            # Telethon marked ids: channels -> -100xxxxxxxxxx (matches the
            # externalId stored in the MonitorTarget table).
            chat_id = message.chat_id
            if chat_id is None:
                return

            sender = None
            try:
                sender = event.sender or await event.get_sender()
            except Exception:
                sender = None

            sender_payload = None
            if isinstance(sender, User):
                sender_payload = {
                    "id": str(sender.id) if sender.id is not None else None,
                    "username": sender.username,
                    "firstName": sender.first_name,
                    "lastName": sender.last_name,
                }

            payload = {
                "chatId": str(chat_id),
                "messageId": message.id,
                "content": content,
                "date": int(message.date.timestamp()) if message.date else int(time.time()),
                "sender": sender_payload,
            }
            await self.forward(payload)
        except Exception:  # pragma: no cover - never break the client loop
            log.exception("failed to handle incoming message")

    async def forward(self, payload: dict) -> None:
        if self.http is None:
            return
        try:
            async with self.http.post(
                INGEST_URL,
                json=payload,
                headers={"X-Internal-Secret": INTERNAL_SECRET},
                timeout=ClientTimeout(total=10),
            ) as response:
                if response.status >= 400:
                    body = await response.text()
                    log.error(
                        "ingest failed status=%s chatId=%s messageId=%s body=%s",
                        response.status,
                        payload["chatId"],
                        payload["messageId"],
                        body[:200],
                    )
                else:
                    log.info(
                        "message.ingested chatId=%s messageId=%s",
                        payload["chatId"],
                        payload["messageId"],
                    )
        except Exception as error:
            log.error("ingest error chatId=%s: %s", payload.get("chatId"), error)

    # -------------------------------------------------------------- routes

    async def handle_health(self, request: web.Request) -> web.Response:
        connected = False
        if self.current_phone:
            client = self.clients.get(self.current_phone)
            connected = bool(client and client.is_connected())
        return web.json_response(
            {
                "status": "ok",
                "currentPhone": self.current_phone,
                "connected": connected,
            }
        )

    async def handle_login_start(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        self.ensure_credentials()
        body = await request.json()
        phone = str(body.get("phone", "")).strip()
        if not phone:
            raise ApiError(400, "VALIDATION_FAILED", "phone is required")

        previous = self.clients.get(phone)
        if previous is not None:
            try:
                await previous.disconnect()
            except Exception:
                pass
            self.clients.pop(phone, None)

        client = TelegramClient(StringSession(), API_ID, API_HASH, connection_retries=2)
        self.attach_listener(client, phone)
        self.clients[phone] = client
        await self.connect_client(client, phone)

        try:
            sent = await asyncio.wait_for(client.send_code_request(phone), 30)
        except Exception as error:
            self.clients.pop(phone, None)
            try:
                await client.disconnect()
            except Exception:
                pass
            raise ApiError(400, "TELEGRAM_AUTH_FAILED", str(error))

        self.code_hashes[phone] = sent.phone_code_hash
        is_code_via_app = False
        try:
            is_code_via_app = isinstance(sent.type, SentCodeTypeApp)
        except Exception:
            pass
        return web.json_response(
            {
                "phone": phone,
                "phoneCodeHash": sent.phone_code_hash,
                "isCodeViaApp": is_code_via_app,
            }
        )

    async def handle_login_code(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        body = await request.json()
        phone = str(body.get("phone", "")).strip()
        code = str(body.get("code", "")).strip()
        client = self.require_client(phone)

        phone_code_hash = self.code_hashes.get(phone)
        if not phone_code_hash:
            raise ApiError(
                400,
                "TELEGRAM_NO_PENDING_CODE",
                "No pending login code for this phone. Call /login/start first.",
            )

        try:
            await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            return web.json_response({"phone": phone, "passwordRequired": True})
        except (PhoneCodeInvalidError, PhoneCodeExpiredError) as error:
            raise ApiError(400, "TELEGRAM_AUTH_FAILED", type(error).__name__)
        except Exception as error:
            raise ApiError(400, "TELEGRAM_AUTH_FAILED", str(error))

        self.code_hashes.pop(phone, None)
        self.current_phone = phone
        log.info("telegram.login_success phone=%s", phone)
        return web.json_response({"phone": phone, "passwordRequired": False})

    async def handle_login_password(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        body = await request.json()
        phone = str(body.get("phone", "")).strip()
        password = str(body.get("password", ""))
        client = self.require_client(phone)

        try:
            await client.sign_in(password=password)
        except Exception as error:
            raise ApiError(400, "TELEGRAM_AUTH_FAILED", str(error))

        self.current_phone = phone
        log.info("telegram.login_success phone=%s (2fa)", phone)
        return web.json_response({"phone": phone})

    async def handle_save_session(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        body = await request.json()
        phone = str(body.get("phone", "")).strip()
        client = self.require_client(phone)
        return web.json_response({"phone": phone, "session": client.session.save()})

    async def handle_connect(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        self.ensure_credentials()
        body = await request.json()
        phone = str(body.get("phone", "")).strip()
        session = str(body.get("session", ""))
        if not phone:
            raise ApiError(400, "VALIDATION_FAILED", "phone is required")

        try:
            string_session = StringSession(session)
        except Exception as error:
            log.warning("invalid session for phone=%s: %s", phone, error)
            raise ApiError(
                400,
                "TELEGRAM_SESSION_INVALID",
                "Stored session is not a valid Telethon session. Re-login required.",
            )

        previous = self.clients.get(phone)
        if previous is not None:
            try:
                await previous.disconnect()
            except Exception:
                pass
            self.clients.pop(phone, None)

        client = TelegramClient(string_session, API_ID, API_HASH, connection_retries=2)
        self.attach_listener(client, phone)
        self.clients[phone] = client
        await self.connect_client(client, phone)
        self.current_phone = phone
        log.info("collector.started phone=%s", phone)
        return web.json_response({"phone": phone, "connected": True})

    async def handle_disconnect(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        body = await request.json()
        phone = str(body.get("phone", "")).strip()

        client = self.clients.pop(phone, None)
        self.code_hashes.pop(phone, None)
        if client is not None:
            try:
                await client.disconnect()
            except Exception:
                pass
        if self.current_phone == phone:
            self.current_phone = None
        log.info("collector.stopped phone=%s", phone)
        return web.json_response({"phone": phone, "disconnected": True})

    async def list_dialogs(self, channel_only: bool, group_only: bool) -> list:
        client = self.require_current_client()
        dialogs = await client.get_dialogs()
        selected = []
        for dialog in dialogs:
            entity = getattr(dialog, "entity", None)
            is_megagroup = isinstance(entity, Channel) and bool(entity.megagroup)
            if channel_only:
                keep = dialog.is_channel and isinstance(entity, Channel) and not is_megagroup
            elif group_only:
                keep = dialog.is_group or is_megagroup
            else:
                keep = True
            if keep:
                selected.append(dialog_to_dto(dialog))
        return selected

    async def handle_dialogs(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        return web.json_response({"data": await self.list_dialogs(False, False)})

    async def handle_channels(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        return web.json_response({"data": await self.list_dialogs(True, False)})

    async def handle_groups(self, request: web.Request) -> web.Response:
        self.check_secret(request)
        return web.json_response({"data": await self.list_dialogs(False, True)})

    # ----------------------------------------------------------- lifecycle

    async def shutdown(self) -> None:
        for phone, client in list(self.clients.items()):
            try:
                await client.disconnect()
            except Exception:
                pass
            log.info("collector.stopped phone=%s", phone)
        self.clients.clear()
        if self.http is not None:
            try:
                await self.http.close()
            except Exception:
                pass


def build_app(worker: TelegramWorker) -> web.Application:
    app = web.Application(middlewares=[error_middleware])
    app.router.add_get("/health", worker.handle_health)
    app.router.add_get("/status", worker.handle_health)
    app.router.add_post("/login/start", worker.handle_login_start)
    app.router.add_post("/login/code", worker.handle_login_code)
    app.router.add_post("/login/password", worker.handle_login_password)
    app.router.add_post("/save-session", worker.handle_save_session)
    app.router.add_post("/connect", worker.handle_connect)
    app.router.add_post("/disconnect", worker.handle_disconnect)
    app.router.add_get("/dialogs", worker.handle_dialogs)
    app.router.add_get("/channels", worker.handle_channels)
    app.router.add_get("/groups", worker.handle_groups)
    return app


async def main() -> None:
    worker = TelegramWorker()
    worker.http = ClientSession()
    app = build_app(worker)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, HOST, PORT)
    await site.start()
    log.info(
        "telegram worker listening on %s:%s (ingest -> %s)", HOST, PORT, INGEST_URL
    )
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await worker.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
