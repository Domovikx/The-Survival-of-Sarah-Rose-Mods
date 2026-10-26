@echo off
REM Плановая задача Windows: выгрузить LM Studio после простоя (см. AGENTS.md).
REM Запуск вручную: scripts\lmstudio_idle.cmd [--minutes 15] [--dry] [--watch]
REM Регистрация (каждые 10 мин):
REM   schtasks /Create /TN "LM Studio idle" /SC MINUTE /MO 10 /TR "%~dp0lmstudio_idle.cmd"
cd /d "%~dp0.."
node scripts\lmstudio_idle.mts %*
