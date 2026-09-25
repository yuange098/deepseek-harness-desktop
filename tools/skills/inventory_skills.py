
import os
USER_HOME = os.environ.get("USER_HOME") or os.path.expanduser("~")
"""盘点本机 Codex 侧安装的 skill：位置、frontmatter 合法性、外部工具依赖。"""
import json
import re
from pathlib import Path

ROOTS = {
    "codex-user": Path(USER_HOME + r"\.codex\skills"),
    "agents-shared": Path(USER_HOME + r"\.agents\skills"),
    "codex-system": Path(USER_HOME + r"\.codex\skills\.system"),
    "plugin-canva": Path(USER_HOME + r"\.codex\plugins\cache\openai-api-curated\canva\1dc19589\skills"),
    "plugin-life-science": Path(
        USER_HOME + r"\.codex\plugins\cache\openai-api-curated\life-science-research\1dc19589\skills"
    ),
    "plugin-superpowers": Path(
        USER_HOME + r"\.codex\plugins\cache\openai-api-curated\superpowers\1dc19589\skills"
    ),
    "plugin-primary": Path(USER_HOME + r"\.codex\plugins\cache\openai-primary-runtime"),
}

FRONT = re.compile(r"^---\s*\n(.*?)\n---", re.S)
KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def frontmatter(text: str) -> dict:
    match = FRONT.match(text)
    if not match:
        return {}
    data = {}
    for line in match.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, _, value = line.partition(":")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def deps(text: str) -> list[str]:
    found = set()
    if re.search(r"mcp__", text):
        found.add("MCP工具")
    for token, label in (
        ("imagegen", "imagegen工具"),
        ("openai-docs", "OpenAI文档MCP"),
        ("render_docx.py", "渲染脚本"),
        ("officecli", "officecli"),
        ("python", "python"),
        ("node ", "node"),
    ):
        if token in text:
            found.add(label)
    return sorted(found)


rows = []
for label, root in ROOTS.items():
    if not root.exists():
        continue
    for skill_md in sorted(root.rglob("SKILL.md")):
        rel = skill_md.relative_to(root)
        depth = len(rel.parts) - 1
        text = skill_md.read_text(encoding="utf-8", errors="replace")
        meta = frontmatter(text)
        name = meta.get("name") or rel.parent.name
        rows.append(
            {
                "root": label,
                "rel": str(rel.parent).replace("/", "\\"),
                "depth": depth,
                "dir_name": rel.parent.name,
                "name": name,
                "kebab": bool(KEBAB.match(name)),
                "has_desc": bool(meta.get("description")),
                "size_kb": round(sum(f.stat().st_size for f in skill_md.parent.rglob("*") if f.is_file()) / 1024, 1),
                "deps": deps(text),
            }
        )

out = Path(__file__).resolve().parent / "skills-inventory.json"
out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"共 {len(rows)} 个 SKILL.md\n")
print(f"{'root':<16}{'depth':<6}{'kebab':<6}{'desc':<5}{'KB':>7}  name / dir / deps")
for row in rows:
    flag = "" if (row["kebab"] and row["has_desc"]) else "  <== 需处理"
    print(
        f"{row['root']:<16}{row['depth']:<6}{str(row['kebab']):<6}{str(row['has_desc']):<5}"
        f"{row['size_kb']:>7}  {row['name']}  ({row['dir_name']})  {','.join(row['deps'])}{flag}"
    )
