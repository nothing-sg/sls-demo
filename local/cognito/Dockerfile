# Runs cognito-local (see ../README.md) as its own container instead of a
# frontend/node_modules binary launched by `make auth-run`. Built via `npm ci`
# against docker/package-lock.json, which pins cognito-local@5.3.0's full
# transitive dependency tree, rather than pulling a pre-built third-party
# image -- this repo reviews its own dependency tree via lockfiles, and a
# third-party image would sidestep that entirely
# (docs/adr/0008-local-dev-docker-compose.md). Regenerate the lockfile with
# `cd local/cognito/docker && npm install --package-lock-only` after bumping
# the pinned version in docker/package.json.
FROM node:22-alpine

WORKDIR /app
COPY docker/package.json docker/package-lock.json ./
RUN npm ci

# Static config only -- cognito-local reads this from ./.cognito/config.json
# (relative to CWD, hardcoded by the package itself) before it starts.
# UsernameAttributes: [] makes sign-in use plain Username instead of
# cognito-local's email-alias default, matching the real pool
# (infra/modules/api.yaml declares no UsernameAttributes at all) --
# see ../README.md's "Known gaps" section.
COPY cognito-local-config.json .cognito/config.json

EXPOSE 9229
CMD ["node_modules/.bin/cognito-local"]
