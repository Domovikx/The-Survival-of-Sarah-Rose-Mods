# registry/ — БД мода: единственные места истины

Все мапы и голосовые определения живут ЗДЕСЬ. Всё остальное в моде —
производное от этой БД, игры или рук разметки (см. «Дерииват» внизу).

## Истина (правишь только здесь)

- **who_map.jsonl** — реестр спикеров игры: каждый персонаж = строка.
  Ключ записи = character (джойн с папкой каста 1:1); поле define = define-id
  игры. Хранится ТОЛЬКО дельта от дефолта (DRY): who — легаси-код (bsk, orc),
  names — опечатки/rename, voice — реюзы, status — deprecated, entity —
  «один персонаж, N ключей» (void-god: Voice/Master/Daemon).
  Пересборка после апдейта игры: `python tools/generate/scripts/who_map_bootstrap.py`
  (освежает define, новых спикеров добавляет, рукописные дельты не трогает).
- **overrides.jsonl** — точечные uid-исключения парсера: {uid=md5(текста),
  who, note}. Применяются в voice_catalog.parse_game — реплики со спикером-
  маской «Voice», размеченные на реальных персонажей (23 шт; разметка:
  tmp/voice_tag_attribution.md, вердикт по 15 неоднозначным — у владельца).
- **casts/** — голоса кастов (бывшего voice_candidates): {Имя}/{Имя}.yaml —
  контракт (инструкция, тексты, who_codes), реф {Имя}.wav в корне папки,
  сырьё generated/ и gen_selected/. Схема yaml: casts/cast_schema.json.
  Подключение нового каста = папка + who_codes в yaml + перегенерация
  catalog/voice_list.json.

## Дерииват (НЕ править руками; пересобирается из БД/игры)

- **catalog/voices.jsonl** — каталог озвучки из игры + tl мода:
  `python tools/generate/scripts/voice_catalog.py` (записи на пару uid+who,
  диф-манифесты в tmp/voice_delta при --diff).
- **catalog/voice_list.json** — рантайм-карта by_who (собирается из
  registry/who_map + casts-who_codes).
- **catalog/label_arc.json** — label -> arc (парсер игры).
- **catalog/emotions.json** — пофразовые эмоции (эвристика:
  `python tools/generate/scripts/emotion_tag.py`).
- **tools/generate/output/** — журналы/логи/state генератора (thermal_guard,
  batch.log); файлы-утилиты запуска (.sh/.ps1) здесь же — это инструменты,
  не данные.
- **tmp/ в корне репы** — манифесты, смоук-каталоги, отчёты аудитов.

## Аудио (не БД, а результат)

- **audio/vo\_{ru,en}/** — сгенерированная озвучка; файл = uid__Who.opus.
  Источник истины для «кто говорит» — реестр + overrides, отсюда и списки
  переозвучки.
