"""Fix broken local image paths in the events table and test Supabase Storage upload."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2

# 1. Fix broken local paths in events table
print("=" * 60)
print("STEP 1: Fix broken local image paths in events table")
print("=" * 60)

conn = psycopg2.connect(
    host=os.getenv("DB_HOST"),
    port=int(os.getenv("DB_PORT", 6543)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    dbname=os.getenv("DB_NAME"),
)
cur = conn.cursor()

# Find events with local paths
cur.execute("SELECT id, title, image FROM events WHERE image LIKE '/uploads/%'")
broken = cur.fetchall()
print(f"\nFound {len(broken)} events with broken local paths:")
for row in broken:
    print(f"  [{row[0]}] {row[1]}: {row[2]}")

# Set them to NULL (will show placeholder)
if broken:
    ids = [row[0] for row in broken]
    cur.execute("UPDATE events SET image = NULL WHERE id = ANY(%s)", (ids,))
    conn.commit()
    print(f"\n[OK] Set image to NULL for events: {ids}")
    print("   These events will now show the placeholder image.")

cur.close()
conn.close()

# 2. Test Supabase Storage upload
print("\n" + "=" * 60)
print("STEP 2: Test Supabase Storage upload")
print("=" * 60)

from app.utils.supabase_storage import upload_file

# Create a small test image (1x1 pixel PNG)
import struct
import zlib

def create_tiny_png():
    """Create a minimal 1x1 white PNG."""
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT chunk
    raw_data = b'\x00\xff\xff\xff'  # filter byte + RGB
    compressed = zlib.compress(raw_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    return signature + ihdr + idat + iend

test_png = create_tiny_png()
print(f"\nCreated test PNG: {len(test_png)} bytes")

try:
    url = upload_file("event-images", test_png, "test_upload.png")
    print(f"[OK] Upload successful!")
    print(f"   Public URL: {url}")
except Exception as e:
    print(f"[FAIL] Upload failed: {e}")
    print("\nDebug info:")
    print(f"   SUPABASE_URL = {os.getenv('SUPABASE_URL', 'NOT SET')}")
    print(f"   SUPABASE_SERVICE_KEY = {'SET' if os.getenv('SUPABASE_SERVICE_KEY') else 'NOT SET'}")

# Also test avatar bucket
try:
    url = upload_file("avatars", test_png, "test_avatar.png")
    print(f"\n[OK] Avatar bucket upload successful!")
    print(f"   Public URL: {url}")
except Exception as e:
    print(f"\n[FAIL] Avatar bucket upload failed: {e}")
