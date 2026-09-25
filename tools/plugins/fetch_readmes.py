"""Fetch candidate plugin READMEs from GitHub and extract install commands."""
import base64
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "readmes"
OUT.mkdir(exist_ok=True)

REPOS = [
    "dsh-market/dsh-market",
    "omdsh-dev/dsh-better-sidebar",
    "volcengine/openviking",
    "vectorize-io/hindsight",
    "omdsh-dev/dsh-mnemon",
    "zhu1090093659/dsh-web-ui",
    "liustack/modlens",
    "ysr666/dsh-vision-router",
    "liustack/modsearch",
    "bowenliang123/dsh-context",
    "han-1413141/dsh-cost-meter",
    "small-tailqwq/dsh-deep-whale",
    "revolutionla/dsh-dream-skin",
    "thewolfwalker/dsh-notifier",
    "omdsh-dev/dsh-notification",
    "alan2z/dsh-speak",
    "nanmicoder/dsh-agent-teams",
    "ganyuanran/aegis",
    "tt-a1i/archify",
    "jesse-njx/dsh-cowork",
    "omdsh-dev/dsh-data-agent",
    "omdsh-dev/dsh-browser",
    "toby-bridges/api-relay-audit",
    "anionex/dsh-turn-rewind",
    "nwflower/dsh-chat-import",
]


def gh_json(path: str):
    req = urllib.request.Request(
        "https://api.github.com/" + path.lstrip("/"),
        headers={"User-Agent": "codex", "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_readme(repo: str) -> str | None:
    for name in ("README.md", "readme.md", "README.zh.md"):
        try:
            data = gh_json(f"repos/{repo}/contents/{name}")
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                continue
            print(f"  ! {repo}/{name}: HTTP {exc.code}")
            continue
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {repo}/{name}: {exc}")
            continue
        content = data.get("content") or ""
        if not content:
            try:
                blob = gh_json(f"repos/{repo}/git/blobs/{data['sha']}")
                content = blob["content"]
            except Exception as exc:  # noqa: BLE001
                print(f"  ! blob {repo}/{name}: {exc}")
                continue
        return base64.b64decode(content).decode("utf-8", "replace")
    return None


install_re = re.compile(r"^.*dsh plugin[^\n]*$", re.MULTILINE)
prereq_re = re.compile(
    r"^.*(?:前置|依赖|需要先|requires?|prerequisite|API ?key|token|安装前)[^\n]*$",
    re.MULTILINE | re.IGNORECASE,
)

summary = {}
for repo in REPOS:
    print(f"== {repo}")
    text = fetch_readme(repo)
    if not text:
        print("   no readme")
        summary[repo] = {"ok": False}
        continue
    (OUT / (repo.replace("/", "__") + ".md")).write_text(text, encoding="utf-8")
    installs = sorted({m.group(0).strip() for m in install_re.finditer(text)})
    prereqs = [m.group(0).strip() for m in prereq_re.finditer(text)][:6]
    summary[repo] = {"ok": True, "chars": len(text), "install": installs, "prereq": prereqs}
    for line in installs[:6]:
        print("   INSTALL:", line)
    for line in prereqs:
        print("   NOTE   :", line[:150])
    time.sleep(0.3)

(HERE / "readme-summary.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8"
)
print(f"\nsaved {sum(1 for v in summary.values() if v.get('ok'))}/{len(REPOS)} readmes")
