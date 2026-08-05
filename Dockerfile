# Optional container deployment (nginx serving the built single-file bundle).
# The primary deployment path is uploading dist/index.html to SAS Content —
# see README. Build with:
#   docker build --build-arg VITE_ANTHROPIC_API_KEY=sk-ant-... -t ddc-ai-narrative .
FROM node:22-alpine AS builder
WORKDIR /app
ARG VITE_ANTHROPIC_API_KEY
ENV VITE_ANTHROPIC_API_KEY=$VITE_ANTHROPIC_API_KEY
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80/tcp
CMD ["/usr/sbin/nginx", "-g", "daemon off;"]
