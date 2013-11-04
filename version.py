#!/usr/bin/python3

import re
import sys

PKGVER = re.compile(r'"version":(?:\s+)?"(\d)\.(\d)\.(\d)"')
SERVER = re.compile(r'VERSION(?:\s+)?=(?:\s+)"(\d)\.(\d)\.(\d)";')
OP = "patch"

if len(sys.argv) > 1 and sys.argv[1] in ["patch", "minor", "major"]:
    OP = sys.argv[1]

pkgbuf = []
with open("package.json") as f:
    for line in f:
        m = PKGVER.search(line)
        sb = []
        if m:
            sb.append(line[:m.start(1)])
            if OP == "major":
                sb.append(str(int(line[m.start(1):m.end(1)])+1))
            else:
                sb.append(line[m.start(1):m.end(1)])
            sb.append(line[m.end(1):m.start(2)])
            if OP == "minor":
                sb.append(str(int(line[m.start(2):m.end(2)])+1))
            elif OP == "major":
                sb.append("0")
            else:
                sb.append(line[m.start(2):m.end(2)])
            sb.append(line[m.end(2):m.start(3)])
            if OP == "patch":
                sb.append(str(int(line[m.start(3):m.end(3)])+1))
            elif OP == "minor" or OP == "major":
                sb.append("0")
            sb.append(line[m.end(3):])
            pkgbuf.append("".join(sb))
            print("package.json: {} => {}".format(line, "".join(sb)))
        else:
            pkgbuf.append(line)
with open("package.json", "w") as f:
    f.write("".join(pkgbuf))

serbuf = []
with open("lib/server.js") as f:
    for line in f:
        m = SERVER.search(line)
        sb = []
        if m:
            sb.append(line[:m.start(1)])
            if OP == "major":
                sb.append(str(int(line[m.start(1):m.end(1)])+1))
            else:
                sb.append(line[m.start(1):m.end(1)])
            sb.append(line[m.end(1):m.start(2)])
            if OP == "minor":
                sb.append(str(int(line[m.start(2):m.end(2)])+1))
            elif OP == "major":
                sb.append("0")
            else:
                sb.append(line[m.start(2):m.end(2)])
            sb.append(line[m.end(2):m.start(3)])
            if OP == "patch":
                sb.append(str(int(line[m.start(3):m.end(3)])+1))
            elif OP == "minor" or OP == "major":
                sb.append("0")
            sb.append(line[m.end(3):])
            serbuf.append("".join(sb))
            print("server.js: {} => {}".format(line, "".join(sb)))
        else:
            serbuf.append(line)
with open("lib/server.js", "w") as f:
    f.write("".join(serbuf))
