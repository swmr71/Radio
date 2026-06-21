FROM node:22-slim

WORKDIR /app

# 1. reactフォルダ内の package.json と package-lock.json をコピー
COPY react/package*.json ./

# 依存関係をインストール
RUN npm install --production=false

# 2. 全てのソースコードをコピー
COPY . .

# 3. 💡 React のビルド実行（package.jsonがあるフォルダに移動してビルド）
# ※ もしルートの package.json から `npm run build` を叩く構成なら、cd react/ は不要です。
RUN cd react && npm run build

# 本番用に不要な devDependencies を削除してサイズ削減
RUN cd react && npm prune --production

EXPOSE 3001

# 4. サーバーの起動コマンド
# server.js がどこにあるかによってパスを調整してください。
# 例：reactフォルダの外（ルート）にあるならこのままでOK
CMD ["node", "server.js"]
