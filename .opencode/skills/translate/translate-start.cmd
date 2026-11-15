@echo off
rem Очередь переводов: языки по приоритету, возобновление после ребута/сбоя.
rem Запуск вручную или из Планировщика заданий (ONLOGON) — см. SKILL.md.
cd /d "%~dp0..\..\.."
if not exist tmp mkdir tmp
node ".opencode\skills\translate\translate_queue.mts" %* >> "tmp\translate_queue.console.log" 2>&1
