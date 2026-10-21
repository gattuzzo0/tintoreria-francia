from __future__ import annotations

# El 302 de /file no puede llevar Allow-Credentials: el navegador se lo exigiría a R2.
_DROP = (b"access-control-allow-credentials", b"access-control-allow-origin")


class PhotoFileCorsMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if "/photos/" not in path or not path.endswith("/file"):
            await self.app(scope, receive, send)
            return

        async def send_fixed(message):
            if message["type"] == "http.response.start":
                headers = [(name, value) for name, value in message["headers"] if name.lower() not in _DROP]
                headers.append((b"access-control-allow-origin", b"*"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_fixed)
