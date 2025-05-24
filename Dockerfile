FROM node:22.16.0-alpine

WORKDIR /app

COPY . .

RUN npm install

CMD [ "npm", "start" ]
