FROM node:20-alpine as build
WORKDIR /filen-cli
COPY . .
ENV FILEN_IS_CONTAINER=true
RUN npm ci && npm run build

FROM node:20-alpine
WORKDIR /filen-cli
COPY --from=build /filen-cli/dist/bundle.js /filen-cli/filen.js
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "amd64" ] ; then npm install @parcel/watcher-linux-x64-musl ; else npm install @parcel/watcher-linux-arm64-musl ; fi
EXPOSE 80
ENTRYPOINT ["node", "filen.js"]