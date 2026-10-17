#!/usr/bin/env python3
"""Server locale del gioco: come http.server, ma chiede al browser di non tenere copie vecchie dei file."""
import http.server, sys

class SenzaCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256   # il gioco chiede molti file insieme: la coda deve essere lunga
    daemon_threads = True

Server(('127.0.0.1', porta), SenzaCache).serve_forever()
