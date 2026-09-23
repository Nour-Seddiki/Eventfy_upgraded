import importlib
import os
import sys

import httpx
import pytest


@pytest.mark.anyio
async def test_app_smoke():
    """Smoke test: verify the app starts and exposes OpenAPI schema.

    Uses the Supabase PostgreSQL connection from the .env file.
    If DB_HOST is not set the test is skipped automatically.
    """
    if not os.getenv("DB_HOST"):
        pytest.skip("DB_HOST not set — skipping smoke test (no Supabase config)")

    for module in ("app.main", "app.db.session", "app.config"):
        if module in sys.modules:
            del sys.modules[module]

    app_module = importlib.import_module("app.main")
    transport = httpx.ASGITransport(app=app_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/openapi.json")
        assert response.status_code == 200
        payload = response.json()
        assert "paths" in payload
