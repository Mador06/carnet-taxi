@echo off
rem Met à jour la liste des établissements de santé du 06, et hôpitaux/cliniques du 83 et du 13 (fichier FINESS officiel).
rem Ensuite, renvoyez le fichier data\etablissements.json sur GitHub.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\maj-etablissements.ps1"
pause
