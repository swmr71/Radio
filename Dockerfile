# ============ ビルドステージ ============
FROM node:22-slim AS builder

WORKDIR /app

# 依存関係の解決だけを先に行い、ソース変更でキャッシュが飛ばないようにする
COPY react/package.json react/package-lock.json ./
RUN npm ci

# フロントエンドのビルドに必要なものだけコピー
COPY react/index.html react/vite.config.js ./react/
COPY react/src ./react/src

# Vite は /app/node_modules を辿って解決される
RUN cd react && npm run build

# ============ 実行ステージ ============
FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

# 本番依存のみインストール（react / vite / lucide-react は
# devDependencies なのでバンドル済み dist にだけ含まれていればよい）
COPY react/package.json react/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY react/server.js ./react/server.js
COPY --from=builder /app/react/dist ./react/dist

RUN mkdir -p /data

# 非rootで動かす場合は以下2行を有効化する。ただしホスト側の ./data が
# uid 1000 (node) で書き込み可能である必要がある:
#   sudo chown -R 1000:1000 ./data
# RUN chown -R node:node /data /app
# USER node

EXPOSE 3001

CMD ["node", "react/server.js"]
