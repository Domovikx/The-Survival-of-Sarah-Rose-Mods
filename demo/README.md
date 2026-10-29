# demo — одна фраза для ручной отладки формата

Реплика Carolyn (en), uid `965008809955fb24bad05d00315049d9` — та самая из
жалобы: `audio/en/BlackMonolith/965008809955fb24bad05d00315049d9__Carolyn.opus`.

| Файл              | Что это                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `carolyn_en.wav`  | wav, который делается перед opus: PCM16 mono 24 kHz, loudnorm −16 LUFS / TP −1.5 (те же `LOUD_ARGS`, что и в бою) |
| `carolyn_en.opus` | сам opus из этого wav: libopus 24 kbps mono (те же аргументы ffmpeg, что в `voicekit/audio.mts`)                  |

Генерация: `node demo/gen.mts` (реальный TS-путь: шим `cosyworker.py` на CUDA →
PCM → trim → wav/opus; keep_wav=true — единственная разница с боем, чтобы wav
остался).

Для отладки: открой wav — открывается? opus — нет? Значит, дело в шаге
wav→opus (или в плеере). Своим ffmpeg можно перекодировать wav и сравнить.
