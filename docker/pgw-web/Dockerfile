FROM node:24-slim

WORKDIR /app

# Copy pgw-web package files
COPY pgw-web/package.json pgw-web/package-lock.json ./

# Patch: remove private registry packages, db-migration will be installed manually
RUN node -e " \
  const pkg = require('./package.json'); \
  delete pkg.dependencies['@pgw/db-migration']; \
  delete pkg.dependencies['@pgw/rn-storybook']; \
  require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));"

RUN npm install --legacy-peer-deps

# Copy pgw-db-migration dist into node_modules so require('@pgw/db-migration') works
# and it resolves sequelize from the app's node_modules
COPY pgw-db-migration/package.json node_modules/@pgw/db-migration/package.json
COPY pgw-db-migration/dist/ node_modules/@pgw/db-migration/dist/

# Copy pgw-web source (after install for layer caching)
COPY pgw-web/ ./

# Patch: stub out CSRF middleware. Per docs/references/pg-bff-design.md, TW is a BFF —
# CSRF is a browser-to-server concern and has no meaning on the TW→pgw-web
# server-to-server link. Prod target (docs/references/pg-team-asks.md #3) has pgw-web
# skip CSRF for TW's allowlisted IP; this stub gives us the same behavior
# locally without requiring PG team changes or adding CSRF shims to TW.
RUN node -e "require('fs').writeFileSync('src/server/routers/csrf.middleware.ts', 'import express from \"express\";\nexport default function(_csrfCookieName){return express.Router();}\n');"

# Copy env file so webpack can read config values during server build
COPY tw-pg-experiment/pgw-web.env.example .env

# Build server bundle only (skip client — we only need the API)
RUN npx webpack --mode development --config webpack.config.server.babel.ts

EXPOSE 3001

CMD ["node", "build/server/server-bundle.js"]
