# 逆ネーター

サーバー不要の静的Webアプリです。Vercelに1クリックでデプロイできます。

## デプロイ手順

### 方法①：Vercel CLIを使う（ターミナル）

```bash
npm i -g vercel
cd reverse-nator
vercel
```

### 方法②：GitHub経由（GUIのみ・おすすめ）

1. GitHubに新しいリポジトリを作成
2. このフォルダの中身をアップロード
3. [vercel.com](https://vercel.com) にログインして「New Project」
4. GitHubリポジトリを選択して「Deploy」

## フォルダ構成

```
reverse-nator/
├── vercel.json      # Vercel設定
└── public/
    └── index.html   # ゲーム本体（すべて1ファイル）
```
