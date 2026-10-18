"""One-shot: sleep until 23:00, then start voice queues + autocommit daemon.

Ephemeral helper (lives in gitignored output/voice/). Launched detached:
    python -c "import subprocess,sys; subprocess.Popen(
        [sys.executable,'-u','output/voice/wake_at_23.py"], ... DETACHED ...)"
Log: output/voice/resume_timer.log
"""

import datetime
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
RESUME_LOG = os.path.join(ROOT, 'output', 'voice', 'resume_timer.log')
AC_LOG = os.path.join(ROOT, 'output', 'voice', 'autocommit.log')
PY = sys.executable
DETACHED = 0x08000000 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP


def log(msg):
    with open(RESUME_LOG, 'a', encoding='utf-8', errors='replace') as f:
        f.write(msg + ' | ')


now = datetime.datetime.now()
target = now.replace(hour=23, minute=0, second=0, microsecond=0)
if target <= now:
    target += datetime.timedelta(days=1)
log('armed %s, wake at %s' % (now.strftime('%H:%M:%S'),
                              target.strftime('%Y-%m-%d %H:%M')))
time.sleep((target - datetime.datetime.now()).total_seconds())
r = subprocess.run([PY, os.path.join(ROOT, 'tools', 'voice_ctl.py'),
                    'start', 'all'],
                   capture_output=True, text=True, cwd=ROOT)
log('queues: ' + (r.stdout + r.stderr).replace(chr(10), ' '))
ac = open(AC_LOG, 'a', encoding='utf-8', errors='replace')
subprocess.Popen(
    [PY, '-u', os.path.join(ROOT, 'tools', 'voice_autocommit.py'),
     '--batch', '1000', '--interval', '14400'],
    stdin=subprocess.DEVNULL, stdout=ac, stderr=subprocess.STDOUT,
    cwd=ROOT, creationflags=DETACHED)
log('autocommit relaunched')
