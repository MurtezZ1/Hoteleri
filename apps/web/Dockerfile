FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g npm@11.6.2
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
RUN npm ci --workspace @odeoniflow/web --include-workspace-root --prefer-offline --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
RUN npm --workspace @odeoniflow/web run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/.next ./apps/web/.next
EXPOSE 3000
CMD ["npm", "--workspace", "@odeoniflow/web", "run", "start"]
