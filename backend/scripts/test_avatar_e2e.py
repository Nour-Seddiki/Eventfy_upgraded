"""Test avatar upload on production backend."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

import httpx

API = "https://eventfy-backend-exhu.onrender.com"

# Step 1: Login
print("Step 1: Login...")
r = httpx.post(f"{API}/auth/token", data={
    "username": "rooozooo369@gmail.com",
    "password": "123456789"
}, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=60)
print(f"  Login status: {r.status_code}")

if r.status_code != 200:
    print(f"  Login response: {r.text[:300]}")
    sys.exit(1)

token = r.json().get("access_token", "")
print(f"  Token: {token[:30]}...")
auth = {"Authorization": f"Bearer {token}"}

# Step 2: Get current profile
print("\nStep 2: Get profile...")
r = httpx.get(f"{API}/users/my_profile", headers=auth, timeout=60)
print(f"  Profile status: {r.status_code}")
if r.status_code == 200:
    profile = r.json()
    print(f"  avatar_url: {profile.get('avatar_url')}")
    print(f"  username: {profile.get('username')}")

# Step 3: Upload a test avatar
print("\nStep 3: Upload test avatar...")
import struct, zlib

def make_png():
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_d = struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)
    ihdr_c = zlib.crc32(b'IHDR' + ihdr_d) & 0xffffffff
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_d + struct.pack('>I', ihdr_c)
    raw = b'\x00\xff\x00\x00\xff\x00\x00\x00\xff\x00\xff\x00'
    comp = zlib.compress(raw)
    idat_c = zlib.crc32(b'IDAT' + comp) & 0xffffffff
    idat = struct.pack('>I', len(comp)) + b'IDAT' + comp + struct.pack('>I', idat_c)
    iend_c = zlib.crc32(b'IEND') & 0xffffffff
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_c)
    return sig + ihdr + idat + iend

png_bytes = make_png()
files = {"image": ("test_avatar.png", png_bytes, "image/png")}
r = httpx.post(f"{API}/users/avatar", headers=auth, files=files, timeout=60)
print(f"  Upload status: {r.status_code}")
print(f"  Upload response: {r.text[:500]}")

# Step 4: Get profile again to check if avatar_url persisted
print("\nStep 4: Re-fetch profile...")
r = httpx.get(f"{API}/users/my_profile", headers=auth, timeout=60)
print(f"  Profile status: {r.status_code}")
if r.status_code == 200:
    profile = r.json()
    print(f"  avatar_url: {profile.get('avatar_url')}")
    if profile.get('avatar_url') and profile['avatar_url'].startswith('http'):
        print("  [OK] Avatar URL persisted!")
    else:
        print("  [FAIL] Avatar URL is still null/empty")
