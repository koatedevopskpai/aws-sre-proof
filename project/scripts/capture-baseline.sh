#!/usr/bin/env bash
set -euo pipefail
: "${KUBECONFIG:?Set extension kubeconfig}"
: "${EXPECTED_CONTEXT:?Set verified kubeconfig context}"
: "${EVIDENCE_DIR:?Choose a fresh evidence directory}"
test "$(kubectl config current-context)" = "$EXPECTED_CONTEXT"
test ! -e "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"
date -u +%FT%TZ > "$EVIDENCE_DIR/captured-at.txt"
kubectl get --raw /readyz > "$EVIDENCE_DIR/api-ready.txt"
kubectl get --raw /healthz/etcd > "$EVIDENCE_DIR/etcd-health.txt"
kubectl get nodes -o json > "$EVIDENCE_DIR/nodes.json"
kubectl get pvc -A -o json > "$EVIDENCE_DIR/pvcs.json"
kubectl -n platform-system get pods -o json > "$EVIDENCE_DIR/platform-pods.json"
kubectl -n tenant-probe get pods -o json > "$EVIDENCE_DIR/tenant-pods.json"
python3 - "$EVIDENCE_DIR/nodes.json" <<'CHECK'
import json,sys
nodes=json.load(open(sys.argv[1]))['items']
assert len(nodes)==7, f'Expected seven nodes, got {len(nodes)}'
assert sum('node-role.kubernetes.io/control-plane' in n['metadata']['labels'] for n in nodes)==3
assert all(any(c['type']=='Ready' and c['status']=='True' for c in n['status']['conditions']) for n in nodes)
print('Seven nodes Ready; three control-plane nodes. This does not replace etcd member verification.')
CHECK
