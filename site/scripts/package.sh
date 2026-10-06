#!/usr/bin/env bash
# Builds the bundle and packs only the files a static host needs into worldx-site.zip
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build >/dev/null
rm -rf .pkg worldx-site.zip && mkdir -p .pkg
cp index.html admin.html stats.html style.css config.json lots.json .pkg/
cp -r js .pkg/js
python3 - <<'PY'
import zipfile, os
with zipfile.ZipFile("worldx-site.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(".pkg"):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, ".pkg"))
PY
rm -rf .pkg
echo "wrote worldx-site.zip"
unzip -l worldx-site.zip 2>/dev/null || python3 -c "import zipfile;[print(i.filename,i.file_size) for i in zipfile.ZipFile('worldx-site.zip').infolist()]"
