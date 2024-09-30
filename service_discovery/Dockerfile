FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080
EXPOSE 50051

CMD ["node", "discovery.js"]