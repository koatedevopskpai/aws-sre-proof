"""Validate saved S6 observations and receiver receipts; never contacts a cluster."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
from observe_http import summary

def at(value):
    stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if stamp.utcoffset() is None:
        raise ValueError('Evidence timestamps need a UTC offset')
    return stamp

def check(phases, receipts, run_id):
    errors = []
    reports = {}
    for name in ('baseline', 'fault', 'recovery'):
        rows = phases[name]
        if not rows:
            errors.append(name + ' has no observations')
            continue
        times = [at(r['at_utc']) for r in rows]
        if any(b <= a for a, b in zip(times, times[1:])):
            errors.append(name + ' timestamps are not strictly increasing')
        reports[name] = summary(rows)
    if len(reports) != 3:
        return {'passed': False, 'errors': errors, 'phases': reports}
    for earlier, later in [('baseline', 'fault'), ('fault', 'recovery')]:
        if at(phases[earlier][-1]['at_utc']) >= at(phases[later][0]['at_utc']):
            errors.append('Phase windows overlap or are out of order')
    for name in ('baseline', 'recovery'):
        if any(not r['accepted'] or r['status'] != 200 for r in phases[name]):
            errors.append(name + ' contains a failed or non-200 user request')
    if not any(not r['accepted'] and 500 <= r['status'] < 600 for r in phases['fault']):
        errors.append('No observed HTTP 5xx during the fault window')
    start = at(phases['fault'][0]['at_utc'])
    end = at(phases['recovery'][-1]['at_utc'])
    deliveries = []
    for record in receipts.get('alerts', []):
        received = at(record['received_at_utc'])
        if not start <= received <= end:
            continue
        for alert in record.get('payload', {}).get('alerts', []):
            labels = alert.get('labels', {})
            if labels.get('alertname') != 'GallandProbeRootErrors' or labels.get('exercise') != 'S6' or labels.get('run_id') != run_id:
                continue
            if not alert.get('fingerprint') or not alert.get('startsAt'):
                continue
            if at(alert['startsAt']) < start:
                continue
            deliveries.append((received, alert['status'], alert['fingerprint'], alert['startsAt']))
    pairs = [(f, r) for f in deliveries for r in deliveries if f[1]=='firing' and r[1]=='resolved' and f[2:]==r[2:] and f[0] < r[0]]
    if not pairs:
        errors.append('No ordered firing/resolved receiver receipts for the same alert instance and run')
    return {'passed': not errors, 'errors': errors, 'phases': reports,
            'matched_receipt_count': len(deliveries),
            'receipt_pairs': [{'firing_received_utc': f[0].isoformat(), 'resolved_received_utc': r[0].isoformat()} for f,r in pairs],
            'scope': 'Checks captured evidence consistency; does not authenticate its origin or establish production SLOs.'}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('baseline', 'fault', 'recovery', 'receipts'):
        p.add_argument('--'+name, required=True, type=Path)
    p.add_argument('--run-id', required=True)
    p.add_argument('--out', required=True, type=Path)
    args = p.parse_args()
    if args.out.exists(): p.error('Choose a fresh output path')
    phases = {name:[json.loads(line) for line in getattr(args,name).read_text().splitlines() if line.strip()] for name in ('baseline','fault','recovery')}
    result = check(phases, json.loads(args.receipts.read_text()), args.run_id)
    result['source_sha256'] = {name:hashlib.sha256(getattr(args,name).read_bytes()).hexdigest() for name in ('baseline','fault','recovery','receipts')}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('S6 saved-evidence check:', 'PASS' if result['passed'] else 'FAIL')
    for error in result['errors']: print(error)
    raise SystemExit(0 if result['passed'] else 1)

if __name__ == '__main__': main()
