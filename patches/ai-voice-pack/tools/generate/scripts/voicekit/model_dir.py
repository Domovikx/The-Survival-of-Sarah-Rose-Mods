"""Модельные директории CosyVoice3: tuned-копии, атомарная правка yaml, хилка.

Замена внешнего make_tuned_model_dir (W40K cosyvoice3_demo.py, вне нашего
репо). Отличия:

- правка cosyvoice3.yaml АТОМАРНА (temp-файл + os.replace): убийство
  процесса в момент перезаписи больше не оставляет 0-байтный yaml —
  именно это ломало загрузку модели «навсегда» (2026-09-16);
- автохилка: сломанный/пустой yaml восстанавливается из базовой модели
  (Fun-CosyVoice3-0.5B) перед перезаписью;
- preflight ensure_model_yaml(): проверка yaml непосредственно перед
  AutoModel (хилит, если сломан чем-то внешним).
"""

import os
import re
import shutil
import tempfile
import time

from voicekit import tts_env

YAML_NAME = 'cosyvoice3.yaml'

_SAMP_RE = {
    'top_p': r'top_p: [0-9.]+',
    'top_k': r'top_k: [0-9.]+',
    'tau_r': r'tau_r: [0-9.]+',
    'cfg_rate': r'inference_cfg_rate: [0-9.]+',
}

_REQUIRED_KEYS = ('top_p:', 'top_k:', 'tau_r:', 'inference_cfg_rate:')


def base_model_dir():
    return os.path.join(tts_env.COSY_ROOT, 'pretrained_models',
                        'Fun-CosyVoice3-0.5B')


def tuned_model_dir(top_p=None, top_k=None, tau_r=None, rl=False,
                    cfg_rate=None):
    tag = []
    if top_p is not None:
        tag.append('p{}'.format(top_p))
    if top_k is not None:
        tag.append('k{}'.format(top_k))
    if tau_r is not None:
        tag.append('t{}'.format(tau_r))
    if cfg_rate is not None:
        tag.append('c{}'.format(cfg_rate))
    if rl:
        tag.append('rl')
    return base_model_dir() + ('_' + '_'.join(tag) if tag else '')


def link_tree(src, dst):
    """Hardlink-копия модель-дира; cosyvoice3.yaml — отдельная копия
    (правка сэмплинга в варианте не течёт в базовую модель).

    Терпим к конкурентному созданию: два воркера (RU+EN), стартовавшие
    одновременно, строят один tuned-дир — повторный makedirs/link
    игнорируется, а не падает (грабли 2026-09-30: PermissionError/
    FileExistsError при параллельном старте очередей)."""
    try:
        os.makedirs(dst, exist_ok=True)
    except OSError:
        if not os.path.isdir(dst):
            raise
    for name in os.listdir(src):
        s = os.path.join(src, name)
        d = os.path.join(dst, name)
        if os.path.isfile(s):
            if os.path.exists(d):
                continue
            if name == YAML_NAME:
                try:
                    shutil.copy2(s, d)
                except FileExistsError:
                    pass
            else:
                try:
                    os.link(s, d)
                except FileExistsError:
                    pass
        elif os.path.isdir(s):
            link_tree(s, d)


def _yaml_ok(path):
    try:
        with open(path, encoding='utf-8') as f:
            text = f.read()
    except OSError:
        return False
    if len(text) < 200:
        return False
    return all(k in text for k in _REQUIRED_KEYS)


def _rewrite_sampling(text, top_p=None, top_k=None, tau_r=None, cfg_rate=None):
    """Идемпотентная подмена параметров сэмплинга (re.sub по значению,
    а не str.replace — иначе '25' -> '25.0' -> '25.0.0...')."""
    if top_p is not None:
        text = re.sub(_SAMP_RE['top_p'], 'top_p: {}'.format(top_p),
                      text, count=1)
    if top_k is not None:
        text = re.sub(_SAMP_RE['top_k'], 'top_k: {}'.format(top_k),
                      text, count=1)
    if tau_r is not None:
        text = re.sub(_SAMP_RE['tau_r'], 'tau_r: {}'.format(tau_r),
                      text, count=1)
    if cfg_rate is not None:
        text = re.sub(_SAMP_RE['cfg_rate'],
                      'inference_cfg_rate: {}'.format(cfg_rate),
                      text, count=1)
    return text


