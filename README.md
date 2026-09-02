# Whiteboard

Локальная Miro-подобная доска для занятий: рисование, картинки, текст, блоки кода и Python в браузере. Доступ по ссылке, без авторизации. Несколько человек могут работать на одной доске одновременно.

## Требования

- Node.js 20+
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) — для доступа из интернета (аккаунт Cloudflare не нужен)

```powershell
winget install --id Cloudflare.cloudflared -e
```

## Запуск

```bash
cd C:\Users\Никита\Documents\quick_studio\whiteboard
npm install
npm run dev:public
```

- Локально: [http://localhost:3000](http://localhost:3000)
- В терминале появится HTTPS-URL вида `https://xxx.trycloudflare.com` — это ссылка для учеников

### Два терминала (если удобнее)

```bash
npm run dev      # терминал 1
npm run tunnel   # терминал 2
```

## Ссылка для учеников

1. Откройте доску **через HTTPS URL из туннеля** (не через localhost)
2. Нажмите **Ссылка** в верхней панели
3. Отправьте, например:

```text
https://xxx.trycloudflare.com/board/<id-доски>
```

Компьютер должен быть включён, `npm run dev:public` — запущен. URL меняется при каждом новом запуске туннеля.

## Возможности

- Рисование, фигуры, стрелки, текст (tldraw)
- Картинки: drag-and-drop, paste, кнопка **+ Image**
- Блок **+ Python** → Run через Pyodide (первый запуск ~15 MB)
- Таблицы: **+ Таблица**
- Realtime-синхронизация и курсоры (`@tldraw/sync`)
- **Export PNG** текущей страницы доски

## Ограничения Python (Pyodide)

- Нет настоящего `input()`
- Нет произвольного сетевого доступа
- Подходит для учебных сниппетов, алгоритмов, печати в stdout

## Данные

- Список досок: `data/boards.db`
- Содержимое комнат: `.rooms/<id>.db`
- Картинки: `.assets/`

Эти папки в `.gitignore`.
