#!/usr/bin/env bash
set -euo pipefail

export KUBECONFIG="${KUBECONFIG:?Set the verified extension kubeconfig explicitly}"
: "${EXPECTED_CONTEXT:?Set the verified extension context}"
: "${K8S_DIR:?Set the rendered extension manifest directory}"
test "$(kubectl config current-context)" = "$EXPECTED_CONTEXT"
HELM="${HOME}/.local/bin/helm"

if [ ! -x "${HELM}" ]; then
  curl -fsSL https://get.helm.sh/helm-v3.22.1-linux-amd64.tar.gz -o /tmp/helm.tgz
  tar -xzf /tmp/helm.tgz -C /tmp
  mkdir -p "${HOME}/.local/bin"
  install -m 0755 /tmp/linux-amd64/helm "${HELM}"
fi

"${HELM}" repo add aws-ebs-csi-driver https://kubernetes-sigs.github.io/aws-ebs-csi-driver >/dev/null
"${HELM}" repo update >/dev/null

"${HELM}" upgrade --install aws-ebs-csi-driver aws-ebs-csi-driver/aws-ebs-csi-driver --version 2.67.2 \
  --namespace kube-system \
  --set controller.serviceAccount.create=true \
  --set node.serviceAccount.create=true \
  --set node.hostNetwork=true \
  --timeout 10m

# Explicit lab trade-off: controller gets the node instance profile through IMDS.
# This is not IRSA/Pod Identity. The node role already carries EBS permissions.
python3 "$(dirname "$0")/configure_csi_hostnetwork.py"
kubectl -n kube-system rollout status deployment/ebs-csi-controller --timeout=300s
kubectl -n kube-system rollout status daemonset/ebs-csi-node --timeout=300s
kubectl apply -f "${K8S_DIR}/storage/ebs-csi/storageclass.yaml"
kubectl -n kube-system get pods -l app.kubernetes.io/name=aws-ebs-csi-driver -o wide
kubectl get storageclass


