# Whiteboard

Miro-подобная доска для занятий: рисование, картинки, текст, блоки кода и Python в браузере. Realtime-синхронизация без регистрации для учеников.

## Роли

| Кто | URL | Что может |
|-----|-----|-----------|
| **Ученик** | `/` | Открыть доску по ID или ссылке |
| **Преподаватель** | `/admin` | Создавать, удалять доски, копировать ссылки |

## Локальная разработка

```bash
npm install
npm run dev
```

- Сайт: http://localhost:3000
- API: http://localhost:3001 (прокси через Vite)

### Админка в dev

По умолчанию пароль `admin` (если не задан `ADMIN_PASSWORD_HASH`).

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

## Возможности

- Рисование, фигуры, стрелки, текст (tldraw)
- Картинки: drag-and-drop, paste, **+ Image**
- **+ Python** через Pyodide (~15 MB при первом запуске)
- **+ Таблица**
- Realtime-синхронизация (`@tldraw/sync`)
- Export PNG

## Ограничения Python (Pyodide)

- Нет `input()`
- Нет произвольного сетевого доступа
