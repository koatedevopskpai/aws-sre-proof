"""Run promtool against locally rendered canonical S6 rules. Requires PyYAML."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import yaml
from prepare_s6_rules import prepare

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--promtool',required=True,type=Path)
    p.add_argument('--out-dir',required=True,type=Path)
    args=p.parse_args();root=Path(__file__).resolve().parents[1]
    if args.out_dir.exists():p.error('Choose a fresh local output directory')
    tool=args.promtool.resolve()
    document=prepare((root/'k8s/60-observability/s6-alert-rules.yaml').read_text(),'s6-local-validation')
    args.out_dir.mkdir(parents=True)
    (args.out_dir/'s6.rules.yml').write_text(yaml.safe_dump(document['spec'],sort_keys=False),encoding='utf-8')
    shutil.copyfile(root/'tests/prometheus/s6.test.yml',args.out_dir/'s6.test.yml')
    outputs=[];success=True
    for command in [['--version'],['check','rules','s6.rules.yml'],['test','rules','s6.test.yml']]:
        result=subprocess.run([str(tool),*command],cwd=args.out_dir,capture_output=True,text=True)
        outputs.append({'arguments':command,'exit_code':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
        success=success and result.returncode==0
    report={'stage':'LOCAL_SYNTHETIC_RULE_TESTS_NOT_LIVE_ALERT_DELIVERY','passed':success,'promtool_sha256':hashlib.sha256(tool.read_bytes()).hexdigest(),'commands':outputs}
    (args.out_dir/'validation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    for item in outputs:print(item['stdout']+item['stderr'])
    raise SystemExit(0 if success else 1)
if __name__=='__main__':main()
