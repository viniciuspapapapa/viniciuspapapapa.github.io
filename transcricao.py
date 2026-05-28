import os
import sys
import json
import tempfile
import socket
import threading
import re
from collections import Counter

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

# Patterns to detect when a name is being asked (Brazilian court context)
NAME_ASKED_PATTERNS = [
    'qual é o seu nome', 'qual seu nome', 'como se chama',
    'pode se identificar', 'qual a sua qualificação',
    'diga o seu nome', 'informe seu nome', 'declare seu nome',
    'me diga seu nome', 'qual o nome',
]

NAME_GIVEN_PATTERNS = [
    r'(?:meu nome é|me chamo|chamo-me|sou o|sou a)\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][a-záéíóúàâêôãõüç]+(?:\s+[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][a-záéíóúàâêôãõüç]+)+)',
    r'^([A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][a-záéíóúàâêôãõüç]+(?:\s+[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][a-záéíóúàâêôãõüç]+){1,4})(?:,|\.|$)',
]

JUDGE_PATTERNS = [
    'prossiga', 'pode responder', 'defiro', 'indefiro',
    'consigne-se', 'audiência encerrada', 'próxima pergunta',
    'pode se retirar', 'nada mais a declarar', 'declare ao juízo',
    'concedo a palavra', 'sem mais perguntas', 'pode perguntar',
]


def get_model(size):
    with model_lock:
        if size not in model_cache:
            from faster_whisper import WhisperModel
            model_cache[size] = WhisperModel(size, device='auto', compute_type='int8')
        return model_cache[size]


def cluster_speakers(audio_path, whisper_segments, n_speakers):
    """Assign speaker labels to segments using MFCC features + agglomerative clustering."""
    try:
        import librosa
        import numpy as np
        from sklearn.preprocessing import StandardScaler
        from sklearn.cluster import AgglomerativeClustering
    except ImportError:
        for seg in whisper_segments:
            seg.setdefault('speaker', 'ORADOR_1')
        return whisper_segments

    try:
        y, sr = librosa.load(audio_path, sr=16000, mono=True)
    except Exception:
        for seg in whisper_segments:
            seg.setdefault('speaker', 'ORADOR_1')
        return whisper_segments

    # Extract MFCC features at fine granularity (every 0.4s)
    hop = 0.4
    win = 1.0
    hop_s = int(hop * sr)
    win_s = int(win * sr)

    frame_times = []
    frame_feats = []

    for start in range(0, len(y) - win_s, hop_s):
        frame = y[start:start + win_s]
        t = start / sr
        try:
            mfcc = librosa.feature.mfcc(y=frame, sr=sr, n_mfcc=20)
            feat = np.concatenate([np.mean(mfcc, axis=1), np.std(mfcc, axis=1)])
            frame_times.append(t)
            frame_feats.append(feat)
        except Exception:
            pass

    if len(frame_feats) < max(2, n_speakers):
        for seg in whisper_segments:
            seg.setdefault('speaker', 'ORADOR_1')
        return whisper_segments

    feats = np.array(frame_feats)
    scaler = StandardScaler()
    feats_scaled = scaler.fit_transform(feats)

    k = min(n_speakers, len(frame_feats))
    labels = AgglomerativeClustering(n_clusters=k, metric='euclidean', linkage='ward').fit_predict(feats_scaled)

    # Assign labels to whisper segments via majority vote over overlapping frames
    for seg in whisper_segments:
        seg_start, seg_end = seg['start'], seg['end']
        votes = [
            labels[i]
            for i, ft in enumerate(frame_times)
            if seg_start - hop <= ft <= seg_end + hop
        ]
        if votes:
            seg['speaker'] = f'ORADOR_{Counter(votes).most_common(1)[0][0] + 1}'
        else:
            seg['speaker'] = 'ORADOR_1'

    return whisper_segments


