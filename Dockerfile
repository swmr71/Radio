FROM node:22-slim
WORKDIR /app

COPY react/package*.json ./
RUN npm install

COPY react/ .

# 💡 ここを追加！Reactのビルドを実行して dist フォルダを作らせる
RUN npm run build

EXPOSE 3001
CMD ["node", "server.js"]
