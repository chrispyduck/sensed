ARG NODE_VERSION=15.5-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache python3 py3-pip

FROM base AS build
RUN apk add --no-cache alpine-sdk linux-headers

ARG CI=true
WORKDIR /build
COPY package.json .
COPY package-lock.json .
RUN npm install

COPY . .
RUN npm run lint 
RUN npm run build

FROM base AS run

WORKDIR /app

COPY --from=build /build/package*.json /app/
RUN set -xe; \
    apk add --no-cache alpine-sdk linux-headers; \
    npm install --production; \
    apk del --no-cache alpine-sdk linux-headers;

COPY --from=build /build/dist /app/dist

ENTRYPOINT [ "node" ]
CMD [ "--enable-source-maps", "dist/index.js" ]