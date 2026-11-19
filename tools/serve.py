"""Static server; --isolate adds COOP/COEP headers (enables SharedArrayBuffer for ffmpeg.wasm).
Usage: python3 serve.py PORT DIR [--isolate]"""
import sys, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ISOLATE = "--isolate" in sys.argv


class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        if ISOLATE:
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("", int(sys.argv[1])), functools.partial(H, directory=sys.argv[2])).serve_forever()
