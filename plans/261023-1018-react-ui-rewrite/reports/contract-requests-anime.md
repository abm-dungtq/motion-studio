# Yêu cầu đổi hợp đồng: vùng anime

Không có. Vùng anime dùng hợp đồng `ui-contracts-v1` như đã có:

- `useAnime`, `useAnimeJob`, `animeChars`, `animeVariant`, `animeManifest`, `animeEnable`, `animeRebuild`, `keys.anime*` trong `ui/src/api/queries.ts`;
- `actions.pick`, `actions.transport.seek`;
- `bus`, `registerTab`, `Empty`, `ErrorBoundary`, các control trong `shell/controls.tsx`, `Tabs`, `Dialog`.
