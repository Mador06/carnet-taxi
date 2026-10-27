@echo off
rem Lance le petit serveur local puis ouvre l'app dans le navigateur.
rem "-ExecutionPolicy Bypass" ne s'applique qu'à ce lancement, rien n'est modifié sur le PC.
start "" http://localhost:8080/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serveur.ps1"
