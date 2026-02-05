/// <reference types="vite/client" />

declare module '@assets/*' {
  const src: string;
  export default src;
}

declare module '*.csv?raw' {
  const content: string;
  export default content;
}

declare const __EXPERIMENTAL_SJSIM__: boolean;
