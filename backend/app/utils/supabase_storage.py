"""
Supabase Storage upload helper.

Uses the Supabase Storage REST API to upload files and return public CDN URLs.
Requires SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables. Without a
service key (local development) files are saved under ./uploads, which the API
serves at /uploads — that disk is not persistent on hosts like Render.
"""

import os
import httpx
from uuid import uuid4
from pathlib import Path

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://lokbyexvugoctnliwmcy.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
LOCAL_UPLOAD_DIR = Path("uploads")  # same directory app.main mounts at /uploads


def _headers(content_type: str = "application/octet-stream") -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
        "Content-Type": content_type,
    }


def upload_file(bucket: str, file_bytes: bytes, original_filename: str) -> str:
    """
    Upload a file to Supabase Storage and return the public URL.

    Args:
        bucket: Storage bucket name (e.g. 'event-images', 'avatars')
        file_bytes: Raw bytes of the file
        original_filename: Original filename (used to extract extension)

    Returns:
        Public HTTPS URL for the uploaded file

    Raises:
        ValueError: If the file is too large
        RuntimeError: If the upload fails
    """
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(f"Images must be {MAX_UPLOAD_BYTES // (1024 * 1024)} MB or smaller")

    ext = Path(original_filename).suffix.lower() or ".jpg"
    storage_path = f"{uuid4().hex}{ext}"

    if not SUPABASE_SERVICE_KEY:
        folder = LOCAL_UPLOAD_DIR / bucket
        folder.mkdir(parents=True, exist_ok=True)
        (folder / storage_path).write_bytes(file_bytes)
        return f"/uploads/{bucket}/{storage_path}"

    # Determine content type
    content_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{storage_path}"

    resp = httpx.post(
        url,
        content=file_bytes,
        headers=_headers(content_type),
        timeout=30.0,
    )

    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Supabase Storage upload failed ({resp.status_code}): {resp.text}"
        )

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}"
    return public_url
