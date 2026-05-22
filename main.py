import webview
import threading
import http.server
import socketserver
import os
import sys
import socket


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def get_base_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def start_server(directory, port):
    os.chdir(directory)
    with socketserver.TCPServer(('127.0.0.1', port), SilentHandler) as httpd:
        httpd.serve_forever()


if __name__ == '__main__':
    base_dir = get_base_dir()
    port = find_free_port()

    t = threading.Thread(target=start_server, args=(base_dir, port), daemon=True)
    t.start()

    webview.create_window(
        'Controle Financeiro — Vinicius',
        f'http://127.0.0.1:{port}/financas.html',
        width=1280,
        height=820,
        min_size=(900, 600),
    )
    webview.start()
