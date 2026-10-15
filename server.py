#!/usr/bin/env python3
"""Servidor local para la app de simetría facial.

Solo escucha en 127.0.0.1: nada sale de este Mac. La cámara y el análisis
funcionan dentro del navegador; este servidor solo entrega los archivos.
"""
import functools
import http.server
import os
import sys
import threading
import webbrowser

PORT = 8790
ROOT = os.path.dirname(os.path.abspath(__file__))
URL = f"http://localhost:{PORT}/"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".task": "application/octet-stream",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    open_browser = "--no-browser" not in sys.argv
    handler = functools.partial(Handler, directory=ROOT)
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    except OSError:
        print(f"La app ya está abierta en {URL}")
        if open_browser:
            webbrowser.open(URL)
        return
    print(f"Simetría facial abierta en {URL}")
    print("Cierra esta ventana (o pulsa Ctrl+C) para apagarla.")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(URL)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
