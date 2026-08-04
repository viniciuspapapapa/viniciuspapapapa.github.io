"""
Gerador de Resposta a Ofícios — QESH / TPC Advogados
Empacota a ferramenta qesh-oficio.html como aplicativo de desktop.

Uso local:
    pip install pywebview
    python qesh_app.py

Para gerar o executável (.exe), rode build_qesh.bat no Windows.
"""
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
    # Quando empacotado pelo PyInstaller, os arquivos ficam em sys._MEIPASS
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
        'Resposta a Ofícios — QESH · TPC Advogados',
        f'http://127.0.0.1:{port}/qesh-oficio.html',
        width=1200,
        height=860,
        min_size=(960, 640),
    )
    webview.start()
