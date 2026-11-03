/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The board tasks go to: the one `board.ts` starts, or `BOARD_URL`'s. */
  readonly BOARD_URL: string;
}
