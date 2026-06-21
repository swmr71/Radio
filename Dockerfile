FROM node:22-slim
WORKDIR /app

# reactフォルダの中にあるpackage.jsonを指定してコピーする
COPY react/package*.json ./
RUN npm install

# reactフォルダの中身をすべてコンテナの/app直下にコピーする
COPY react/ .

# ポート番号はserver.jsやViteの設定に合わせてね（例として3000）
EXPOSE 3001

# 起動コマンド。server.jsをそのまま叩くか、npm run dev等にするかは環境に合わせて調整してね
CMD ["node", "server.js"]
