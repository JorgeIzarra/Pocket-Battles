FROM node:22-slim
WORKDIR /app

# Instalar dependencias primero (mayor reutilización de cache)
COPY apps/web/package.json ./
RUN npm install

# Las variables VITE_ se bakean en el bundle en build time — deben llegar como ARG.
# En docker-compose se pasan via build.args desde el .env del host.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_API_URL=http://localhost:3001
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_STRIPE_PUBLISHABLE_KEY=${VITE_STRIPE_PUBLISHABLE_KEY}
ENV VITE_API_URL=${VITE_API_URL}

COPY apps/web/ ./
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
