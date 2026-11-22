# Числа проекта: где источник и где копии

Одно правило: **числа не придумываются в тексте** — они либо считаются из
файлов на диске, либо берутся из общего снимка. Список ниже — карта: что где
лежит и что делать при обновлении.

## Источник (считается из файлов)

| Что                                        | Откуда                                        | Кто считает                              |
| ------------------------------------------ | --------------------------------------------- | ---------------------------------------- |
| Порядок и состав языков                    | `config/language-priority.json`               | все (сайт, меню, установщик)             |
| Перевод: заполнено/всего                   | `patches/ai-voice-pack/po/<lang>.po`          | `scripts/stats.mts`                      |
| Озвучка: готово/план                       | `patches/ai-voice-pack/audio/<lang>/` + POT   | `voice_status.mts` → `scripts/stats.mts` |
| Версия пака (тег)                          | `site/src/shared/config/pack.ts` (`PACK.tag`) | `scripts/stats.mts`                      |
| Прогресс полной озвучки EN (скорость, ETA) | корпус + mtime файлов                         | `scripts/voice_progress.mts`             |
| Прогресс для меню мода                     | те же источники                               | `catalog_gen.mts` при сборке пака        |

## Производные артефакты (не править руками)

- `config/stats.generated.json` — общий снимок (языки, перевод, озвучка, тег);
  обновление: `npm run stats:update`, проверка свежести: `npm run stats:check`.
- `site/src/shared/config/voice-progress.generated.ts` — снимок для лендинга:
  `node scripts/voice_progress.mts`.
- `catalog/progress.json` в собранном паке — цифры «текст/озвучка» для меню
  мода; генерит `catalog_gen.mts`, в репозитории файла нет.

## Что остаётся руками (и почему)

Числа внутри **прозаических переводов** сайта: «11 languages», «10 languages of
text», «Demo voice in 11 languages» — это ключи в
`site/src/shared/config/i18n.locales.ts`, по строке на каждый из 11 языков.
Автоподстановка тут дороже, чем польза: переводы должны оставаться живым
текстом, а не шаблоном. При добавлении языка:

1. строка в `config/language-priority.json`;
2. `npm run gen:langs` (установщик) — список языков подтянется сам;
3. поправить числа в ключах `i18n.locales.ts` (поиск по «11 languages»);
4. `README.md` / `docs/promo/*` / Steam-гайд — те же числа словами;
5. `npm run stats:update` + `npm test` (если что-то забыто, `stats:check` и
   тесты сайта напомнят).
