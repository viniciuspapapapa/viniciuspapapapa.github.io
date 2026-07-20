import os
import sys
import json
import tempfile
import socket
import threading
import re
import subprocess
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

# Config file lives next to the .exe (or script), not inside _MEIPASS
CONFIG_PATH = os.path.join(
    os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__)),
    'transcricao_config.json',
)


def load_config():
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(data):
    try:
        cfg = load_config()
        cfg.update(data)
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
flask_app = Flask(__name__)
model_cache = {}
model_lock = threading.Lock()
transcription_lock = threading.Semaphore(1)  # one transcription at a time

SUPPORTED_EXTENSIONS = {
    '.mp3', '.mp4', '.wav', '.m4a', '.mkv', '.avi', '.mov',
    '.webm', '.flac', '.ogg', '.wma', '.wmv', '.mpeg', '.mpga',
    '.opus', '.aac', '.aiff', '.aif', '.amr', '.3gp', '.3gpp',
    '.mka', '.mts', '.m2ts', '.ts', '.vob', '.f4v', '.rm', '.rmvb',
}
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.mpeg'}

NAME_ASKED_PATTERNS = [
    'qual é o seu nome', 'qual seu nome', 'como se chama',
    'pode se identificar', 'qual a sua qualificação',
    'diga o seu nome', 'informe seu nome', 'declare seu nome',
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


# ── Model ──────────────────────────────────────────────────────────────

def get_model(size):
    with model_lock:
        if size not in model_cache:
            from faster_whisper import WhisperModel
            model_cache[size] = WhisperModel(size, device='auto', compute_type='int8')
        return model_cache[size]


# ── Audio conversion ────────────────────────────────────────────────────

def convert_to_wav(input_path):
    """Convert any audio/video to 16 kHz mono WAV using ffmpeg."""
    out = tempfile.mktemp(suffix='.wav')
    result = subprocess.run(
        ['ffmpeg', '-y', '-i', input_path,
         '-ar', '16000', '-ac', '1', '-f', 'wav', out],
        capture_output=True, timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError('ffmpeg: ' + result.stderr.decode(errors='replace')[-300:])
    return out


# ── Speaker clustering (scipy + numpy only, no librosa) ─────────────────

def _spectral_features(frame, sr):
    """Compute spectral centroid, rolloff, RMS and ZCR via numpy FFT."""
    import numpy as np
    n_fft = min(512, len(frame))
    if n_fft < 128:
        return None
    hop = n_fft // 2
    rows = []
    window = np.hanning(n_fft)
    for i in range(0, len(frame) - n_fft, hop):
        sub = frame[i:i + n_fft] * window
        spec = np.abs(np.fft.rfft(sub))
        freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
        total = spec.sum()
        if total > 1e-10:
            centroid = (freqs * spec).sum() / total
            cs = np.cumsum(spec)
            ri = np.searchsorted(cs, 0.85 * cs[-1])
            rolloff = freqs[min(ri, len(freqs) - 1)]
        else:
            centroid = rolloff = 0.0
        rms = float(np.sqrt(np.mean(sub ** 2)))
        zcr = float(np.mean(np.abs(np.diff(np.sign(frame[i:i + n_fft]))) / 2))
        rows.append([centroid, rolloff, rms, zcr])
    if not rows:
        return None
    arr = np.array(rows)
    return np.concatenate([arr.mean(axis=0), arr.std(axis=0)])


def cluster_speakers(audio_path, whisper_segments, n_speakers):
    """Assign speaker labels using numpy FFT features + scikit-learn clustering."""
    try:
        import numpy as np
        from scipy.io import wavfile
        from sklearn.preprocessing import StandardScaler
        from sklearn.cluster import AgglomerativeClustering
    except ImportError as e:
        _default_labels(whisper_segments)
        return whisper_segments, f'Dependência ausente: {e}'

    wav_path = None
    try:
        wav_path = convert_to_wav(audio_path)
        sr, audio = wavfile.read(wav_path)
        if audio.ndim > 1:
            audio = audio[:, 0]
        audio = audio.astype(np.float32)
        if audio.max() > 1.0:
            audio /= max(np.iinfo(np.int16).max, audio.max())
    except Exception as e:
        _default_labels(whisper_segments)
        return whisper_segments, f'Erro na conversão de áudio: {e}'
    finally:
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except OSError:
                pass

    features, valid_idx = [], []
    for i, seg in enumerate(whisper_segments):
        s, e = int(seg['start'] * sr), int(seg['end'] * sr)
        feat = _spectral_features(audio[s:e], sr)
        if feat is not None:
            features.append(feat)
            valid_idx.append(i)

    if len(features) < max(2, n_speakers):
        _default_labels(whisper_segments)
        return whisper_segments, None

    import numpy as np
    X = StandardScaler().fit_transform(np.array(features))
    k = min(n_speakers, len(features))
    labels = AgglomerativeClustering(n_clusters=k, metric='euclidean', linkage='ward').fit_predict(X)

    for vi, si in enumerate(valid_idx):
        whisper_segments[si]['speaker'] = f'ORADOR_{labels[vi] + 1}'
    _default_labels(whisper_segments)
    return whisper_segments, None


def _default_labels(segments):
    for s in segments:
        s.setdefault('speaker', 'ORADOR_1')


# ── Context-based name extraction ───────────────────────────────────────

def extract_speaker_names_from_context(segments):
    """Infer names/roles from speech patterns in Brazilian legal proceedings."""
    names = {}
    for i, seg in enumerate(segments):
        text = seg.get('text', '')
        speaker = seg.get('speaker', '')
        if not speaker:
            continue
        if i > 0:
            prev = segments[i - 1].get('text', '').lower()
            if any(p in prev for p in NAME_ASKED_PATTERNS):
                for pat in NAME_GIVEN_PATTERNS:
                    m = re.search(pat, text, re.IGNORECASE)
                    if m:
                        name = m.group(1).strip()
                        if len(name.split()) >= 2 and speaker not in names:
                            names[speaker] = name
                        break
        if speaker not in names:
            if any(p in text.lower() for p in JUDGE_PATTERNS):
                names[speaker] = 'Juiz'
    return names


# ── Video OCR ────────────────────────────────────────────────────────────

def extract_names_from_video_ocr(video_path):
    """
    Sample video frames and OCR the bottom region (where name plates appear).
    Returns (list of (timestamp, text), error_message).
    """
    try:
        import cv2
    except ImportError:
        return None, 'opencv-python não instalado.\nExecute: pip install opencv-python-headless'

    try:
        import pytesseract
    except ImportError:
        return None, (
            'pytesseract não instalado.\n'
            'Executar: pip install pytesseract\n'
            'E instalar o Tesseract OCR em:\n'
            'https://github.com/UB-Mannheim/tesseract/wiki'
        )

    # Locate tesseract binary
    tess_found = False
    try:
        pytesseract.get_tesseract_version()
        tess_found = True
    except Exception:
        import shutil
        # Check user-configured path first
        cfg_path = load_config().get('tesseract_path', '')
        if cfg_path and os.path.isfile(cfg_path):
            pytesseract.pytesseract.tesseract_cmd = cfg_path
            try:
                pytesseract.get_tesseract_version()
                tess_found = True
            except Exception:
                pass

        # Build list of candidate paths
        home = os.path.expanduser('~')
        local = os.environ.get('LOCALAPPDATA', '')
        roaming = os.environ.get('APPDATA', '')
        pf  = os.environ.get('PROGRAMFILES', r'C:\Program Files')
        pf86 = os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)')

        candidates = [
            shutil.which('tesseract'),
            shutil.which('tesseract.exe'),
            os.path.join(pf,   'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(pf86, 'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(local,  'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(local,  'Programs', 'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(roaming, 'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(home, 'AppData', 'Local', 'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(home, 'AppData', 'Local', 'Programs', 'Tesseract-OCR', 'tesseract.exe'),
            os.path.join(home, 'AppData', 'Roaming', 'Tesseract-OCR', 'tesseract.exe'),
        ]

        # Also try Windows registry
        try:
            import winreg
            for root in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                for key_path in (
                    r'SOFTWARE\Tesseract-OCR',
                    r'SOFTWARE\WOW6432Node\Tesseract-OCR',
                ):
                    try:
                        with winreg.OpenKey(root, key_path) as k:
                            install_dir, _ = winreg.QueryValueEx(k, 'InstallDir')
                            candidates.append(os.path.join(install_dir, 'tesseract.exe'))
                    except OSError:
                        pass
        except Exception:
            pass

        for path in candidates:
            if path and os.path.isfile(path):
                pytesseract.pytesseract.tesseract_cmd = path
                try:
                    pytesseract.get_tesseract_version()
                    tess_found = True
                    break
                except Exception:
                    continue

    if not tess_found:
        return None, (
            'Tesseract OCR não encontrado.\n'
            'Abra o Tesseract-OCR pelo Menu Iniciar, clique com o botão\n'
            'direito → "Abrir local do arquivo" e copie o caminho da pasta.\n'
            'Depois reinicie o aplicativo.'
        )

    try:
        import numpy as np
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None, 'Não foi possível abrir o vídeo para OCR'

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        step = max(1, int(fps * 2.5))   # sample every 2.5 s

        events = []
        frame_idx = 0
        prev_clean = None

        while frame_idx < total:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                break

            t = frame_idx / fps
            h, w = frame.shape[:2]

            # Bottom 30% — where court overlays/name plates appear
            region = frame[int(h * 0.68):, :]

            # Try both light-on-dark and dark-on-light
            gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
            gray = cv2.convertScaleAbs(gray, alpha=1.4, beta=15)

            results = []
            for img in [gray, cv2.bitwise_not(gray)]:
                _, bw = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                cfg = '--psm 6'
                try:
                    lang = 'por' if 'por' in pytesseract.get_languages() else 'eng'
                    txt = pytesseract.image_to_string(bw, config=cfg, lang=lang)
                except Exception:
                    txt = pytesseract.image_to_string(bw, config=cfg)
                results.append(txt.strip())

            text = max(results, key=len)
            clean = ' '.join(text.split())

            if clean and clean != prev_clean and len(clean) > 4:
                events.append((round(t, 2), clean))
                prev_clean = clean

            frame_idx += step

        cap.release()
        return events, None

    except Exception as exc:
        return None, str(exc)


def _parse_name_from_ocr_text(text):
    """Extract the most likely person name or role from OCR text."""
    # Common court overlay patterns: "Dr. João Silva — Advogado", "NOME: FULANO DE TAL"
    patterns = [
        r'(?:nome[:\s]+)([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)+)',
        r'(?:Dr\.|Dra\.)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)*)',
        r'^([A-ZÁÉÍÓÚ]{2,}(?:\s+[A-ZÁÉÍÓÚ]{2,})+)',  # ALL CAPS names
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
        if m:
            return m.group(1).strip().title()

    # Fallback: take first line with ≥2 capitalized words
    for line in text.split('\n'):
        words = line.strip().split()
        cap = [w for w in words if w and w[0].isupper() and len(w) > 2 and w.isalpha()]
        if len(cap) >= 2:
            return ' '.join(cap[:4])
    return None


def match_ocr_to_speakers(ocr_events, segments):
    """
    For each speaker cluster, find which OCR overlay was active most often
    during their speaking turns.
    """
    if not ocr_events:
        return {}

    # Build timeline: at time t the overlay 'text' was visible
    timeline = []  # list of (start, end, name)
    for i, (t, text) in enumerate(ocr_events):
        name = _parse_name_from_ocr_text(text)
        if name:
            end = ocr_events[i + 1][0] if i + 1 < len(ocr_events) else float('inf')
            timeline.append((t, end, name))

    speaker_votes = {}   # { speaker_id: Counter({name: count}) }
    for seg in segments:
        sp = seg.get('speaker')
        if not sp:
            continue
        mid = (seg['start'] + seg['end']) / 2
        for start, end, name in timeline:
            if start - 3 <= mid <= end + 3:
                speaker_votes.setdefault(sp, Counter())[name] += 1

    return {sp: cnt.most_common(1)[0][0] for sp, cnt in speaker_votes.items() if cnt}


# ── Flask routes ─────────────────────────────────────────────────────────

@flask_app.route('/')
def index():
    return send_from_directory(base_dir, 'transcricao.html')


@flask_app.route('/config', methods=['GET'])
def get_config():
    return jsonify(load_config())


@flask_app.route('/config', methods=['POST'])
def set_config():
    data = request.get_json(force=True)
    save_config(data)
    return jsonify({'ok': True})


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
    diarize    = request.form.get('diarize', 'false').lower() == 'true'
    ocr_video  = request.form.get('ocr_video', 'false').lower() == 'true'
    try:
        n_speakers = max(2, min(10, int(request.form.get('n_speakers', '4'))))
    except ValueError:
        n_speakers = 4

    is_video = ext in VIDEO_EXTENSIONS

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    file.save(tmp.name)
    tmp.close()
    temp_path = tmp.name

    def generate():
        try:
            # ── OCR: read names from video frames ──────────────────
            ocr_names_by_speaker = {}
            if ocr_video and is_video:
                yield f'data: {json.dumps({"status": "ocr_lendo", "msg": "Lendo nomes do vídeo…"})}\n\n'
                ocr_events, ocr_err = extract_names_from_video_ocr(temp_path)
                if ocr_err:
                    yield f'data: {json.dumps({"status": "ocr_erro", "msg": ocr_err})}\n\n'
                elif ocr_events:
                    yield f'data: {json.dumps({"status": "ocr_ok", "count": len(ocr_events)})}\n\n'
                    # We'll correlate after diarization

            # ── Transcription ──────────────────────────────────────
            yield f'data: {json.dumps({"status": "carregando_modelo", "model": model_size})}\n\n'
            model = get_model(model_size)

            yield f'data: {json.dumps({"status": "transcrevendo"})}\n\n'
            transcription_lock.acquire()
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
                    'start':   round(seg.start, 2),
                    'end':     round(seg.end, 2),
                    'text':    seg.text.strip(),
                    'speaker': None,
                }
                all_segments.append(seg_data)
                yield f'data: {json.dumps({"segment": seg_data})}\n\n'

            # ── Speaker diarization ────────────────────────────────
            if diarize and all_segments:
                yield f'data: {json.dumps({"status": "identificando_falantes"})}\n\n'
                all_segments, err = cluster_speakers(temp_path, all_segments, n_speakers)
                if err:
                    yield f'data: {json.dumps({"status": "diar_aviso", "msg": err})}\n\n'

                # Merge name sources: context patterns + OCR
                names = extract_speaker_names_from_context(all_segments)

                if ocr_video and is_video and 'ocr_events' in dir():
                    ocr_map = match_ocr_to_speakers(ocr_events, all_segments)
                    # OCR names take priority (they come from the actual video)
                    for sp, name in ocr_map.items():
                        names[sp] = name

                yield f'data: {json.dumps({"speakers_ready": True, "segments": all_segments, "speaker_names": names})}\n\n'

            full_text = ' '.join(s['text'] for s in all_segments)
            yield f'data: {json.dumps({"done": True, "text": full_text, "segments": all_segments, "duration": round(info.duration, 2)})}\n\n'

        except Exception as exc:
            yield f'data: {json.dumps({"error": str(exc)})}\n\n'
        finally:
            try:
                transcription_lock.release()
            except RuntimeError:
                pass
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'},
    )


# ── PyWebView JS API ──────────────────────────────────────────────────────

class TranscricaoApi:
    def save_file(self, content, filename):
        try:
            import tkinter as tk
            from tkinter import filedialog
            ext = os.path.splitext(filename)[1].lower()
            filetypes = {
                '.txt': [('Arquivo de texto', '*.txt'), ('Todos', '*.*')],
                '.srt': [('Legenda SRT', '*.srt'), ('Todos', '*.*')],
            }
            root = tk.Tk()
            root.withdraw()
            root.wm_attributes('-topmost', True)
            path = filedialog.asksaveasfilename(
                parent=root,
                defaultextension=ext,
                initialfile=filename,
                filetypes=filetypes.get(ext, [('Todos', '*.*')]),
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


# ── Entry point ───────────────────────────────────────────────────────────

if __name__ == '__main__':
    import webview

    port = find_free_port()
    api  = TranscricaoApi()

    threading.Thread(
        target=lambda: flask_app.run(host='127.0.0.1', port=port, threaded=True),
        daemon=True,
    ).start()

    webview.create_window(
        'Transcrição de Áudio/Vídeo — Vinicius',
        f'http://127.0.0.1:{port}/',
        width=1100,
        height=860,
        min_size=(800, 600),
        js_api=api,
    )
    webview.start()
