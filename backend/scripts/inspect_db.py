import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Connection settings come from backend/.env (DB_HOST, DB_USER, DB_PASSWORD, ...)
from app.db.session import engine
from sqlalchemy import text


with engine.connect() as conn:
    # Get all tables
    result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
    tables = [row[0] for row in result]
    print("Tables:", tables)

    for t in tables:
        # Get columns for each table
        col_result = conn.execute(text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name='{t}'"))
        cols = [f"{row[0]} ({row[1]})" for row in col_result]
        print(f"\nTable {t}:")
        for c in cols:
            print("  -", c)
