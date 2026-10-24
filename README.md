# Whiteboard

Miro-подобная доска для занятий: рисование, картинки, текст, блоки кода и Python в браузере. Realtime-синхронизация без регистрации для учеников.

## Роли

| Кто | URL | Что может |
|-----|-----|-----------|
| **Ученик** | `/` | Открыть доску по ID или ссылке |
| **Преподаватель** | `/admin` | Создавать, удалять доски, копировать ссылки |

## Локальная разработка

Нужен Node.js **22.12+** (установщик VPS использует Node.js 24).

```bash
npm install
npm run dev
```

- Сайт: http://localhost:3000
- API: http://localhost:3001 (прокси через Vite)

### Админка в dev

Скопируйте шаблон и задайте свой пароль локально (файл `.env` в git не попадает):

```bash
cp .env.example .env
# задайте ADMIN_PASSWORD и SESSION_SECRET
```

1. http://localhost:3000/admin/login
2. Создайте доску
3. Скопируйте ссылку для учеников

### Быстрый доступ из интернета (Cloudflare)

```bash
npm run dev:public
```

Ссылка появится в терминале (`https://xxx.trycloudflare.com`).

## Деплой на VPS (Timeweb / Aeza / Selectel)

Рекомендуемый тариф: **1 vCPU, 1 GB RAM, 10 GB SSD** (~300–500 ₽/мес). Без Docker — меньше RAM.

### 1. Подготовка секретов (на своём ПК)

```bash
node scripts/hash-admin-password.mjs
```

Сгенерируйте `SESSION_SECRET` (случайная строка 32+ символов).

### 2. Файл `.env` на сервере

```env
NODE_ENV=production
PORT=3000
ADMIN_PASSWORD_HASH=<bcrypt hash>
SESSION_SECRET=<random secret>
```

Шаблон: [`deploy/.env.example`](deploy/.env.example)

### 3. Установка на Ubuntu 22.04

```bash
git clone <your-repo> /home/deploy/whiteboard
cd /home/deploy/whiteboard
cp deploy/.env.example .env
# отредактируйте .env
npm ci --include=dev
npm run build
```

### 4. pm2

```bash
npm install -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

### 5. nginx + HTTPS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/whiteboard
# замените board.example.ru на ваш домен
sudo ln -s /etc/nginx/sites-available/whiteboard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d board.example.ru
```

Или автоматически: `sudo bash deploy/setup-vps.sh board.example.ru` (нужен `REPO_URL`).

### 6. Swap (для 1 GB RAM)

```bash
sudo fallocate -l 512M /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### systemd (альтернатива pm2)

[`deploy/whiteboard.service`](deploy/whiteboard.service)

## Использование после деплоя

**Ученики:** `https://ваш-домен/` → ввод ID или ссылки → доска

**Вы:** `https://ваш-домен/admin` → пароль → создать доску → **Ссылка**

## Бэкап

Сохраняйте папки:

- `data/` — список досок
- `.rooms/` — содержимое
- `.assets/` — картинки

Загрузка изображений разрешена участникам по действующей ссылке доски. Сервер
выдаёт случайный ID и запрещает перезапись файла. Поддерживаются PNG, JPEG, GIF,
WebP до 10 МБ; по умолчанию лимиты — 100 МБ/500 файлов на доску и
512 МБ/5000 файлов суммарно (включая старые загрузки). Объём можно изменить
переменными `ASSET_BOARD_MB` и `ASSET_TOTAL_MB`. Действуют ограничения частоты
и четырёх одновременных загрузок. При удалении доски закрываются подключения,
удаляются её SQLite-файлы и новые изображения. Старые изображения с адресами
`/uploads/:id` остаются доступны для совместимости и учитываются в общей квоте;
их связь с доской в старом формате не сохранялась.

Таблицы ограничены 100 строками, 20 столбцами, 1000 ячейками и 2000 символами
на ячейку. Эти ограничения проверяют и клиент, и сервер.

## Возможности

- Рисование, фигуры, стрелки, текст (tldraw)
- Картинки: drag-and-drop, paste, **+ Image**
- **+ Python** через Pyodide (~15 MB при первом запуске)
- **+ Таблица**
- Realtime-синхронизация (`@tldraw/sync`)
- Export PNG
- ИИ-помощник `gpt-6-luna`: чат, анализ доски, подготовка текста, Python и таблиц

## Подключение ИИ

Добавьте в `.env` **на сервере** (не в GitHub и не в переменные `VITE_`):

```env
OPENAI_API_KEY=<ваш API-ключ OpenAI>
AI_REQUESTS_PER_HOUR=120
```

Модель фиксирована: `gpt-6-luna`, запросы идут через OpenAI Responses API.
Нужен API-аккаунт с доступом к модели и средствами на балансе. Подписка ChatGPT
не заменяет оплату API. Ключ не передаётся браузеру и не попадает в сборку.
После обновления кода выполните `npm ci --include=dev`, `npm run build` и
`pm2 startOrRestart deploy/ecosystem.config.cjs --update-env`. При изменении
только API-ключа достаточно перезапустить сервер.

На доске появится кнопка **ИИ-помощник**. Доступ есть у всех участников с её
ссылкой. Помощник получает текст/код/таблицы текущей страницы или выделения.
По умолчанию прикладывается снимок выбранной области для разбора рисунков и
изображений; снимок можно отключить. Включайте только то, что хотите передать
OpenAI. Большие страницы (более 200 объектов) нужно разбить на выделения.
Ответы и предложения объектов видны только текущему участнику, история хранится
в памяти вкладки. Предложения добавляются в общую доску кнопкой **Добавить на доску**
и отменяются обычным Undo. Python автоматически не запускается.

Ограничения: 15 запросов за 10 минут с одного IP, 120 в час суммарно по умолчанию
(`AI_REQUESTS_PER_HOUR`), до 4 одновременных запросов на сервер и 2 на доску.
Один запрос участника использует не более 3 вызовов модели по 4000 выходных токенов;
история и контекст ограничены по длине. Это ограничения нагрузки, а не денежный бюджет.
Расходы и бюджет проекта также настройте в кабинете OpenAI. При отсутствии ключа
доска продолжает работать, помощник показывает сообщение о подключении.

Официальная документация: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Responses API / function calling](https://developers.openai.com/api/docs/guides/function-calling).

## Ограничения Python (Pyodide)

- Нет `input()`
- Выполнение в Worker внутри iframe с отдельным изолированным origin;
  доступа к странице и административному API нет. CSP разрешает загрузки только с CDN Pyodide.
- Stop принудительно завершает Worker; лимит загрузки/выполнения — 60 секунд на этап.
- Каждый запуск создаёт новый интерпретатор; переменные предыдущего запуска не сохраняются.
