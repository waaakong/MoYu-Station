import importlib.util
import json
import threading
import tempfile
import hashlib
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('gateway', Path(__file__).with_name('download-gateway.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Tests(unittest.TestCase):
    def test_fixed_branded_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            name = 'MoYu-Setup-0.2.0-trial.20261005.1-win-x64.exe'
            payload = b'fixture-only-not-an-installer'
            artifact = root / name
            artifact.write_bytes(payload)
            release = {'filename': name, 'size': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
            metadata = root / 'release.json'
            metadata.write_text(json.dumps(release))
            self.assertEqual(module.validate_release(metadata, artifact), release)
            version = '0.2.0-trial.20261005.1'
            public_url = 'https://github.com/waaakong/MoYu-Station/releases/download/v' + version + '/' + name
            public_release = dict(release, version=version, publicDownloadUrl=public_url)
            metadata.write_text(json.dumps(public_release))
            self.assertEqual(module.validate_release(metadata, artifact), public_release)
            for url in (public_url + '?token=x', public_url.replace('MoYu-Station', 'StudyRoom'), 'https://example.com/file.exe'):
                metadata.write_text(json.dumps(dict(public_release, publicDownloadUrl=url)))
                with self.assertRaises(ValueError):module.validate_release(metadata, artifact)
            for patch in ({'filename':'../secret.exe'}, {'size':0}, {'sha256':'0'*64}):
                metadata.write_text(json.dumps(dict(release, **patch)))
                with self.assertRaises(ValueError):module.validate_release(metadata, artifact)

    def test_identity(self):
        self.assertEqual(module.access_from_envelope({'success': True, 'data': None}), 'login-required')
        base = {'id': '9007199254740999', 'userType': 'USER', 'passwordChangeRequired': False}
        for role in ('NORMAL', 'USER', 'ADMIN', '普通用户', '管理员'):
            self.assertEqual(module.access_from_envelope({'success': True, 'data': dict(base, userType=role)}), 'allowed')
        for patch in ({'userType':'BANNED'}, {'onlineStatus':'BANNED'}, {'passwordChangeRequired':True}, {'userType':'UNKNOWN'}, {'id':True}):
            self.assertNotEqual(module.access_from_envelope({'success':True,'data':dict(base, **patch)}), 'allowed')
        for payload in ({}, None, {'success':False,'data':base}, {'success':True,'data':[]}):
            self.assertNotEqual(module.access_from_envelope(payload), 'allowed')

    def test_cookie(self):
        for raw in ('', 'STUDYROOM_SESSION=short', 'STUDYROOM_SESSION='+'x'*9000, 'STUDYROOM_SESSION=x\r\nHost:attacker'):
            self.assertIsNone(module.session_cookie(raw))
        self.assertEqual(module.session_cookie('unrelated=private; STUDYROOM_SESSION='+'a'*24), 'STUDYROOM_SESSION='+'a'*24)

    def test_real_http_boundary(self):
        class Identity(BaseHTTPRequestHandler):
            revoked = False
            def log_message(self,*args): pass
            def do_GET(self):
                if self.headers.get('Cookie') != 'STUDYROOM_SESSION='+'a'*24 or Identity.revoked:
                    data = None
                else: data = {'id':'1','userType':'USER','passwordChangeRequired':False}
                body=json.dumps({'success':True,'data':data}).encode();self.send_response(200);self.end_headers();self.wfile.write(body)
        upstream=ThreadingHTTPServer(('127.0.0.1',0),Identity);threading.Thread(target=upstream.serve_forever,daemon=True).start()
        gateway=module.Server(('127.0.0.1',0),module.Gateway({'filename':'StudyRoom-stable-0.2.0-x64.exe'},'http://127.0.0.1:'+str(upstream.server_port),'https://8.163.29.26'))
        threading.Thread(target=gateway.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(gateway.server_port)
        try:
            with urllib.request.urlopen(base+'/api/download/status') as response:self.assertEqual(json.load(response)['access'],'login-required')
            with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(base+'/api/download/windows')
            self.assertEqual(error.exception.code,401)
            request=urllib.request.Request(base+'/api/download/windows',headers={'Cookie':'STUDYROOM_SESSION='+'a'*24})
            with urllib.request.urlopen(request) as response:self.assertEqual(response.headers['X-Accel-Redirect'],'/_protected-downloads/StudyRoom-stable-0.2.0-x64.exe')
            Identity.revoked=True
            with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(request)
            self.assertEqual(error.exception.code,401)
            for path in ('/_protected-downloads/anything','/api/download/windows?file=secret','/api/download/../windows'):
                with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(base+path)
                self.assertEqual(error.exception.code,404)
            upstream.shutdown();upstream.server_close()
            self.assertEqual(gateway.gateway.access('STUDYROOM_SESSION='+'a'*24),'unavailable')
        finally:
            gateway.shutdown();gateway.server_close();upstream.server_close()


if __name__ == '__main__': unittest.main()
