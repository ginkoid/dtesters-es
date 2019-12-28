FROM node:12-buster-slim

COPY package.json yarn.lock /app/
WORKDIR /app

ENV NODE_ENV production
RUN yarn

COPY src /app/src

ENV APP_PORT 8000
ENV APP_HOST 0.0.0.0
EXPOSE 8000

CMD ["node", "/app/src/app.js"]
