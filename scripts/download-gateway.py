"""Read-only manual installer gateway. Never logs or persists session credentials."""
import argparse
import hashlib
import json
import re
import threading
import urllib.error
import urllib.request
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def session_cookie(raw):
    if not raw or len(raw) > 8192 or '\r' in raw or '\n' in raw:
        return None
    try:
        cookie = SimpleCookie()
        cookie.load(raw)
        item = cookie.get('STUDYROOM_SESSION')
        if not item or not re.fullmatch(r'[A-Za-z0-9_+/=.-]{16,512}', item.value):
            return None
        return 'STUDYROOM_SESSION=' + item.value
    except Exception:
        return None


def access_from_envelope(envelope):
    if not isinstance(envelope, dict) or envelope.get('success') is not True:
        return 'unavailable'
    user = envelope.get('data')
    if user is None:
        return 'login-required'
    if not isinstance(user, dict) or not re.fullmatch(r'[1-9][0-9]{0,18}', str(user.get('id', ''))):
        return 'unavailable'
    if user.get('userType') not in ('NORMAL', 'USER', 'ADMIN', '普通用户', '管理员'):
        return 'restricted'
    if str(user.get('onlineStatus', '')).upper() == 'BANNED' or user.get('passwordChangeRequired') is not False:
        return 'restricted'
    return 'allowed'


class Gateway:
    def __init__(self, release, upstream, origin):
        self.release = release
        self.upstream = upstream
        self.origin = origin
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def access(self, raw_cookie):
        cookie = session_cookie(raw_cookie)
        if not cookie:
            return 'login-required'
        request = urllib.request.Request(self.upstream + '/api/auth/me', headers={
            'Cookie': cookie, 'Accept': 'application/json', 'Host': self.origin.split('://', 1)[1],
            'Origin': self.origin, 'X-Forwarded-Proto': 'https',
        })
        try:
            with self.opener.open(request, timeout=4) as response:
                if response.status != 200:
                    return 'unavailable'
                data = response.read(65537)
                if len(data) > 65536:
                    return 'unavailable'
                return access_from_envelope(json.loads(data))
        except urllib.error.HTTPError as error:
            return 'login-required' if error.code == 401 else 'restricted' if error.code == 403 else 'unavailable'
        except Exception:
            return 'unavailable'


class Handler(BaseHTTPRequestHandler):
    server_version = 'DownloadGateway'
    sys_version = ''

    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(8)

    def json_response(self, status, data):
        encoded = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Cache-Control', 'private, no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(encoded)

    def do_GET(self):
        if self.path not in ('/api/download/status', '/api/download/windows'):
            return self.json_response(404, {'error': 'NOT_FOUND'})
        gateway = self.server.gateway
        access = gateway.access(self.headers.get('Cookie', ''))
        if self.path.endswith('/status'):
            return self.json_response(503 if access == 'unavailable' else 200, {
                'access': access, 'release': gateway.release,
            })
        if access != 'allowed':
            return self.json_response(401 if access == 'login-required' else 403 if access == 'restricted' else 503, {'error': access})
        self.send_response(200)
        self.send_header('X-Accel-Redirect', '/_protected-downloads/' + gateway.release['filename'])
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Cache-Control', 'private, no-store')
        self.end_headers()

    do_HEAD = do_GET

    def do_POST(self):
        self.json_response(405, {'error': 'METHOD_NOT_ALLOWED'})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, gateway):
        self.gateway = gateway
        self.slots = threading.BoundedSemaphore(12)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.sendall(b'HTTP/1.0 503 Service Unavailable\r\nContent-Length: 0\r\nCache-Control: no-store\r\n\r\n')
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        pass


def validate_release(path, artifact):
    release = json.loads(Path(path).read_text(encoding='utf-8'))
    if not re.fullmatch(r'(?:StudyRoom-stable-[0-9A-Za-z.-]+-x64|MoYu-Setup-[0-9A-Za-z.-]+-win-x64)\.exe', release['filename']):
        raise ValueError('Invalid fixed artifact')
    file = Path(artifact)
    if not file.is_file() or file.is_symlink() or file.name != release['filename'] or file.stat().st_size != release['size']:
        raise ValueError('Artifact mismatch')
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != release['sha256']:
        raise ValueError('Artifact checksum mismatch')
    public_url = release.get('publicDownloadUrl')
    if public_url is not None:
        version = release.get('version', '')
        if not re.fullmatch(r'[0-9][0-9A-Za-z.-]{0,79}', version):
            raise ValueError('Invalid public release version')
        expected = 'https://github.com/waaakong/MoYu-Station/releases/download/v' + version + '/' + release['filename']
        if public_url != expected:
            raise ValueError('Invalid public release URL')
    return release


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--release', required=True)
    parser.add_argument('--artifact', required=True)
    parser.add_argument('--port', type=int, default=8182)
    args = parser.parse_args()
    metadata = validate_release(args.release, args.artifact)
    Server(('127.0.0.1', args.port), Gateway(metadata, 'http://127.0.0.1:8180', 'https://8.163.29.26')).serve_forever()
