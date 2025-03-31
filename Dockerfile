# === Базовий образ для розробки ===
FROM node:18-alpine AS development

# Встановлюємо залежності для збірки нативних модулів (якщо потрібно)
RUN apk add --no-cache python3 g++ make

# Встановлюємо глобально Prisma та nodemon
RUN npm install -g prisma nodemon

# Робоча директорія
WORKDIR /app

# Копіюємо конфігурацію залежностей
COPY package*.json ./
COPY prisma ./prisma/

# Встановлюємо залежності
RUN npm ci

# Генеруємо Prisma Client
RUN npx prisma generate

# Копіюємо весь код
COPY . .

# Команда для запуску в режимі розробки
CMD ["npm", "run", "dev"]

# === Продакшен образ ===
FROM node:18-alpine AS production

# Оточення
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Копіюємо конфігурацію залежностей
COPY package*.json ./
COPY prisma ./prisma/

# Встановлюємо ТІЛЬКИ production залежності
RUN npm ci --only=production

# Генеруємо Prisma Client
RUN npx prisma generate

# Копіюємо збірку з попереднього етапу
COPY --from=development /app/dist ./dist

# Порт
EXPOSE 5000

# Команда для запуску
CMD ["node", "dist/app.js"]