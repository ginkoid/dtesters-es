FROM node:12-buster-slim

WORKDIR /app
COPY package.json yarn.lock /app/
COPY src /app/src

ENV NODE_ENV production
RUN yarn

ENV APP_PORT 8000
ENV APP_HOST 0.0.0.0
EXPOSE 8000

CMD ["node", "/app/src/app.js"]
