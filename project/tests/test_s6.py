import importlib.util
import json
from pathlib import Path
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from check_s6_evidence import check

def load_app():
    spec=importlib.util.spec_from_file_location('s6_probe',ROOT/'workloads/probe/app.py')
    app=importlib.util.module_from_spec(spec);spec.loader.exec_module(app)
    return app

class ProbeFaultTests(unittest.TestCase):
    def test_user_failure_remains_scrapable_and_health_is_separate(self):
        app=load_app();app.ENABLE_FAULTS=True;app.LAB_RESPONSE_MODE='error';app.DB_PATH=''
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        try:
            with self.assertRaises(HTTPError) as error: urlopen(base+'/',timeout=2)
            self.assertEqual(error.exception.code,500)
            for path in ['/healthz','/readyz']:
                with urlopen(base+path,timeout=2) as response:self.assertEqual(response.status,200)
            with urlopen(base+'/metrics',timeout=2) as response: metrics=response.read().decode()
            self.assertIn('probe_route_requests_total{route="/",code="500"} 1',metrics)
            self.assertIn('probe_route_requests_total{route="/healthz",code="200"} 1',metrics)
            app.ENABLE_FAULTS=False
            with urlopen(base+'/',timeout=2) as response:self.assertEqual(response.status,200)
        finally:server.shutdown();server.server_close();thread.join()

    def test_unknown_paths_cannot_create_unbounded_route_labels(self):
        app=load_app()
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            for path in ['/untrusted-1','/untrusted-2']:
                with self.assertRaises(HTTPError):urlopen(f'http://127.0.0.1:{server.server_port}'+path,timeout=2)
            self.assertEqual(set(app._route_requests),{('other',404)})
        finally:server.shutdown();server.server_close();thread.join()

class EvidenceTests(unittest.TestCase):
    def fixture(self):
        def row(minute,status):return {'at_utc':f'2026-10-31T10:{minute:02d}:00+00:00','status':status,'accepted':status==200,'latency_ms':10,'error':None if status==200 else 'HTTPError'}
        phases={'baseline':[row(0,200),row(1,200)],'fault':[row(2,500),row(3,500)],'recovery':[row(4,200),row(8,200)]}
        def receipt(minute,status):return {'received_at_utc':f'2026-10-31T10:{minute:02d}:00Z','payload':{'alerts':[{'labels':{'alertname':'GallandProbeRootErrors','exercise':'S6','run_id':'fixture'},'status':status,'fingerprint':'synthetic','startsAt':'2026-10-31T10:02:01Z'}]}}
        return phases,{'alerts':[receipt(3,'firing'),receipt(7,'resolved')]}
    def test_complete_synthetic_fixture_passes(self):
        phases,receipts=self.fixture();self.assertTrue(check(phases,receipts,'fixture')['passed'])
    def test_other_run_or_missing_resolved_does_not_pass(self):
        phases,receipts=self.fixture()
        self.assertFalse(check(phases,receipts,'another-run')['passed'])
        receipts['alerts'].pop();self.assertFalse(check(phases,receipts,'fixture')['passed'])
    def test_empty_or_no_failure_window_does_not_pass(self):
        phases,receipts=self.fixture();phases['baseline']=[]
        self.assertFalse(check(phases,receipts,'fixture')['passed'])
        phases,receipts=self.fixture()
        for row in phases['fault']:row.update(status=200,accepted=True)
        self.assertFalse(check(phases,receipts,'fixture')['passed'])
    def test_resolved_before_firing_does_not_pass(self):
        phases,receipts=self.fixture()
        receipts['alerts'][0]['payload']['alerts'][0]['status']='resolved'
        receipts['alerts'][1]['payload']['alerts'][0]['status']='firing'
        self.assertFalse(check(phases,receipts,'fixture')['passed'])

if __name__=='__main__':unittest.main()
