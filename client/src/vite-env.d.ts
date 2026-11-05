/// <reference types="vite/client" />

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

/** package.json version (vite.config define) */
declare const __APP_VERSION__: string;
