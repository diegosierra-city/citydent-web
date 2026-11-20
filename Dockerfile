# --- Build de Astro (bun) ---------------------------------------------------
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# .env.production no viaja en el repo: los valores públicos llegan como build args.
ARG PUBLIC_CHAT_WIDGET_URL=https://api.citydent.app/cc-widget.js
ARG PUBLIC_CHAT_WIDGET_ID=1c7c86371b0c40a5abd20c23f057906e
ARG PUBLIC_CONTACT_ENDPOINT=https://api.citydent.app/web/contacto
ENV PUBLIC_CHAT_WIDGET_URL=$PUBLIC_CHAT_WIDGET_URL \
    PUBLIC_CHAT_WIDGET_ID=$PUBLIC_CHAT_WIDGET_ID \
    PUBLIC_CONTACT_ENDPOINT=$PUBLIC_CONTACT_ENDPOINT
RUN bun run build

# --- Servidor: solo estáticos. El formulario vive en la API (api.citydent.app).
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY docker/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80