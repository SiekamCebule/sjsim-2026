/// <reference types="vite/client" />

declare module '@assets/*' {
  const src: string;
  export default src;
}
