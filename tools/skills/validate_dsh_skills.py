"""校验 DSH skills 目录里每个 skill 是否符合 dsh-skill-filesystem 的解析要求。"""
import re
from pathlib import Path

ROOT = Path(r"E:\DeepSeekHarness\home\skills")
FRONT = re.compile(r"^---\s*\n(.*?)\n---", re.S)
KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

ok, bad = [], []
for skill_md in sorted(ROOT.glob("*/SKILL.md")):
    name_dir = skill_md.parent.name
    text = skill_md.read_text(encoding="utf-8", errors="replace")
    match = FRONT.match(text)
    if not match:
        bad.append((name_dir, "缺少 YAML frontmatter"))
        continue
    front = match.group(1)
    name = re.search(r"^name:\s*[\"']?([^\"'\n]+)", front, re.M)
    # description 可能是单行、带引号，或 YAML 块状写法（> / >- / | / |-）
    desc_match = re.search(r"^description:\s*(.*)$", front, re.M)
    desc_text = ""
    if desc_match:
        first = desc_match.group(1).strip()
        if first in (">", ">-", "|", "|-", ">+", "|+"):
            block_lines = []
            for line in front[desc_match.end() :].splitlines():
                if line.startswith((" ", "\t")):
                    block_lines.append(line.strip())
                elif line.strip():
                    break
            desc_text = " ".join(block_lines)
        else:
            desc_text = first.strip("\"'")
    if not name:
        bad.append((name_dir, "frontmatter 缺 name"))
        continue
    value = name.group(1).strip()
    if not KEBAB.match(value):
        bad.append((name_dir, f"name 非 kebab-case：{value}"))
        continue
    if len(desc_text) < 8:
        bad.append((name_dir, "description 缺失或过短"))
        continue
    if value != name_dir:
        bad.append((name_dir, f"目录名与 name 不一致：{value}"))
        continue
    ok.append(value)

print(f"目录内 skill 数：{len(list(ROOT.glob('*/SKILL.md')))}")
print(f"通过校验：{len(ok)}")
print(f"有问题：{len(bad)}")
for name, reason in bad:
    print(f"  - {name}: {reason}")

# 顺带确认联接都能解析出真实文件
broken = [p.name for p in ROOT.iterdir() if p.is_dir() and not (p / "SKILL.md").exists()]
print(f"联接异常（读不到 SKILL.md）：{len(broken)} {broken[:5]}")
print("\n前 12 个可用 skill：", ", ".join(ok[:12]))
