FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY db ./db
COPY data ./data
RUN npm run build

FROM build AS test
COPY test ./test
CMD ["npm", "test"]

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY db ./db
COPY data ./data
RUN mkdir storage && chown node:node storage
USER node
EXPOSE 4730
CMD ["node", "dist/server.js"]
