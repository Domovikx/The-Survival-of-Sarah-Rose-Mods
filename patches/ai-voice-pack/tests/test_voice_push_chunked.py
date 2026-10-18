"""Тесты voice_push_chunked: нарезка чанков, парсинг, расписание."""

from voice_push_chunked import (next_occurrence, parse_hhmm, parse_ls_remote,
                                plan_chunks)


def test_plan_empty():
    assert plan_chunks([], 700 * 1024 * 1024) == []


def test_plan_single_small_commit():
    assert plan_chunks([100], 700 * 1024 * 1024) == [0]


def test_plan_fits_in_one_chunk():
    sizes = [100, 250, 400, 550]
    assert plan_chunks(sizes, 700 * 1024 * 1024) == [3]


def test_plan_splits_by_cumulative_window():
    # 4 коммита по 400 МБ, лимит 700 МБ:
    # первый чанк берёт idx 0..1 (800 > 700 — стоп на 1? считаем от базы)
    mb = 1024 * 1024
    sizes = [400 * mb, 800 * mb, 1200 * mb, 1600 * mb]
    bounds = plan_chunks(sizes, 700 * mb)
    # чанк1: база 0 -> idx0 (400), idx1 (800) уже > 700 => [0]
    # чанк2: база 400 -> idx1 (800-400=400 ok), idx2 (1200-400=800 >) => [1]
    # чанк3: база 800 -> idx2 (400), idx3 (800>) => [2]
    # чанк4: база 1200 -> idx3 (400) => [3]
    assert bounds == [0, 1, 2, 3]


def test_plan_packs_multiple_per_chunk():
    mb = 1024 * 1024
    # 6 коммитов по 100 МБ, лимит 350 МБ: 100+100+100+100=400 > 350,
    # значит 3 на чанк (300), 4-й уходит в следующий.
    sizes = [100 * mb, 200 * mb, 300 * mb, 400 * mb, 500 * mb, 600 * mb]
    bounds = plan_chunks(sizes, 350 * mb)
    assert bounds == [2, 5]


def test_plan_respects_base_offset():
    mb = 1024 * 1024
    # после первого чанка база = sizes[idx]; окно считается от базы,
    # а не от нуля — иначе второй чанк был бы пустым
    sizes = [100 * mb, 500 * mb, 600 * mb, 700 * mb]
    bounds = plan_chunks(sizes, 450 * mb)
    # чанк1: база 0 -> idx0(100), idx1(500>450) => [0]
    # чанк2: база 100 -> idx1(400), idx2(500>450) => [1]
    # чанк3: база 500 -> idx2(100), idx3(200) => [3]
    assert bounds == [0, 1, 3]
    assert bounds[-1] == len(sizes) - 1


def test_plan_oversized_commit_alone():
    mb = 1024 * 1024
    sizes = [2 * mb, 2 * mb + 10]
    bounds = plan_chunks(sizes, mb)
    assert bounds[0] == 0
    assert bounds[-1] == 1


def test_parse_ls_remote():
    out = 'aabbccddeeff00112233445566778899aabbccdd\trefs/heads/feature/2026-09-30\n'
    assert parse_ls_remote(out) == 'aabbccddeeff00112233445566778899aabbccdd'
    assert parse_ls_remote('') is None
    assert parse_ls_remote('  \n') is None


def test_parse_hhmm():
    assert parse_hhmm('23:00') == (23, 0)
    assert parse_hhmm('06:05') == (6, 5)
    for bad in ('24:00', '12:60', '12', '12:00:00', 'aa:bb', ''):
        try:
            parse_hhmm(bad)
        except ValueError:
            pass
        else:
            raise AssertionError('expected ValueError for %r' % bad)


def test_next_occurrence_tomorrow():
    import datetime
    ref = datetime.datetime(2026, 10, 8, 22, 0, 0)
    got = next_occurrence('23:00', after=ref)
    assert got == datetime.datetime(2026, 10, 8, 23, 0, 0)


def test_next_occurrence_wraps_to_next_day():
    import datetime
    ref = datetime.datetime(2026, 10, 8, 23, 30, 0)
    got = next_occurrence('23:00', after=ref)
    assert got == datetime.datetime(2026, 10, 9, 23, 0, 0)


def test_next_occurrence_until_after_at():
    # until=06:00 при старте 23:00 должен дать следующее утро
    import datetime
    start = datetime.datetime(2026, 10, 8, 23, 0, 0)
    got = next_occurrence('06:00', after=start)
    assert got == datetime.datetime(2026, 10, 9, 6, 0, 0)
