@echo off
echo Scanning node_modules... please wait...
python "%~dp0run_pkg_sizes.py"
if %errorlevel% == 0 (
    echo.
    echo Done! File saved at E:\sunny.txt
    echo Opening file...
    notepad E:\sunny.txt
) else (
    echo.
    echo Error! Make sure Python is installed.
    pause
)
