"""Тесты voicekit.model_dir: tuned-копии, атомарная правка yaml, хилка."""

import os

import pytest

from voicekit import model_dir

BASE_YAML = (
    "model:\n"
    "  sampling:\n"
    "    top_p: 0.8\n"
    "    top_k: 25\n"
    "    tau_r: 0.1\n"
    "  inference_cfg_rate: 0.7\n"
    "  qwen_pretrain_path: 'CosyVoice-BlankEN'\n"
    "# padding до 200+ символов, чтобы _yaml_ok считал файл валидным\n"
    "# " + 'x' * 120 + "\n"
)


@pytest.fixture
def base_dir(tmp_path, monkeypatch):
    b = tmp_path / 'base'
    b.mkdir()
    (b / model_dir.YAML_NAME).write_text(BASE_YAML, encoding='utf-8')
    (b / 'flow.pt').write_bytes(b'flow')
    (b / 'llm.pt').write_bytes(b'llm')
    monkeypatch.setattr(model_dir, 'base_model_dir', lambda: str(b))
    return b


def _yaml_text(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def test_make_tuned_dir_rewrites_sampling(base_dir):
    dst = model_dir.make_tuned_model_dir(0.9, 30.0, 0.2, cfg_rate=0.5)
    assert dst == str(base_dir) + '_p0.9_k30.0_t0.2_c0.5'
    text = _yaml_text(os.path.join(dst, model_dir.YAML_NAME))
    assert 'top_p: 0.9' in text
    assert 'top_k: 30.0' in text
    assert 'tau_r: 0.2' in text
    assert 'inference_cfg_rate: 0.5' in text
    base = _yaml_text(os.path.join(str(base_dir), model_dir.YAML_NAME))
    assert 'top_k: 25' in base


def test_make_tuned_dir_hardlinks(base_dir):
    dst = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    src_flow = os.path.join(str(base_dir), 'flow.pt')
    dst_flow = os.path.join(dst, 'flow.pt')
    assert os.path.samefile(src_flow, dst_flow)
    src_y = os.path.join(str(base_dir), model_dir.YAML_NAME)
    dst_y = os.path.join(dst, model_dir.YAML_NAME)
    assert not os.path.samefile(src_y, dst_y)


def test_make_idempotent(base_dir):
    dst = model_dir.make_tuned_model_dir(0.8, 30.0, 0.1, cfg_rate=0.7)
    first = _yaml_text(os.path.join(dst, model_dir.YAML_NAME))
    dst2 = model_dir.make_tuned_model_dir(0.8, 30.0, 0.1, cfg_rate=0.7)
    assert dst2 == dst
    second = _yaml_text(os.path.join(dst2, model_dir.YAML_NAME))
    assert first == second
    assert 'top_k: 30.0.0' not in second
    assert 'top_k: 30.0' in second


def test_heal_empty_yaml(base_dir):
    dst = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    yaml_path = os.path.join(dst, model_dir.YAML_NAME)
    open(yaml_path, 'w').close()
    assert len(_yaml_text(yaml_path)) == 0
    dst2 = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    assert dst2 == dst
    text = _yaml_text(yaml_path)
    assert 'top_k: 25.0' in text
    assert 'top_p: 0.8' in text


def test_repeat_call_skips_write(base_dir, monkeypatch):
    """Повторный вызов с теми же параметрами не пишет yaml заново
    (защита от гонки параллельных воркеров за общий tuned-дир)."""
    dst = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    calls = []
    orig = model_dir._atomic_write

    def counting(path, text, *a, **k):
        calls.append(path)
        return orig(path, text, *a, **k)

    monkeypatch.setattr(model_dir, '_atomic_write', counting)
    dst2 = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    assert dst2 == dst
    assert calls == []
    assert [n for n in os.listdir(dst) if n.endswith('.tmp')] == []


def test_atomic_no_tmp_leftovers(base_dir):
    dst = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    leftovers = [n for n in os.listdir(dst) if n.endswith('.tmp')]
    assert leftovers == []


def test_ensure_ok_noop(base_dir):
    dst = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    yaml_path = os.path.join(dst, model_dir.YAML_NAME)
    before = _yaml_text(yaml_path)
    assert not model_dir.ensure_model_yaml(dst, 0.8, 25.0, 0.1,
                                           cfg_rate=0.7)
    assert _yaml_text(yaml_path) == before


def test_ensure_heals(base_dir):
    dst = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)
    yaml_path = os.path.join(dst, model_dir.YAML_NAME)
    open(yaml_path, 'w').close()
    assert model_dir.ensure_model_yaml(dst, 0.8, 25.0, 0.1, cfg_rate=0.7)
    assert 'top_k: 25.0' in _yaml_text(yaml_path)


def test_base_broken_raises(base_dir):
    open(os.path.join(str(base_dir), model_dir.YAML_NAME), 'w').close()
    with pytest.raises(RuntimeError):
        model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, cfg_rate=0.7)


def test_rl_rename(base_dir):
    src = str(base_dir)
    with open(os.path.join(src, 'llm.rl.pt'), 'wb') as f:
        f.write(b'llm-rl')
    dst = model_dir.make_tuned_model_dir(0.8, 25.0, 0.1, rl=True,
                                         cfg_rate=0.7)
    assert os.path.samefile(os.path.join(src, 'llm.rl.pt'),
                            os.path.join(dst, 'llm.pt'))
    assert os.path.exists(os.path.join(dst, 'llm.base.pt'))