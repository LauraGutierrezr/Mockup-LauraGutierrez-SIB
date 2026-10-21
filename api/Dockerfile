# Imagen de demostración. Para OpenShift: la imagen corre como usuario no root y escucha en 8080.
FROM node:22-alpine AS build
WORKDIR /app/api
COPY api/package*.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/api/node_modules ./api/node_modules
COPY --from=build /app/api/dist ./api/dist
COPY api/data ./api/data
COPY api/package.json ./api/package.json
COPY web ./web
ENV PORT=8080
EXPOSE 8080
USER 1001
CMD ["node", "api/dist/main.js"]
