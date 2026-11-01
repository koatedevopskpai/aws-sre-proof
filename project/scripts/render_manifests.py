"""Render a new manifest directory; never modifies source or contacts a cluster."""
import argparse
from pathlib import Path
import re

OLD_IMAGE = re.compile(r'123456789012\.dkr\.ecr\.us-east-1\.amazonaws\.com/galland-rke2-use1/probe@sha256:[0-9a-f]{64}')
OLD_PREFIX = '123456789012.dkr.ecr.us-east-1.amazonaws.com/galland-rke2-use1/'
IMAGE = re.compile(r'[0-9]{12}\.dkr\.ecr\.us-east-1\.amazonaws\.com/galland-rke2-use1/probe@sha256:[0-9a-f]{64}')


def render(text, image):
    if not IMAGE.fullmatch(image):
        raise ValueError('Use the actual digest-pinned us-east-1 ECR image for this lab')
    prefix = image.split('/probe@', 1)[0] + '/'
    text = OLD_IMAGE.sub(image, text).replace(OLD_PREFIX, prefix)
    return text.replace('platform-lab-aws', 'galland-rke2-use1').replace('eu-west-2', 'us-east-1')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-k8s', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--image', required=True)
    args = p.parse_args()
    if not args.source_k8s.is_dir():
        raise SystemExit('Source k8s directory does not exist')
    if args.out.exists():
        raise SystemExit('Choose a fresh output directory')
    # Validate before creating any output.
    render('', args.image)
    files = sorted([*args.source_k8s.rglob('*.yaml'), *args.source_k8s.rglob('*.yml')])
    if not files:
        raise SystemExit('No YAML input found')
    for source in files:
        if any(p in {'.secrets', '.private'} for p in source.parts):
            raise SystemExit('Private material is not a manifest input')
        target = args.out / source.relative_to(args.source_k8s)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(render(source.read_text(encoding='utf-8-sig'), args.image), encoding='utf-8')
    print(f'Rendered {len(files)} files. Review credentials, policies, charts and images before use.')
    print('This does not verify ECR existence, valid Kubernetes YAML, chart compatibility or deployment.')


if __name__ == '__main__':
    main()
