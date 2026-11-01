"""Read-only comparison of inspected source hashes; no cloud access."""
import argparse
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--source', type=Path, required=True)
args = p.parse_args()
manifest = json.loads((Path(__file__).resolve().parents[1] / 'source-manifest.json').read_text())
changed = []
for item in manifest['files']:
    path = args.source / item['path']
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
        changed.append(item['path'])
if changed:
    print('Source changed; review/rebase the preparation patch:')
    print('\n'.join(changed))
    raise SystemExit(1)
print(f"All {len(manifest['files'])} inspected inputs match. No cloud calls.")
