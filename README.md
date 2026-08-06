# Visual guides

Статические визуальные гайды. Каждая папка - отдельный сайт на Render.

| Гайд | Тема | Сайт |
|------|------|------|
| `envoy-gateway-visualization/` | Envoy Gateway / Gateway API | не задеплоен |
| `traces-tempo/` | Семплинг трейсов, otel-collector + Tempo | не задеплоен |

## Локально

```bash
cd <гайд> && python3 -m http.server      # → localhost:8000
```

Http-сервер обязателен: части грузятся через `fetch`, на `file://` страница пустая.
`?selftest=1` - внутренние проверки гайда.

## Перед коммитом

```bash
node tools/check-tokens.mjs               # все гайды; 1 при расхождениях
node tools/check-tokens.mjs <гайд>        # один
```

## Выкатка

`render.yaml` - блюпринт, по сервису на гайд (`rootDir` + `buildFilter`, сборки нет).
Новый гайд: добавить сервис туда и строку в таблицу выше.

Чек-лист публикации (OG-теги, превью, Post Inspector) - `CONTRIBUTING.md` §6.

## Что где

```
DESIGN.md          общий визуальный закон; эталон токенов в блоках <!-- canonical:... -->
CONTRIBUTING.md    структура гайда, обязательная структура README, self-test, публикация
CLAUDE.md          конвенции репы для агента (en)
render.yaml        блюпринт Render
.mcp.json          Render MCP; ключ - из внешней RENDER_API_KEY, подхват при старте сессии
tools/             проверки
.claude/skills/    процедуры: new-guide, guide-review, publish-guide
<гайд>/README.md   файлы, навигация, контракты, типовые правки
<гайд>/DESIGN.md   свои компоненты + отклонения от закона
```
