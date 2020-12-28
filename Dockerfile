ARG NODE_VERSION=15.5-alpine

FROM node:${NODE_VERSION} AS build
ARG CI=true
WORKDIR /build
COPY package.json .
COPY package-lock.json .
RUN npm install

COPY . .
RUN npm run lint 
RUN npm run build

FROM node:${NODE_VERSION} AS run

WORKDIR /app

COPY --from=build /build/package*.json /app
RUN npm install --production

COPY --from=build /build/dist /app/dist

ENTRYPOINT [ "node" ]
CMD [ "--enable-source-maps", "dist/index.js" ]