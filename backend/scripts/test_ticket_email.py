import httpx
API = "https://eventfy-backend-exhu.onrender.com"
r = httpx.post(f"{API}/auth/token", data={"username":"rooozooo369@gmail.com","password":"123456789"}, headers={"Content-Type":"application/x-www-form-urlencoded"}, timeout=60)
token = r.json()["access_token"]
auth = {"Authorization": f"Bearer {token}"}
r = httpx.get(f"{API}/events/public", timeout=60)
events = r.json()
print(f"Events found: {len(events)}")
for e in events[:3]:
    eid = e["id"]
    title = e["title"]
    tix = e.get("available_tickets", 0)
    print(f"  ID={eid} title={title} tickets={tix}")
for e in events:
    if e.get("available_tickets", 0) > 0:
        eid = e["id"]
        print(f"\nPurchasing ticket for event {eid}...")
        r = httpx.post(f"{API}/ticket/purchase_ticket/{eid}", headers=auth, timeout=60)
        print(f"  Status: {r.status_code}")
        print(f"  Body: {r.text[:400]}")
        break
else:
    print("No events with available tickets")
