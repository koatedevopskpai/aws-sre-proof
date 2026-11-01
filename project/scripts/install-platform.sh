#!/usr/bin/env bash
set -euo pipefail
export KUBECONFIG="${KUBECONFIG:?Set the verified extension kubeconfig explicitly}"
: "${EXPECTED_CONTEXT:?Set the verified extension context}"
: "${K8S_DIR:?Set the rendered extension manifest directory}"
test "$(kubectl config current-context)" = "$EXPECTED_CONTEXT"
HELM="${HELM:-$HOME/.local/bin/helm}"

"${HELM}" repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null
"${HELM}" repo add fluent https://fluent.github.io/helm-charts >/dev/null
"${HELM}" repo add falcosecurity https://falcosecurity.github.io/charts >/dev/null
"${HELM}" repo update >/dev/null

"${HELM}" upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack --version 92.16.1 \
  --namespace platform-system \
  --values "${K8S_DIR}/60-observability/kube-prometheus-stack.values.yaml" \
  --wait --timeout 20m

kubectl apply -f "${K8S_DIR}/60-observability/alert-sink.yaml"

"${HELM}" upgrade --install fluent-bit fluent/fluent-bit --version 0.58.3 \
  --namespace platform-system \
  --values "${K8S_DIR}/60-observability/fluent-bit.values.yaml" \
  --wait --timeout 10m

kubectl apply -f "${K8S_DIR}/60-observability/otel-collector.yaml"

"${HELM}" upgrade --install falco falcosecurity/falco --version 9.2.2 \
  --namespace falco-system \
  --values "${K8S_DIR}/70-falco/values.yaml" \
  --wait --timeout 15m

kubectl apply -f "${K8S_DIR}/50-workload/probe.yaml"
kubectl apply -f "${K8S_DIR}/55-test-clients.yaml"

kubectl -n tenant-probe rollout status deployment/probe --timeout=300s
kubectl -n tenant-probe rollout status statefulset/probe-stateful --timeout=300s
kubectl -n platform-system get pods
kubectl -n falco-system get pods
