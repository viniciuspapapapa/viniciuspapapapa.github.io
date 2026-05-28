@echo off
echo ================================================
echo  Construindo Transcrição de Audio/Video
echo  Powered by Whisper (faster-whisper)
echo ================================================
echo.

echo [1/4] Instalando dependencias...
pip install pywebview flask faster-whisper librosa scikit-learn pyinstaller --quiet
if %errorlevel% neq 0 (
    echo ERRO: Falha ao instalar dependencias.
    echo Verifique se o Python esta instalado corretamente.
    echo Dica: Python 3.8+ necessario.
    pause
    exit /b 1
)

echo.
echo [2/4] Verificando ffmpeg...
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo AVISO: ffmpeg nao encontrado no PATH.
    echo Para transcrever videos, instale o ffmpeg:
    echo   https://ffmpeg.org/download.html
    echo Continuando sem ffmpeg (somente audio WAV funcionara)...
    echo.
)

echo [3/4] Gerando executavel...
pyinstaller ^
  --onefile ^
  --noconsole ^
  --name "Transcricao" ^
  --add-data "transcricao.html;." ^
  --hidden-import "faster_whisper" ^
  --hidden-import "ctranslate2" ^
  --hidden-import "tokenizers" ^
  --hidden-import "huggingface_hub" ^
  --collect-all "faster_whisper" ^
  transcricao.py

if %errorlevel% neq 0 (
    echo ERRO: Falha ao gerar o executavel.
    pause
    exit /b 1
)

echo.
echo [4/4] Copiando para a pasta raiz...
copy /Y "dist\Transcricao.exe" "Transcricao.exe" >nul

echo.
echo ================================================
echo  Pronto! Arquivo gerado: Transcricao.exe
echo.
echo  IMPORTANTE: Na primeira execucao, o modelo
echo  Whisper sera baixado automaticamente (~1.5 GB
echo  para large-v3). Isso ocorre uma unica vez.
echo  Os modelos ficam em:
echo    %%USERPROFILE%%\.cache\huggingface\hub\
echo ================================================
echo.
pause
