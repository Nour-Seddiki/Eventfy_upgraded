import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Connection settings come from backend/.env (DB_HOST, DB_USER, DB_PASSWORD, ...)
from app.db.session import engine

conn = engine.raw_connection()
cur = conn.cursor()

# Check which schemas have a "users" table
cur.execute("""
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name = 'users'
    ORDER BY table_schema
""")
rows = cur.fetchall()
print("=== TABLES NAMED 'users' ===")
for r in rows:
    print(f"  schema={r[0]}, table={r[1]}")

# Check which schema our app is using
cur.execute("SHOW search_path")
sp = cur.fetchone()
print(f"\n=== SEARCH PATH: {sp[0]} ===")

# Confirm our app's public.users table structure
cur.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users'
    ORDER BY ordinal_position
""")
cols = cur.fetchall()
print(f"\n=== public.users COLUMNS ({len(cols)}) ===")
for c in cols:
    print(f"  {c[0]}: {c[1]} (nullable={c[2]})")

# Check auth.users too
cur.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users'
    ORDER BY ordinal_position
""")
cols = cur.fetchall()
print(f"\n=== auth.users COLUMNS ({len(cols)}) ===")
for c in cols:
    print(f"  {c[0]}: {c[1]} (nullable={c[2]})")

# Check event IDs 11-17 more carefully (ones with NULL or local-path images)
cur.execute("SELECT id, title, image, organizer_id FROM events WHERE id >= 11 ORDER BY id")
rows = cur.fetchall()
print(f"\n=== EVENTS WITH PROBLEMATIC IMAGES ===")
for r in rows:
    print(f"  [{r[0]}] {r[1]}: image='{r[2]}', organizer_id={r[3]}")

# Check if Supabase Storage is available via API
# List all schemas
cur.execute("SELECT schema_name FROM information_schema.schemata ORDER BY schema_name")
schemas = cur.fetchall()
print(f"\n=== ALL SCHEMAS ===")
for s in schemas:
    print(f"  {s[0]}")

cur.close()
conn.close()
