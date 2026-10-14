# 개발용 로컬 서버: 캐시를 끄고 http://localhost:8000 으로 제공
import http.server, functools

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

http.server.ThreadingHTTPServer(("", 8000), NoCache).serve_forever()
