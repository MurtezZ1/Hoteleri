FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g npm@11.6.2
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages
RUN npm ci --workspace @odeoniflow/api --include-workspace-root --prefer-offline --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN npm run db:generate
RUN npm --workspace @odeoniflow/api run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
EXPOSE 4000
CMD ["node", "apps/api/dist/src/main.js"]
