"""Lab-only CSI controller host networking with a non-conflicting health port."""
import json,os,subprocess
expected=os.environ['EXPECTED_CONTEXT']
actual=subprocess.check_output(['kubectl','config','current-context'],text=True).strip()
if actual!=expected: raise SystemExit('Unexpected Kubernetes context')
d=json.loads(subprocess.check_output(['kubectl','-n','kube-system','get','deployment','ebs-csi-controller','-o','json'],text=True))
containers=d['spec']['template']['spec']['containers']
for c in containers:
    for port in c.get('ports',[]):
        if port.get('name')=='healthz':
            port['containerPort']=9818
            if 'hostPort' in port:port['hostPort']=9818
    if c['name']=='liveness-probe':
        c['args']=[a for a in c.get('args',[]) if not a.startswith('--http-endpoint=')]+['--http-endpoint=0.0.0.0:9818']
patch={'spec':{'template':{'spec':{'hostNetwork':True,'dnsPolicy':'ClusterFirstWithHostNet','containers':containers}}}}
subprocess.run(['kubectl','-n','kube-system','patch','deployment','ebs-csi-controller','--type','merge','-p',json.dumps(patch)],check=True)