def _atomic_write(path, text, retries=5):
    """Запись через temp-файл в той же директории + os.replace (атомарно).

    retries: повторы при PermissionError — на Windows второй воркер
    (параллельный voice_batch другой арки/языка) может держать yaml
    открытым на чтение в момент replace; ждём и пробуем снова
    (грабли 2026-09-30: WinError 5 при одновременном старте RU+EN)."""
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(prefix='.' + os.path.basename(path) + '.',
                               suffix='.tmp', dir=d)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(text)
        for attempt in range(retries):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt + 1 >= retries:
                    raise
                time.sleep(0.5 * (attempt + 1))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _heal_yaml(yaml_path, base_path, top_p=None, top_k=None, tau_r=None,
               cfg_rate=None):
    """Восстановить сломанный yaml из базовой модели. True = чинил."""
    if _yaml_ok(yaml_path):
        return False
    if not _yaml_ok(base_path):
        raise RuntimeError(
            'cosyvoice3.yaml сломан и в {}, и в базовой {}'.format(
                yaml_path, base_path))
    with open(base_path, encoding='utf-8') as f:
        text = f.read()
    text = _rewrite_sampling(text, top_p, top_k, tau_r, cfg_rate)
    _atomic_write(yaml_path, text)
    return True


def make_tuned_model_dir(top_p=None, top_k=None, tau_r=None, rl=False,
                         cfg_rate=None):
    """Tuned-дир (hardlink-копия базовой) с заданным сэмплингом в yaml.

    Создаёт dir при отсутствии, хилит сломанный yaml, переписывает
    параметры сэмплинга атомарно. Возвращает путь к tuned-диру."""
    dst = tuned_model_dir(top_p, top_k, tau_r, rl, cfg_rate)
    yaml_path = os.path.join(dst, YAML_NAME)
    base = os.path.join(base_model_dir(), YAML_NAME)
    if not os.path.exists(yaml_path):
        print('making tuned model dir:', dst)
        link_tree(base_model_dir(), dst)
    if not _heal_yaml(yaml_path, base, top_p, top_k, tau_r, cfg_rate):
        with open(yaml_path, encoding='utf-8') as f:
            text = f.read()
        new = _rewrite_sampling(text, top_p, top_k, tau_r, cfg_rate)
        # Текст уже нужный — не пишем: каждый запуск voice_batch иначе
        # переписывает общий tuned-yaml, провоцируя гонку с параллельным
        # воркером (см. _atomic_write). Пропуск делает повторные вызовы
        # read-only (идемпотентность без записи).
        if new != text:
            _atomic_write(yaml_path, new)
    if rl:
        llm_pt = os.path.join(dst, 'llm.pt')
        rl_pt = os.path.join(dst, 'llm.rl.pt')
        base_pt = os.path.join(dst, 'llm.base.pt')
        if os.path.exists(rl_pt) and not os.path.exists(base_pt):
            os.rename(llm_pt, base_pt)
            os.rename(rl_pt, llm_pt)
    return dst


def ensure_model_yaml(model_dir, top_p=None, top_k=None, tau_r=None,
                      cfg_rate=None):
    """Preflight перед загрузкой модели: yaml валиден? Если нет — чинит
    из базовой модели (с применением сэмплинга). True = пришлось чинить."""
    yaml_path = os.path.join(model_dir, YAML_NAME)
    return _heal_yaml(yaml_path, os.path.join(base_model_dir(), YAML_NAME),
                      top_p, top_k, tau_r, cfg_rate)