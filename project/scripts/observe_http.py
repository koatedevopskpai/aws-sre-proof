"""Bounded single-client HTTP observations. Run outside the node under test."""
import argparse
import contextlib
import sys
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen


def summary(rows):
    attempts = len(rows)
    accepted = sum(r['accepted'] for r in rows)
    durations = sorted(r['latency_ms'] for r in rows)
    return {'attempts': attempts, 'accepted': accepted, 'errors': attempts-accepted,
            'availability': accepted/attempts if attempts else None,
            'p95_attempt_latency_ms': durations[math.ceil(.95*attempts)-1] if attempts else None,
            'under_one_second_and_accepted': sum(r['accepted'] and r['latency_ms'] < 1000 for r in rows),
            'scope': 'Bounded client observations; includes timeouts/errors, not a monthly SLO.'}


def sample(url, expected, timeout):
    started = time.monotonic(); status = 0; accepted = False; error = None
    try:
        with urlopen(url, timeout=timeout) as response:
            status = response.status
            # Small bounded response; no response bodies or credentials written to the evidence.
            accepted = status == 200 and expected in response.read(65536).decode('utf-8', errors='replace')
    except HTTPError as exc:
        status = exc.code; error = 'HTTPError'
    except (URLError, TimeoutError, OSError) as exc:
        error = type(exc).__name__
    return {'at_utc': datetime.now(timezone.utc).isoformat(), 'status': status,
            'accepted': accepted, 'error': error, 'latency_ms': round((time.monotonic()-started)*1000, 3)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url', required=True)
    p.add_argument('--expect', required=True)
    p.add_argument('--count', type=int, default=300)
    p.add_argument('--interval', type=float, default=1)
    p.add_argument('--timeout', type=float, default=2)
    p.add_argument('--out', type=Path, required=True)
    args = p.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme not in ['http', 'https'] or not parsed.hostname or parsed.username or parsed.password:
        p.error('Use an explicit HTTP endpoint without embedded credentials')
    if not 1 <= args.count <= 1200 or not .5 <= args.interval <= 5 or not .1 <= args.timeout <= 5:
        p.error('count 1..1200, interval .5..5s, timeout .1..5s required')
    to_stdout = str(args.out) == '-'
    if not to_stdout and args.out.exists(): p.error('Choose a fresh evidence path')
    if not to_stdout: args.out.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    destination = contextlib.nullcontext(sys.stdout) if to_stdout else args.out.open('x', encoding='utf-8')
    with destination as stream:
        for i in range(args.count):
            started = time.monotonic()
            row = sample(args.url, args.expect, args.timeout)
            rows.append(row); stream.write(json.dumps(row)+'\n'); stream.flush()
            if i+1 < args.count: time.sleep(max(0, args.interval-(time.monotonic()-started)))
    print(json.dumps(summary(rows), indent=2), file=sys.stderr if to_stdout else sys.stdout)


if __name__ == '__main__':
    main()
