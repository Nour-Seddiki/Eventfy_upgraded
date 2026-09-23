import qrcode
from io import BytesIO
import uuid

def generate_qr_code() -> tuple[str, bytes]:
    """
    Generate a unique ticket ID and its QR code image in bytes.

    Returns:
    - unique_id: str → the unique UUID for the ticket
    - qr_bytes: bytes → PNG image of the QR code
    """
    # 1️⃣ Generate unique UUID
    unique_id = str(uuid.uuid4())

    # 2️⃣ Create QR code image
    qr_img = qrcode.make(unique_id)

    # 3️⃣ Convert image to bytes
    buffer = BytesIO()
    qr_img.save(buffer, format="PNG")
    qr_bytes = buffer.getvalue()

    return unique_id, qr_bytes
