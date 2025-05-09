FROM node:22-bullseye

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 3004

CMD [ "npm", "start" ]
