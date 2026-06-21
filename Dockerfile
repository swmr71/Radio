FROM node:22-slim
WORKDIR /app

# 一旦シンプルにpackage.jsonのコピーと通常のinstallにする
COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
