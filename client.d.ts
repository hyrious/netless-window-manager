/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPID: string;
  readonly VITE_ROOM_UUID: string;
  readonly VITE_ROOM_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
