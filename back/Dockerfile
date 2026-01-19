# Etapa 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Compilar la aplicación
RUN npm run build

# Etapa 2: Production
FROM node:20-alpine

WORKDIR /app

# Copiar solo las dependencias de producción
COPY package*.json ./
RUN npm ci --only=production

# Copiar el código compilado desde la etapa de build
COPY --from=builder /app/dist ./dist

# Exponer el puerto
EXPOSE 3000

# Variables de entorno por defecto (pueden sobrescribirse)
ENV NODE_ENV=production
ENV PORT=3000

# Comando para ejecutar la aplicación
CMD ["node", "dist/main"]
