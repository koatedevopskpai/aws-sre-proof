"""Validate an initial Terraform JSON plan. Read-only; no AWS calls."""
import argparse
import json

PROJECT = 'galland-rke2-use1'


def check(plan):
    errors = []
    values = {k: v.get('value') for k, v in plan.get('variables', {}).items()}
    for key, expected in [('aws_region', 'us-east-1'), ('project_tag', PROJECT), ('lab_name', PROJECT)]:
        if values.get(key) != expected:
            errors.append('Unexpected ' + key)
    if not values.get('expected_account_id'):
        errors.append('Missing expected account')
    creates = []
    for change in plan.get('resource_changes', []):
        actions = change['change']['actions']
        if actions not in [['no-op'], ['read'], ['create']]:
            errors.append('Initial plan would alter an existing resource: ' + change['address'])
        if actions == ['create']:
            creates.append(change['address'])
            after = change['change'].get('after') or {}
            tags = after.get('tags_all') or after.get('tags')
            if tags and tags.get('Project') != PROJECT:
                errors.append('Wrong Project tag: ' + change['address'])
    expected_nodes = [f'aws_instance.node["{PROJECT}-{role}-{i}"]'
                      for role, count in [('server', 3), ('agent', 4)]
                      for i in range(1, count+1)]
    if any(n not in creates for n in expected_nodes) or 'aws_instance.bastion' not in creates:
        errors.append('Expected seven nodes and bastion are not all new creates')
    return errors, creates


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('plan_json')
    args = p.parse_args()
    with open(args.plan_json, encoding='utf-8-sig') as f:
        errors, creates = check(json.load(f))
    print(json.dumps({'passed': not errors, 'creates': len(creates), 'errors': errors}, indent=2))
    raise SystemExit(bool(errors))
