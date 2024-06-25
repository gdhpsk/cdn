FROM node:22
WORKDIR /app
COPY package*.json ./
COPY . .
EXPOSE 3020
CMD npm run start
