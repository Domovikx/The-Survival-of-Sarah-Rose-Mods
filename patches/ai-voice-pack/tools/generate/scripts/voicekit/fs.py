"""Безопасные файловые операции: create-if-missing, dry-run, лог.

Правила: ничего не удалять без явного флага, не перетирать существующее,
каждое действие логируется (dry-run = только отчёт).
"""

import os
import shutil


class Ops:
    """Прослойка операций: apply=False — только печатает план."""

    def __init__(self, apply=False):
        self.apply = apply
        self.log = []

    def _rec(self, action, src, dst=None):
        line = action + ' ' + src + (' -> ' + dst if dst else '')
        self.log.append(line)
        print('  ' + line)

    def ensure_dir(self, d):
        if os.path.isdir(d):
            return
        self._rec('mkdir', d)
        if self.apply:
            os.makedirs(d, exist_ok=True)

    def move(self, src, dst):
        if not os.path.exists(src):
            self._rec('skip-missing', src)
            return False
        if os.path.exists(dst):
            self._rec('skip-exists', src, dst)
            return False
        self._rec('move', src, dst)
        if self.apply:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
        return True

    def copy(self, src, dst):
        if not os.path.exists(src):
            self._rec('skip-missing', src)
            return False
        if os.path.exists(dst):
            self._rec('skip-exists', src, dst)
            return False
        self._rec('copy', src, dst)
        if self.apply:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
        return True

    def remove_dir_if_empty(self, d):
        if not os.path.isdir(d):
            return
        if os.listdir(d):
            self._rec('keep-nonempty', d)
            return
        self._rec('rmdir', d)
        if self.apply:
            os.rmdir(d)