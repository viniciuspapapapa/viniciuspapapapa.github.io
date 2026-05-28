import os
import sys
import json
import tempfile
import socket
import threading

from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context


def get_base_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


base_dir = get_base_dir()
flask_app = Flask(__name__)
model_cache = {}
model_lock = threading.Lock()

SUPPORTED_EXTENSIONS = {
    '.mp3', '.mp4', '.wav', '.m4a', '.mkv', '.avi', '.mov',
    '.webm', '.flac', '.ogg', '.wma', '.wmv', '.mpeg', '.mpga',
}


def get_model(size):
    with model_lock:
        if size not in model_cache:
            from faster_whisper import WhisperModel
            model_cache[size] = WhisperModel(size, device='auto', compute_type='int8')
        return model_cache[size]


@flask_app.route('/')
def index():
    return send_from_directory(base_dir, 'transcricao.html')


@flask_app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Arquivo inválido'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return jsonify({'error': f'Formato não suportado: {ext}'}), 400

    model_size = request.form.get('model', 'large-v3')

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    file.save(tmp.name)
    tmp.close()
    temp_path = tmp.name

    def generate():
        try:
            yield f'data: {json.dumps({"status": "carregando_modelo", "model": model_size})}\n\n'
            model = get_model(model_size)

            yield f'data: {json.dumps({"status": "transcrevendo"})}\n\n'
            segments, info = model.transcribe(
                temp_path,
                language='pt',
                task='transcribe',
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )

            all_segments = []
            for seg in segments:
                seg_data = {
                    'start': round(seg.start, 2),
                    'end': round(seg.end, 2),
                    'text': seg.text.strip(),
                }
                all_segments.append(seg_data)
                yield f'data: {json.dumps({"segment": seg_data})}\n\n'

            full_text = ' '.join(s['text'] for s in all_segments)
            yield f'data: {json.dumps({"done": True, "text": full_text, "segments": all_segments, "duration": round(info.duration, 2)})}\n\n'

        except Exception as exc:
            yield f'data: {json.dumps({"error": str(exc)})}\n\n'
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'X-Accel-Buffering': 'no',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    )


@flask_app.route('/model-status')
def model_status():
    return jsonify({'loaded': list(model_cache.keys())})


if __name__ == '__main__':
    import webview

    port = find_free_port()

    server_thread = threading.Thread(
        target=lambda: flask_app.run(host='127.0.0.1', port=port, threaded=True),
        daemon=True,
    )
    server_thread.start()

    webview.create_window(
        'Transcrição de Áudio/Vídeo — Vinicius',
        f'http://127.0.0.1:{port}/',
        width=1100,
        height=820,
        min_size=(800, 600),
    )
    webview.start()
