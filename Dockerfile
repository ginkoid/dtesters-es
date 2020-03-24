FROM node:12-buster-slim AS build

WORKDIR /app
COPY package.json yarn.lock ./
RUN apt update && apt install python make g++ -y
ENV NODE_ENV production
RUN yarn

FROM node:12-buster-slim AS run

COPY --from=build /app /app
COPY src /app/src

ENV APP_PORT 8000
ENV APP_HOST 0.0.0.0
EXPOSE 8000

CMD ["node", "/app/src/app.js"]
