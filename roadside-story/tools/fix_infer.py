#!/usr/bin/env python3
"""개발 보조: GDScript 의 '타입 추론 불가(:=)' 파싱 오류를 '=' 로 바꿔 준다. 게임 빌드와는 무관."""
import re, subprocess, sys
scene = sys.argv[1] if len(sys.argv) > 1 else "res://tests/test_runner.tscn"
for it in range(12):
    out = subprocess.run(["godot", "--headless", "--path", ".", "--quit-after", "3", scene], capture_output=True, text=True, timeout=300)
    txt = out.stdout + out.stderr
    lines = txt.splitlines()
    fixes = set()
    for i, l in enumerate(lines):
        if "Cannot infer the type" in l and i + 1 < len(lines):
            m = re.search(r"\(res://(.+?):(\d+)\)", lines[i + 1])
            if m:
                fixes.add((m.group(1), int(m.group(2))))
    if not fixes:
        others = [l for i, l in enumerate(lines) if "Parse Error" in l or ("SCRIPT ERROR" in l and "Compile Error" not in l)]
        seen = []
        for i, l in enumerate(lines):
            if ("Parse Error" in l) and i + 1 < len(lines):
                seen.append(l.strip() + " " + lines[i + 1].strip())
        print("\n".join(sorted(set(seen))) or "no parse errors")
        break
    for path, ln in fixes:
        src = open(path).read().split("\n")
        src[ln - 1] = src[ln - 1].replace(":=", "=", 1)
        open(path, "w").write("\n".join(src))
    print("fixed", len(fixes))
