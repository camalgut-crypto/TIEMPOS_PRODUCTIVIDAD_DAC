@echo off
rem Queda atendiendo el botón "Actualizar" de la app y actualiza sola cada N minutos.
cd /d "%~dp0"
".venv\Scripts\python.exe" worker\actualizar.py --escuchar
