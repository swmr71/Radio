FROM node:22-slim

WORKDIR /app

# package.json と package-lock.json をコピー
COPY package*.json ./

# 依存関係をインストール（Lucide React 含む）
RUN npm install --production=false

# ソースコードをコピー
COPY . .

# 💡 React のビルド実行して dist フォルダを生成
RUN npm run build

# 本番用に不要な devDependencies を削除してサイズ削減（オプション）
RUN npm prune --production

EXPOSE 3001

CMD ["node", "server.js"]
