# [2026-10-15] Сделать лендинг на GitHub Pages для продвижения проекта

Статус: DONE

## Результат (2026-10-15)

- Сайт опубликован: **https://domovikx.github.io/The-Survival-of-Sarah-Rose/** — `curl` 200,
  статус `built` (`gh api repos/.../pages --jq '{status,html_url}'`).
- Источник Pages — отдельная orphan-ветка `gh-pages` (2 файла: `index.html`, `.nojekyll`),
  собрана и запушена из `C:\Users\Domo\AppData\Local\Temp\opencode\tssr-pages`
  (свежий `git init -b gh-pages` + `git push -f origin gh-pages`), master не трогали.
- Pages включился автоматически при пуше ветки `gh-pages` (POST /pages вернул 409 "already
  enabled", GET → status built) — ручное включение не понадобилось.
- Homepage репо установлен: `gh repo edit --homepage https://domovikx.github.io/The-Survival-of-Sarah-Rose/`.
- README (коммит `a613069e7`): добавлена строка «Сайт проекта / Project site» в секцию «О проекте».
- Реализовано без Jekyll: один самописный `index.html` (RU-секция первым, EN ниже), SEO:
  title/description/canonical/robots/OG/Twitter-карточка/JSON-LD (SoftwareApplication,
  18+, CC BY-NC 4.0). `<meta keywords>` НЕ ставился — deprecated (ресёрч в задаче).
- Скриншоты подключены через `raw.githubusercontent.com/.../master/screenshots/...` —
  бинарники в ветку не дублировались; 18+ предупреждение есть на странице (шапка+footer+FAQ).

## Задача от пользователя

«из того что можно попробовать реализовать сейчас это GitHub Pages . его можно уже начать
вебсерчить и реализовывать.»
«остальные файлы это другого агента их не трогаем наши только редмишка и опусы»
«нам проект продвигать надо будет»

## Цель

Когда появится трафик из поиска/соцсетей, нужно второе индексируемое URL (не только GitHub-репо)
с короткой ссылкой на скачивание: лендинг-визитка на `https://domovikx.github.io/The-Survival-of-Sarah-Rose/`
с ключевыми словами, скриншотами и кнопкой Download. Критерий: сайт открывается по URL, у него
корректные title/description/OG-теги, ссылка на ZIP работает, мобильная вёрстка не ломается.

## Контекст (что есть сейчас)

- Репо `Domovikx/The-Survival-of-Sarah-Rose` (проверено 2026-10-15 через `gh`): public, master,
  description/topics обновлены сегодня, homepage пуст.
- Страниц GitHub Pages у репо нет (`gh api repos/.../pages` → 404, проверить при выполнении).
- `README.md` уже несёт SEO-блок ключевых слов и статусы озвучки (RU 92.4% / EN 96.0% /
  всего 94.2%, пак ≈ 1.6 ГБ) — данные для лендинга брать оттуда, не дублировать вручную.
- Скриншоты лежат в `screenshots/*.jpg` (4 файла) и закоммичены в master — лендинг может
  ссылаться на них через `raw.githubusercontent.com/.../master/screenshots/...`, дублировать
  бинарники в ветку не нужно.
- В корне репо огромное дерево (`game/`, `ai_voice/` ~1.6 ГБ) — публиковать Pages из master/корня
  НЕЛЬЗЯ: это раздаст содержимое игры по веб-URL. Источник Pages — отдельная ветка `gh-pages`
  с одним статическим HTML.
- `docs/` содержит `voice_candidates_architecture.md` (доки для агентов) — публиковать `/docs` тоже
  нежелательно.

## Что сделать (ресёрч, по протоколу `tasks/AGENT.md`)

Предварительный веб-ресёрч (сверено 2026-10-15, источники: devpalettes.com/blog/seo-meta-tag-guide/,
thisdevtool.com/blog/meta-tags-seo-guide/):

- `<meta name="keywords">` — deprecated, нулевой эффект на ранжирование → на лендинге НЕ ставить;
  ключевые слова живут в тексте страницы, title и description.
- Ранжируют: `<title>`, `meta description`, `canonical`, Open Graph, Twitter Cards, скорость,
  адаптивность, `hreflang` для двух языков.
- GitHub Pages: статика, бесплатный HTTPS, кастомный домен через CNAME, сборка из ветки/папки.
  Факт «как включить через API» — `POST /repos/{owner}/{repo}/pages` с `{"source":{"branch":"gh-pages","path":"/"}}`
  [УТОЧНИТЬ при выполнении: сверить с docs.github.com/en/rest/pages].

Вопросы ресёрча при выполнении:

1. Какой генератор: чистый самописный `index.html` (один файл, 0 зависимостей) vs Jekyll
   (тема minima, больше SEO-структуры, но лишняя сборка)? Гипотеза: самописный HTML —
   проекту нужна одна страница-визитка, Jekyll не даёт выигрыша и добавляет `Gemfile`/сборку.
2. Язык/локализация: одна страница с двумя секциями (RU первым, EN ниже) vs `index.html` +
   `en/index.html` с `hreflang`? Гипотеза: одна страница проще, `hreflang` не обязателен.
3. Где брать статусы озвучки: руками (быстро, устареет) vs ссылка/метка «данные на 15.10.2026»
   (чтобы не врать потом)? Гипотеза: захардкодить с явной датой, обновлять вручную при
   крупных вехах.

Таблица вариантов ≥2 по каждому вопросу — при выполнении, решение согласовать с человеком.

## Приёмка

- [x] URL `https://domovikx.github.io/The-Survival-of-Sarah-Rose/` открывается (200), HTTPS без
      предупреждений. (проверено curl 2026-10-15)
- [x] `<title>` содержит «The Survival of Sarah Rose» и «Русификатор»; `meta description` ≤ 160
      символов с ключами (переписан до 135 символов); OG-теги (`og:title`, `og:description`,
      `og:image`, `og:url`) на месте; `canonical` указывает на Pages-URL.
- [x] Кнопка Download ведёт на
      `https://github.com/Domovikx/The-Survival-of-Sarah-Rose/archive/refs/heads/master.zip`.
- [x] Скриншоты отображаются (ссылки на raw.githubusercontent master ветки).
- [x] Ветка `gh-pages` содержит ТОЛЬКО файлы сайта (index.html, .nojekyll) —
      ни `game/`, ни `ai_voice/`, ни `docs/`.
- [x] Страница читаемая на ширине 375 px — по вёрстке: нет фиксированных ширин, грид
      `auto-fit minmax(260px,1fr)`, картинки `width:100%`; полноценный браузерный чек — не делал.
- [x] Участок 18+ обозначен на странице (шапка-бейдж, FAQ, footer).
- [x] Homepage у репозитория (`gh repo edit --homepage`) указывает на Pages-URL.

## Вне рамок (out of scope)

- Кастомный домен (своё имя домена) — потом, если проект пойдёт.
- Сборка статусов озвучки автоматически (CI, скрипт) — не делаем, только ручная правка.
- Любые правки в `game/`, `mod/`, `tools/` (кроме, при необходимости, README-ссылки на лендинг).
- Продвижение на внешних площадках — отдельная задача `2026-10-15-external-promotion.md`.

## Файлы (ожидаемые)

- Отдельная ветка `gh-pages` (публикуется из свежего orphan-репо в tmp, master не трогаем):
  - `index.html` — одностраничный лендинг (RU+EN секции, SEO-теги, скриншоты, кнопка Download)
  - `.nojekyll` — отключает Jekyll-сборку (файлы раздаются как есть)
- Возможная правка `README.md` — добавить ссылку на лендинг в секцию «О проекте».

## Связи

- Смежная задача `2026-10-15-github-releases-and-metadata.md` — релизы + homepage (homepage
  ставим после того, как Pages заработает).
- Смежная `2026-10-15-external-promotion.md` — трафик на этот лендинг/репо.
- `README.md` — источник фактов (статусы озвучки, ключевые слова, алиасы TSSR/Сара Роуз).
