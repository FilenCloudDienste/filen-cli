FROM oven/bun:alpine AS base
# we use alpine because the default oven/bun:1 image is glibc, which doesn't do well with @jupiterpi/node-keyring
WORKDIR /filen-cli

FROM base AS install

RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
COPY patches/*.patch /temp/dev/patches/
RUN cd /temp/dev && bun install --frozen-lockfile

RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
COPY patches/*.patch /temp/prod/patches/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
RUN bun build --target=bun --sourcemap --define IS_RUNNING_AS_CONTAINER=true src/index.ts --outdir build

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /filen-cli/build build
COPY --from=prerelease /filen-cli/package.json package.json

EXPOSE 80
ENTRYPOINT [ "bun", "run", "build/index.js" ]