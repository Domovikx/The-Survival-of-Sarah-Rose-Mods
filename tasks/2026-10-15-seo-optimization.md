# SEO-оптимизация лендинга (2026-10-15)

**Статус:** IN PROGRESS — кодовая часть ГОТОВА и задеплоена, остались ручные шаги
(GSC/Bing) и контент-план. Ресёрч выполнен сабагентом (Google Search Central 2025-2026,
DDG/Brave/Bing-выдача по ~20 запросам EN+RU).

## Цель

Чтобы лендинг `https://domovikx.github.io/The-Survival-of-Sarah-Rose/` начал
ранжироваться по запросам «Survival of Sarah Rose translation / Russian patch /
озвучка» — сейчас он НЕ индексируется (`site:domovikx.github.io` — 0 страниц).

## Ключевые находки ресёрча

- **Ниша свободна:** `Russian voice acting` / `voice acting mod` (EN) — пустая выдача;
  `выживание Сары Роуз озвучка` (RU) — только Boosty falrah (платный машинный
  перевод, озвучки НЕТ ни у кого). Конкурента с AI-озвучкой не существует.
- RU-конкуренты: boosty.to/falrah, Steam-гайд «Русский перевод V.4.9.9 (частично)»
  (#1 по `sarah rose русификатор скачать`), наш GitHub — #2.
- Аббревиатура «ТССР» в RU не ищут — в ключи не тащить.
- Не делать: `meta keywords`, keyword stuffing, `llms.txt` ради Google, погоня за
  длиной текста (Google SEO Starter Guide, AI-optimization-guide 2026).

## Сделано (код, задеплоено 15.10.2026)

- [x] `robots.txt` + `sitemap.xml` в `site/public/` (были 404 → теперь 200)
- [x] Убран бессмысленный hreflang (ru/en/x-default → один URL)
- [x] `<meta name="rating" content="adult">` (Google explicit-guidelines, 17.09.2026)
- [x] og:image/twitter:image → локальный `og.jpg` 1200×630 (сгенерирован из
      скриншота, вместо хрупкого raw.githubusercontent) + og:image:width/height
- [x] JSON-LD: добавлен `WebSite` + `Organization` (SoftwareApplication был)
- [x] Скриншоты секции → локально `site/public/shots/` (1.4 МБ, не зависят от raw)
- [x] Статический meta description → EN (консистентен с `lang="en"` дефолта;
      клиентский `syncDocumentMeta` подменяет title/description/lang при рендере)
- [x] Demo-секция с `<audio>`-плеером 5 фраз RU/EN — совпадает с контент-планом
      п.3 («единственный контент, которого нет ни у кого»)
- [x] IndexNow key-файл `42058e82bea645a19338b78c658f9466.txt`, пинг Bing → 202
      (после каждого крупного обновления: POST https://www.bing.com/indexnow)

## Осталось (ручные шаги — нужны доступы владельца; ОТЛОЖЕНЫ по решению 15.10.2026)

> Индексации не мешают: Google находит страницу через ссылку из README + sitemap
> в robots.txt, Bing уже уведомлён через IndexNow (202). GSC/Bing — ради
> статистики запросов и кнопки Request indexing; вернуться, когда владелец
> будет готов (нужен вход в Google/Microsoft-аккаунт — агент сделать не может).

- [ ] **Google Search Console**: Add property → **URL prefix**
      `https://domovikx.github.io/` (DNS github.io не наш → доменный тип не годится)
      → метод HTML-tag → вставить `<meta name="google-site-verification" content="…">`
      в `<head>` `site/index.html` → Verify → **Sitemaps** → submit
      `…/The-Survival-of-Sarah-Rose/sitemap.xml` → **URL Inspection** главной →
      Request indexing
- [ ] **Bing Webmaster Tools**: bing.com/webmasters → Import from GSC → sitemap
- [ ] **Keyword Planner** (без кампании): волюмы `survival of sarah rose translation`,
      `sarah rose русификатор` и т.п.; **Google Trends** RU+EN: есть ли спрос вообще
- [ ] После верификации: раз в месяц смотреть Performance + Generative AI performance
- [ ] **H1/секции под запросы** (контент-план) и YouTube-видео «Обзор русской
      озвучки TSSR» (запрос пустой → легко занять)

## Контент-план (по приоритету)

1. «Как установить русификатор и озвучку TSSR» — пошагово с картинками
2. Сравнение: наш перевод vs falrah (Boosty) vs Steam-гайд — таблица
3. ~~Демо-плеер озвучки~~ — СДЕЛАНО (секция «Послушайте, как это звучит»)
4. FAQ 8-12 вопросов (ответ первым абзацом — формат цитат AI-ответов)
5. Обзор + статистика по аркам (missing_voices.md — «original data»)
6. YouTube-видео обзора озвучки + embed
7. Скриншоты до/после с alt под ключи (Google Images)
8. Внутренние ссылки: README → лендинг → Releases/секции

## Ключевые фразы (сигнал по выдаче, объёмы — после GSC)

| Запрос                                        | Оценка                                              |
| --------------------------------------------- | --------------------------------------------------- |
| `Survival of Sarah Rose translation` (EN)     | средний спрос, высокая конкуренция (Steam, itch.io) |
| `"Survival of Sarah Rose" Russian patch` (EN) | наш GitHub #1 — закрепить лендингом                 |
| `Sarah Rose voice acting mod` (EN)            | **ниша, пустая выдача** — наш целевой               |
| `выживание сары роуз перевод` (RU)            | высокий, конкурент — Boosty falrah                  |
| `sarah rose русификатор скачать` (RU)         | высокий, Steam-гайд #1, мы #2                       |
| `"выживание Сары Роуз" озвучка` (RU)          | слабый, **конкурентов с озвучкой нет**              |

## Источники (ключевые)

- developers.google.com/search/docs/fundamentals/seo-starter-guide (10.12.2025)
- …/fundamentals/ai-optimization-guide (10.07.2026)
- …/specialty/explicit/guidelines (17.09.2026)
- …/crawling-indexing/javascript/javascript-seo-basics (04.03.2026)
- …/appearance/structured-data/search-gallery (15.06.2026 — FAQPage/HowTo НЕТ в галерее)
- support.google.com/webmasters/answer/9008080 (верификация), indexnow.org, bing.com/webmasters
- seo-hacker.com/seo-checklist-2026/