def extract_speaker_names(segments):
    """Infer speaker names/roles from speech patterns in Brazilian legal proceedings."""
    speaker_names = {}

    for i, seg in enumerate(segments):
        text = seg.get('text', '')
        text_lower = text.lower().strip()
        speaker = seg.get('speaker', '')
        if not speaker:
            continue

        # If previous turn asked for a name, try to extract it from this response
        if i > 0:
            prev_text = segments[i - 1].get('text', '').lower()
            if any(p in prev_text for p in NAME_ASKED_PATTERNS):
                for pattern in NAME_GIVEN_PATTERNS:
                    m = re.search(pattern, text, re.IGNORECASE)
                    if m:
                        name = m.group(1).strip()
                        if len(name.split()) >= 2 and speaker not in speaker_names:
                            speaker_names[speaker] = name
                        break

        # Detect judge by speech patterns
        if speaker not in speaker_names:
            if any(p in text_lower for p in JUDGE_PATTERNS):
                speaker_names[speaker] = 'Juiz'

    return speaker_names


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
    diarize = request.form.get('diarize', 'false').lower() == 'true'
    try:
        n_speakers = max(2, min(10, int(request.form.get('n_speakers', '4'))))
    except ValueError:
        n_speakers = 4

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    file.save(tmp.name)
    tmp.close()
    temp_path = tmp.name

    def generate():
        try:
            yield f'data: {json.dumps({"status": "carregando_modelo", "model": model_size})}\n\n'
            model = get_model(model_size)

            yield f'data: {json.dumps({"status": "transcrevendo"})}\n\n'
            segments_gen, info = model.transcribe(
                temp_path,
                language='pt',
                task='transcribe',
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )

            all_segments = []
            for seg in segments_gen:
                seg_data = {
                    'start': round(seg.start, 2),
                    'end': round(seg.end, 2),
                    'text': seg.text.strip(),
                    'speaker': None,
                }
                all_segments.append(seg_data)
                yield f'data: {json.dumps({"segment": seg_data})}\n\n'

            if diarize and all_segments:
                yield f'data: {json.dumps({"status": "identificando_falantes"})}\n\n'
                all_segments = cluster_speakers(temp_path, all_segments, n_speakers)
                speaker_names = extract_speaker_names(all_segments)
                yield f'data: {json.dumps({"speakers_ready": True, "segments": all_segments, "speaker_names": speaker_names})}\n\n'

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


class TranscricaoApi:
    """PyWebView JS API — exposes native file-save dialog to the frontend."""

    def save_file(self, content, filename):
        try:
            import tkinter as tk
            from tkinter import filedialog

            ext = os.path.splitext(filename)[1].lower()
            filetypes = {
                '.txt': [('Arquivo de texto', '*.txt'), ('Todos os arquivos', '*.*')],
                '.srt': [('Legenda SRT', '*.srt'), ('Todos os arquivos', '*.*')],
            }

            root = tk.Tk()
            root.withdraw()
            root.wm_attributes('-topmost', True)

            path = filedialog.asksaveasfilename(
                parent=root,
                defaultextension=ext,
                initialfile=filename,
                filetypes=filetypes.get(ext, [('Todos os arquivos', '*.*')]),
                title='Salvar transcrição',
            )
            root.destroy()

            if path:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                return {'ok': True, 'path': path}
            return {'ok': False}
        except Exception as exc:
            return {'ok': False, 'error': str(exc)}


if __name__ == '__main__':
    import webview

    port = find_free_port()
    api = TranscricaoApi()

    server_thread = threading.Thread(
        target=lambda: flask_app.run(host='127.0.0.1', port=port, threaded=True),
        daemon=True,
    )
    server_thread.start()

    webview.create_window(
        'Transcrição de Áudio/Vídeo — Vinicius',
        f'http://127.0.0.1:{port}/',
        width=1100,
        height=860,
        min_size=(800, 600),
        js_api=api,
    )
    webview.start()
