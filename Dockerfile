FROM node:12-buster-slim

WORKDIR /app
COPY package.json yarn.lock /app/
COPY src /app/src

ENV NODE_ENV production
RUN yarn

ENV APP_PORT 80
EXPOSE 80

USER node

CMD ["node", "/app/src/app.js"]
