"""Render S6 rules locally; does not contact Kubernetes or AWS. Requires PyYAML."""
import argparse
from pathlib import Path
import re
import yaml

def prepare(source, run_id):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{2,79}', run_id) or run_id == 'REPLACE_RUN_ID':
        raise ValueError('Supply a fresh run ID, 3-80 letters/digits/hyphens/underscores')
    document = yaml.safe_load(source)
    for group in document['spec']['groups']:
        for rule in group['rules']:
            rule['labels']['run_id'] = run_id
    return document

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1]/'k8s/60-observability/s6-alert-rules.yaml')
    p.add_argument('--run-id', required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--promtool-rules', type=Path)
    args = p.parse_args()
    if args.out.exists() or (args.promtool_rules and args.promtool_rules.exists()):
        p.error('Choose fresh output paths')
    if args.promtool_rules and args.out.resolve() == args.promtool_rules.resolve():
        p.error('Choose separate manifest and promtool paths')
    document = prepare(args.source.read_text(encoding='utf-8-sig'), args.run_id)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(yaml.safe_dump(document, sort_keys=False), encoding='utf-8')
    if args.promtool_rules:
        args.promtool_rules.parent.mkdir(parents=True, exist_ok=True)
        args.promtool_rules.write_text(yaml.safe_dump(document['spec'], sort_keys=False), encoding='utf-8')
    print('Rendered local S6 rules; review before applying. No cloud calls made.')

if __name__ == '__main__':
    main()
