FROM node:22-slim
WORKDIR /react

# 一旦シンプルにpackage.jsonのコピーと通常のinstallにする
COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
