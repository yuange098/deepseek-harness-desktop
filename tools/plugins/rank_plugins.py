"""Rank DSH plugins by GitHub stars from the awesome-dsh-plugin catalog."""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
README = HERE / "awesome-plugins.zh.md"
STARS = HERE / "plugin-stars.json"
DOWNLOADS = HERE / "plugin-downloads.json"


def norm(url: str) -> str:
    u = url.strip().split("#")[0].rstrip("/")
    for marker in ("/tree/", "/blob/"):
        if marker in u:
            u = u.split(marker)[0]
    return u.lower()


entry_re = re.compile(r"^-\s+\[([^\]]+)\]\((https?://[^)]+)\)\s*(?:—|-|:)?\s*(.*)$")
cat_re = re.compile(r"^###\s+(.*)$")

categories: list[tuple[str, dict]] = []
current = None
for line in README.read_text(encoding="utf-8").splitlines():
    m = cat_re.match(line)
    if m:
        current = (m.group(1).strip(), {})
        categories.append(current)
        continue
    m = entry_re.match(line)
    if m and current is not None:
        name, url, desc = m.group(1), m.group(2), m.group(3)
        key = norm(url)
        if key not in current[1]:
            current[1][key] = {"name": name, "url": url, "desc": desc}

stars = {norm(k): v for k, v in json.loads(STARS.read_text(encoding="utf-8")).items()}
downloads = {norm(k): v for k, v in json.loads(DOWNLOADS.read_text(encoding="utf-8")).items()}

rows = []
for cat, items in categories:
    for key, meta in items.items():
        s = stars.get(key, {})
        d = downloads.get(key, {})
        rows.append(
            {
                "category": cat,
                "repo": key.replace("https://github.com/", ""),
                "url": meta["url"],
                "desc": meta["desc"],
                "stars": s.get("stars", 0) if isinstance(s, dict) else 0,
                "downloads": d.get("downloads", 0) if isinstance(d, dict) else 0,
            }
        )

out = HERE / "plugins-ranked.json"
out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"parsed {len(rows)} plugin entries in {len(categories)} categories")
print()
print("== category leaders (top 6 each, by stars) ==")
for cat, items in categories:
    sub = sorted(
        (r for r in rows if r["category"] == cat), key=lambda r: -r["stars"]
    )
    if not sub:
        continue
    print(f"\n### {cat}  ({len(sub)} plugins)")
    for r in sub[:6]:
        print(
            f"  {r['stars']:>7}★  {r['downloads']:>8} dl  {r['repo']:<45} "
            f"{r['desc'][:80]}"
        )

print("\n== overall top 40 by stars ==")
for r in sorted(rows, key=lambda r: -r["stars"])[:40]:
    print(f"{r['stars']:>7}★  {r['repo']:<45} [{r['category']}] {r['desc'][:70]}")
