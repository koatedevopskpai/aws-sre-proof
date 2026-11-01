"""Generate local session configuration only. Never calls AWS or Terraform."""
import argparse
from datetime import datetime, timedelta, timezone
import ipaddress
import json
from pathlib import Path
import re


def validate(settings):
    account = settings['expected_account_id']
    if not re.fullmatch(r'[0-9]{12}', account):
        raise ValueError('Supply the verified 12-digit target account')
    network = ipaddress.ip_network(settings['admin_cidr'], strict=True)
    if network.version != 4 or network.prefixlen != 32 or not network.network_address.is_global:
        raise ValueError('admin_cidr must be your current globally routable IPv4 /32')
    if not re.fullmatch(r'v\d+\.\d+\.\d+\+rke2r\d+', settings['rke2_version']):
        raise ValueError('Supply a release verified against official RKE2 release assets')
    if not 1 <= settings['session_hours'] <= 6:
        raise ValueError('session_hours must be between 1 and 6')
    if not 1 <= settings['monthly_budget_usd'] <= 40:
        raise ValueError('This preparation permits a budget notification threshold up to USD 40')
    owner = settings['owner_email']
    if '@' not in owner or any(c.isspace() for c in owner):
        raise ValueError('Supply the actual owner email')


def generate(settings, now=None):
    validate(settings)
    now = now or datetime.now(timezone.utc)
    expiry = now + timedelta(hours=settings['session_hours'])
    return {
        'aws_region': 'us-east-1',
        'lab_name': 'galland-rke2-use1',
        'project_tag': 'galland-rke2-use1',
        'expected_account_id': settings['expected_account_id'],
        'admin_cidr': settings['admin_cidr'],
        'owner_email': settings['owner_email'],
        'session_ttl': expiry.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'ttl': expiry.strftime('%Y-%m-%d'),
        'monthly_budget_usd': settings['monthly_budget_usd'],
        'rke2_version': settings['rke2_version'],
        'server_count': 3,
        'agent_count': 4,
        'server_instance_type': 'm5.large',
        'agent_instance_type': 'm5.large',
        'bastion_instance_type': 't3.micro',
        'private_dns_zone': 'galland-rke2-use1.aws.internal',
        'ssh_public_key_path': settings['ssh_public_key_path'],
        'ssh_private_key_path': settings['ssh_private_key_path'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    settings = json.loads(args.settings.read_text(encoding='utf-8-sig'))
    values = generate(settings)
    if args.out.exists():
        raise SystemExit('Choose a fresh output path; existing configuration is preserved')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(values, indent=2) + '\n', encoding='utf-8')
    print('Local configuration created; no cloud calls. TTL:', values['session_ttl'])
    print('Verify release availability, identity, quota, backend and plan before any apply.')


if __name__ == '__main__':
    main()
