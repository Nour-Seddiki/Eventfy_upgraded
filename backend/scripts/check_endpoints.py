import httpx
r = httpx.get('http://127.0.0.1:8000/openapi.json')
data = r.json()
paths = data.get('paths', {})
for p in sorted(paths.keys()):
    if 'avatar' in p.lower() or 'profile' in p.lower() or 'image' in p.lower() or 'upload' in p.lower():
        methods = list(paths[p].keys())
        print(f"  {', '.join(m.upper() for m in methods):10s} {p}")
print("---")
# Also check all user endpoints
for p in sorted(paths.keys()):
    if '/users' in p:
        methods = list(paths[p].keys())
        print(f"  {', '.join(m.upper() for m in methods):10s} {p}")
