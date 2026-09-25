
import os
USER_HOME = os.environ.get("USER_HOME") or os.path.expanduser("~")
"""根据盘点结果，生成「挂到 DSH skills 目录」的清单（含排除说明）。"""
import json
import re
from pathlib import Path

INVENTORY = Path(__file__).resolve().parent / "skills-inventory.json"
PLAN = Path(__file__).resolve().parent / "skill-link-plan.json"

ROOT_DIRS = {
    "codex-user": Path(USER_HOME + r"\.codex\skills"),
    "agents-shared": Path(USER_HOME + r"\.agents\skills"),
    "plugin-life-science": Path(
        USER_HOME + r"\.codex\plugins\cache\openai-api-curated\life-science-research\1dc19589\skills"
    ),
    "plugin-superpowers": Path(
        USER_HOME + r"\.codex\plugins\cache\openai-api-curated\superpowers\1dc19589\skills"
    ),
}

# 依赖 Codex 专属运行时/连接器的，不搬
EXCLUDE_NAMES = {
    "imagegen",              # 依赖 Codex 的 imagegen 工具
    "openai-docs",           # 依赖 OpenAI 文档 MCP
    "plugin-creator",        # Codex 插件体系
    "skill-installer",       # 安装 Codex 精选 skill
    "template-creator",      # Codex 产物模板
    "review-agent",          # Codex 审查子代理
}
EXCLUDE_ROOTS = {"codex-system", "plugin-canva", "plugin-primary"}

# 默认这一轮挂哪些来源（life-science / lark 量太大，先按需）
INCLUDE_ROOTS = {"codex-user", "agents-shared", "plugin-superpowers"}
LARK_PREFIX = "lark-"


def kebab(name: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip()).strip("-").lower()
    return re.sub(r"-{2,}", "-", value)


rows = json.loads(INVENTORY.read_text(encoding="utf-8"))
plan, skipped = [], []

for row in rows:
    root = row["root"]
    name = row["name"]
    target = kebab(name)

    if root in EXCLUDE_ROOTS or name in EXCLUDE_NAMES:
        skipped.append((root, name, "依赖 Codex 专属工具/MCP"))
        continue
    if root not in INCLUDE_ROOTS:
        skipped.append((root, name, "本批未启用（可随时追加）"))
        continue
    if root == "agents-shared" and name.startswith(LARK_PREFIX):
        skipped.append((root, name, "飞书系 skill：需要 lark-cli，按需启用"))
        continue
    if not row["kebab"] or target != name:
        skipped.append((root, name, f"name 非 kebab-case（需改名 → {target}）"))
        continue
    if not row["has_desc"]:
        skipped.append((root, name, "缺 description"))
        continue

    source = ROOT_DIRS[root] / row["rel"]
    # 目录名与 frontmatter name 不一致也没关系：DSH 按 frontmatter 里的 name 识别，
    # 联接名直接用 frontmatter 的 kebab 名字即可。
    plan.append({"name": name, "source": str(source), "root": root})

PLAN.write_text(
    json.dumps({"install": plan, "skipped": skipped}, ensure_ascii=False, indent=1), encoding="utf-8"
)

# 顺带生成建链用的 PowerShell 脚本（目录联接，零拷贝；本源 skill 更新后自动同步）
ps_lines = [
    "$ErrorActionPreference = 'Continue'",
    "$dest = 'E:\\DeepSeekHarness\\home\\skills'",
    'New-Item -ItemType Directory -Force -Path $dest | Out-Null',
    "$ok = 0; $skip = 0; $fail = 0",
]
for item in plan:
    name = item["name"].replace("'", "''")
    src = item["source"].replace("'", "''")
    ps_lines.append(
        f"if (Test-Path -LiteralPath (Join-Path $dest '{name}')) {{ $skip++ }} "
        f"else {{ try {{ New-Item -ItemType Junction -Path (Join-Path $dest '{name}') -Target '{src}' "
        f"| Out-Null; $ok++ }} catch {{ $fail++; Write-Host ('FAIL {name}: ' + $_.Exception.Message) }} }}"
    )
ps_lines.append('Write-Host ("created=$ok existed=$skip failed=$fail")')
# 注意：必须带 BOM 写，否则 Windows PowerShell 5.1 会按 ANSI 读，中文路径就废了
(PLAN.parent / "link_skills.ps1").write_text("\n".join(ps_lines), encoding="utf-8-sig")

print(f"计划挂载 {len(plan)} 个 skill；跳过 {len(skipped)} 个\n")
print("== 将挂载 ==")
for item in plan:
    print(f"  {item['name']:<32} <- {item['root']}")
print("\n== 跳过（按原因归类）==")
reasons = {}
for root, name, reason in skipped:
    reasons.setdefault(reason, []).append(name)
for reason, names in sorted(reasons.items(), key=lambda kv: -len(kv[1])):
    print(f"  [{reason}] {len(names)} 个：{', '.join(names[:6])}{' …' if len(names) > 6 else ''}")
