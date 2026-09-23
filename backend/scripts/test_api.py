"""Quick API connectivity test against all major endpoints."""
import httpx
import json

base = "http://127.0.0.1:3000"

# 1. Login - Attendee
print("=== LOGIN (attendee: yasmine_h) ===")
r = httpx.post(f"{base}/auth/token", data={"username": "yasmine_h", "password": "Eventfy2024!"})
print(f"  Status: {r.status_code}")
assert r.status_code == 200, r.text
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"  OK - token obtained")

# 2. Profile
print("\n=== PROFILE (/users/my_profile) ===")
r2 = httpx.get(f"{base}/users/my_profile", headers=headers)
print(f"  Status: {r2.status_code}")
if r2.status_code == 200:
    p = r2.json()
    print(f"  User: {p.get('username')}, Email: {p.get('email')}, Role: {p.get('role')}")
    print(f"  Full name: {p.get('full_name')}, Location: {p.get('location')}, Phone: {p.get('phone')}")
    print(f"  Avatar: {p.get('avatar_url')}, Bio: {p.get('bio')}")
else:
    print(f"  ERROR: {r2.text[:400]}")

# 3. Public events
print("\n=== EVENTS (/events/public) ===")
r3 = httpx.get(f"{base}/events/public")
print(f"  Status: {r3.status_code}")
if r3.status_code == 200:
    evts = r3.json()
    print(f"  Count: {len(evts)}")
    if evts:
        e = evts[0]
        print(f"  Sample: id={e.get('id')}, title={e.get('title')}, "
              f"cat={e.get('category')}, price={e.get('price')} {e.get('currency', '?')}")
else:
    print(f"  ERROR: {r3.text[:400]}")

# 4. Organizer event list
print("\n=== ORG EVENT LIST (/Event/event_list) ===")
r3b = httpx.get(f"{base}/Event/event_list", headers=headers)
print(f"  Status: {r3b.status_code}")
if r3b.status_code == 200:
    print(f"  Count: {len(r3b.json())}")
else:
    print(f"  ERROR: {r3b.text[:400]}")

# 5. Notifications
print("\n=== NOTIFICATIONS ===")
r4 = httpx.get(f"{base}/notifications", headers=headers)
print(f"  Status: {r4.status_code}")
if r4.status_code == 200:
    d = r4.json()
    print(f"  Total: {d.get('total')}, Unread: {d.get('unread_count')}")
else:
    print(f"  ERROR: {r4.text[:400]}")

# 6. Tickets
print("\n=== TICKETS (/ticket/get_user_tickets) ===")
r5 = httpx.get(f"{base}/ticket/get_user_tickets", headers=headers)
print(f"  Status: {r5.status_code}")
if r5.status_code == 200:
    tix = r5.json()
    print(f"  Count: {len(tix)}")
else:
    print(f"  ERROR: {r5.text[:400]}")

# 7. Saved events
print("\n=== SAVED EVENTS (/saving-events/my-saved-events) ===")
r6 = httpx.get(f"{base}/saving-events/my-saved-events", headers=headers)
print(f"  Status: {r6.status_code}")
if r6.status_code == 200:
    print(f"  Count: {len(r6.json())}")
else:
    print(f"  ERROR: {r6.text[:400]}")

# 8. Recommendations
print("\n=== RECOMMENDATIONS ===")
r8 = httpx.get(f"{base}/Recommendation/recommendation", headers=headers)
print(f"  Status: {r8.status_code}")
if r8.status_code == 200:
    print(f"  Count: {len(r8.json())}")
else:
    print(f"  ERROR: {r8.text[:400]}")

# 9. Payments
print("\n=== PAYMENTS (/payment/my_payments) ===")
r9 = httpx.get(f"{base}/payment/my_payments", headers=headers)
print(f"  Status: {r9.status_code}")
if r9.status_code == 200:
    print(f"  Count: {len(r9.json())}")
else:
    print(f"  ERROR: {r9.text[:400]}")

# 10. User activity
print("\n=== USER ACTIVITY (/users/my_activity) ===")
r10 = httpx.get(f"{base}/users/my_activity", headers=headers)
print(f"  Status: {r10.status_code}")
if r10.status_code == 200:
    print(f"  Data: {json.dumps(r10.json(), indent=2, default=str)[:400]}")
else:
    print(f"  ERROR: {r10.text[:400]}")

# 11. Organizer login
print("\n=== ORGANIZER LOGIN (nour_events) ===")
r11 = httpx.post(f"{base}/auth/token", data={"username": "nour_events", "password": "Eventfy2024!"})
print(f"  Status: {r11.status_code}")
assert r11.status_code == 200

# 12. Admin login + dashboard
print("\n=== ADMIN LOGIN (rayan_admin) ===")
r12 = httpx.post(f"{base}/auth/token", data={"username": "rayan_admin", "password": "Eventfy2024!"})
print(f"  Status: {r12.status_code}")
assert r12.status_code == 200
adm_headers = {"Authorization": f"Bearer {r12.json()['access_token']}"}

print("\n=== ADMIN DASHBOARD ===")
r13 = httpx.get(f"{base}/admin/dashboard", headers=adm_headers)
print(f"  Status: {r13.status_code}")
if r13.status_code == 200:
    print(f"  Dashboard: {json.dumps(r13.json(), indent=2, default=str)[:400]}")
else:
    print(f"  ERROR: {r13.text[:400]}")

print("\n=== ADMIN USER LIST ===")
r14 = httpx.get(f"{base}/admin/view_all_users", headers=adm_headers)
print(f"  Status: {r14.status_code}")
if r14.status_code == 200:
    print(f"  Total users: {len(r14.json())}")
else:
    print(f"  ERROR: {r14.text[:400]}")

# 13. Trending events
print("\n=== TRENDING EVENTS ===")
r15 = httpx.get(f"{base}/events/trending")
print(f"  Status: {r15.status_code}")
if r15.status_code == 200:
    print(f"  Count: {len(r15.json())}")
else:
    print(f"  ERROR: {r15.text[:400]}")

# 14. Search events
print("\n=== SEARCH EVENTS (q=festival) ===")
r16 = httpx.get(f"{base}/events/search", params={"q": "festival"})
print(f"  Status: {r16.status_code}")
if r16.status_code == 200:
    print(f"  Count: {len(r16.json())}")
else:
    print(f"  ERROR: {r16.text[:400]}")

print("\n" + "="*50)
print("=== ALL CONNECTIVITY TESTS COMPLETE ===")
print("="*50)
