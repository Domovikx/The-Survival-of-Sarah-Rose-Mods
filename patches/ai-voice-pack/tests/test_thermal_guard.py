"""Тесты чистой логики решений thermal_guard.decide()."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools', 'generate', 'scripts'))

import thermal_guard as tg


CFG = {
    'work': 45, 'cool': 10,
    'gpu_threshold': 40.0, 'gpu_hold': 60, 'gpu_idle': 120,
    'tick': 15,
}


def dec(st, now, gpu, cfg=None):
    return tg.decide(st, now, gpu, cfg or CFG)


def test_ok_when_idle_and_inside_work_window():
    st, action, reason = dec({'start': 0.0, 'paused': False}, now=60.0, gpu=0.0)
    assert action is None
    assert reason == 'ok'


def test_duty_cool_pause_after_work_minutes():
    # work=45 мин => 2700 сек; 2701 сек — окно остывания
    st, action, reason = dec({'start': 0.0, 'paused': False}, now=2701.0, gpu=0.0)
    assert action == 'pause'
    assert reason == 'duty-cycle'


def test_duty_resume_after_cool_minutes():
    cycle = (45 + 10) * 60
    st, action, reason = dec({'start': 0.0, 'paused': True}, now=cycle + 1, gpu=0.0)
    assert action == 'resume'
    assert reason == 'cycle-done'


def test_duty_cool_is_not_continuous():
    # внутри work-окна даже спустя час от старта, если цикл вернулся к work
    cycle = (45 + 10) * 60
    st, action, _ = dec({'start': 0.0, 'paused': False}, now=cycle + 60, gpu=0.0)
    assert action is None


def test_gpu_hold_triggers_pause():
    cfg = dict(CFG, gpu_hold=60)
    st = {'start': 0.0, 'paused': False}
    # первый тик занят: busy_since запоминается
    st, action, _ = dec(st, now=0.0, gpu=50.0, cfg=cfg)
    assert action is None
    st, action, reason = dec(st, now=59.0, gpu=50.0, cfg=cfg)
    assert action is None
    st, action, reason = dec(st, now=61.0, gpu=50.0, cfg=cfg)
    assert action == 'pause'
    assert reason == 'gpu-busy'


def test_gpu_idle_reset_before_hold():
    cfg = dict(CFG, gpu_hold=60)
    st = {'start': 0.0, 'paused': False}
    st, _, _ = dec(st, now=0.0, gpu=50.0, cfg=cfg)
    # простой сбрасывает busy_since
    st, _, _ = dec(st, now=30.0, gpu=0.0, cfg=cfg)
    st, action, _ = dec(st, now=90.0, gpu=50.0, cfg=cfg)
    assert action is None  # busy_since перезапущен на 90-м тике
    st, action, reason = dec(st, now=151.0, gpu=50.0, cfg=cfg)
    assert action == 'pause'


def test_gpu_resume_after_idle():
    cfg = dict(CFG, gpu_idle=120)
    st = {'start': 0.0, 'paused': True, 'gpu_block': True}
    st, _, _ = dec(st, now=0.0, gpu=0.0, cfg=cfg)
    st, action, _ = dec(st, now=119.0, gpu=0.0, cfg=cfg)
    assert action is None  # idle ещё не набрался
    st, action, reason = dec(st, now=121.0, gpu=0.0, cfg=cfg)
    assert action == 'resume'


def test_gpu_none_treated_as_idle():
    st, action, reason = dec({'start': 0.0, 'paused': False}, now=60.0, gpu=None)
    assert action is None


def test_gpu_below_threshold_is_idle():
    cfg = dict(CFG, gpu_hold=10)
    st = {'start': 0.0, 'paused': False}
    st, action, _ = dec(st, now=0.0, gpu=39.9, cfg=cfg)
    st, action, _ = dec(st, now=600.0, gpu=39.9, cfg=cfg)
    assert action is None


def test_pause_wins_when_both_triggers():
    cfg = dict(CFG, gpu_hold=10)
    st = {'start': 0.0, 'paused': False}
    st, _, _ = dec(st, now=0.0, gpu=90.0, cfg=cfg)
    # duty-окно тоже наступило
    st, action, reason = dec(st, now=2800.0, gpu=90.0, cfg=cfg)
    assert action == 'pause'


def test_disabled_duty_cycle():
    cfg = dict(CFG, work=0, cool=0)
    st, action, reason = dec({'start': 0.0, 'paused': True}, now=99999.0, gpu=0.0, cfg=cfg)
    # duty выключен, gpu тихо -> paused=True должен сняться? Нет: should_pause=False
    assert action == 'resume'


def test_decide_does_not_mutate_input():
    st = {'start': 0.0, 'paused': False}
    dec(st, now=60.0, gpu=0.0)
    dec(st, now=2701.0, gpu=90.0)
    assert st == {'start': 0.0, 'paused': False}
