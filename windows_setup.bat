:: Create conda environment if it doesn't exist
conda env list | find "MagicQuill" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Creating conda environment MagicQuill...
    call conda create -n MagicQuill python=3.10 -y
    
    :: 初始化conda
    echo Initializing conda...
    call conda init cmd.exe
    
    echo Environment created. Please restart the script.
    pause
    exit /b 0
)

:: Activate conda environment
echo Activating conda environment...
call conda activate MagicQuill

:: Install PyTorch with CUDA 11.8
echo Installing PyTorch 2.1.2 with CUDA 11.8...
pip install torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cu118

:: Verify PyTorch installation and CUDA availability
python -c "import torch; print('PyTorch version:', torch.__version__); print('CUDA available:', torch.cuda.is_available())"
if %ERRORLEVEL% NEQ 0 (
echo Failed to install or verify PyTorch
pause
exit /b 1
)

:: Install the required interface package
echo Installing gradio_magicquill...
pip install gradio_magicquill-0.0.1-py3-none-any.whl

:: Install the llava environment
echo Setting up LLaVA environment...
if not exist MagicQuill\LLaVA (
echo Directory MagicQuill\LLaVA does not exist. Ensure the folder structure is correct.
exit /b 1
)
copy /y pyproject.toml MagicQuill\LLaVA
pip install -e MagicQuill\LLaVA\

:: Install remaining dependencies
echo Installing additional requirements...
pip install -r requirements.txt

:: Run MagicQuill
echo Starting MagicQuill...
set CUDA_VISIBLE_DEVICES=0
python gradio_run.py || (
echo Error: Failed to run MagicQuill.
pause
exit /b 1
)