"""Конфигурация pytest для тестов voice pipeline."""

import os
import sys

# Добавляем tools/ в путь для импорта модулей
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
