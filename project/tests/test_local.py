import importlib.util
from pathlib import Path
import unittest
import threading
import sqlite3
import json
import time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts'/f'{name}.py')
    obj = importlib.util.module_from_spec(spec); spec.loader.exec_module(obj)
    return obj


class LocalChecks(unittest.TestCase):
    def plan(self):
        expected = ['aws_instance.bastion'] + [f'aws_instance.node["galland-rke2-use1-{role}-{i}"]'
                      for role, count in [('server',3),('agent',4)] for i in range(1,count+1)]
        return {'variables': {k: {'value': v} for k,v in dict(aws_region='us-east-1', project_tag='galland-rke2-use1', lab_name='galland-rke2-use1', expected_account_id='123456789012').items()},
                'resource_changes': [{'address':a, 'change':{'actions':['create'],'after':{'tags':{'Project':'galland-rke2-use1'}}}} for a in expected]}

    def test_initial_plan_accepts_only_expected_new_estate(self):
        errors, creates = module('check_plan').check(self.plan())
        self.assertEqual(errors, []); self.assertEqual(len(creates), 8)

    def test_initial_plan_rejects_changes_to_existing_resource(self):
        for action in [['update'], ['delete'], ['delete','create']]:
            plan = self.plan(); plan['resource_changes'][0]['change']['actions'] = action
            self.assertTrue(module('check_plan').check(plan)[0])

    def test_initial_plan_rejects_wrong_scope(self):
        plan = self.plan(); plan['variables']['aws_region']['value'] = 'eu-west-2'
        self.assertTrue(module('check_plan').check(plan)[0])
        plan = self.plan(); plan['resource_changes'][0]['change']['after']['tags']['Project'] = 'Pulsenotify'
        self.assertTrue(module('check_plan').check(plan)[0])

    def test_observer_counts_failures_in_denominator(self):
        report = module('observe_http').summary([{'accepted':True,'latency_ms':10}, {'accepted':False,'latency_ms':2000}])
        self.assertEqual(report['availability'], .5)
        self.assertEqual(report['p95_attempt_latency_ms'], 2000)
        self.assertEqual(report['under_one_second_and_accepted'], 1)

    def test_no_traffic_is_not_success(self):
        report = module('observe_http').summary([])
        self.assertIsNone(report['availability'])
        self.assertIsNone(report['p95_attempt_latency_ms'])

    def test_database_readiness_failure_is_recorded_as_http_failure(self):
        spec = importlib.util.spec_from_file_location('probe_app', ROOT/'workloads/probe/app.py')
        app = importlib.util.module_from_spec(spec); spec.loader.exec_module(app)
        app.DB_PATH = 'synthetic-test'
        def broken_database():
            raise sqlite3.OperationalError('controlled test outage')
        app._count_hits = broken_database
        server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            observation = module('observe_http').sample(f'http://127.0.0.1:{server.server_port}/readyz', 'ready', 1)
            self.assertEqual(observation['status'], 503)
            self.assertFalse(observation['accepted'])
            self.assertEqual(app._requests.get(503), 1)
            self.assertEqual(app._requests.get(200, 0), 0)
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_real_otlp_post_has_recent_xray_trace_id_and_failure_status(self):
        received = []
        ready = threading.Event()
        class Receiver(BaseHTTPRequestHandler):
            def do_POST(self):
                received.append((self.path, json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                self.send_response(200); self.end_headers(); self.wfile.write(b'{}'); ready.set()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Receiver)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        spec = importlib.util.spec_from_file_location('probe_trace_app', ROOT/'workloads/probe/app.py')
        app = importlib.util.module_from_spec(spec); spec.loader.exec_module(app)
        app.OTLP_ENDPOINT = f'http://127.0.0.1:{server.server_port}'
        started = time.time()
        try:
            app._emit_span('GET /readyz', started, {'http.status_code': 503})
            self.assertTrue(ready.wait(3), 'No actual OTLP HTTP request received')
            path, payload = received[0]
            self.assertEqual(path, '/v1/traces')
            span = payload['resourceSpans'][0]['scopeSpans'][0]['spans'][0]
            self.assertEqual(len(span['traceId']), 32)
            self.assertEqual(int(span['traceId'][:8], 16), int(started))
            self.assertEqual(span['status']['code'], 2)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__': unittest.main()
