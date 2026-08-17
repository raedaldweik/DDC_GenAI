# Container deployment (Railway or any Docker host). nginx serves the built
# single-file bundle and listens on $PORT (injected by Railway, defaults to 80
# for local runs). Local build:
#   docker build --build-arg VITE_ANTHROPIC_API_KEY=sk-ant-... -t ddc-ai-narrative .
# On Railway, set VITE_ANTHROPIC_API_KEY as a service variable — it is passed
# to the build because it is declared as ARG below.
FROM node:22-alpine AS builder
WORKDIR /app
ARG VITE_ANTHROPIC_API_KEY
ARG VITE_CLAUDE_MODEL
ENV VITE_ANTHROPIC_API_KEY=$VITE_ANTHROPIC_API_KEY
ENV VITE_CLAUDE_MODEL=$VITE_CLAUDE_MODEL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# The nginx image's entrypoint runs envsubst on /etc/nginx/templates/*.template,
# so ${PORT} is resolved at container start.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
RUN rm -f /etc/nginx/conf.d/default.conf
ENV PORT=80
EXPOSE 80/tcp
CMD ["nginx", "-g", "daemon off;"]
