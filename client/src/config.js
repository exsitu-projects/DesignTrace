// Backend address. In development Vite runs on its own port, so point at Flask;
// in a production build Flask serves the app itself, so same-origin ('') is used.
// Override either with VITE_BACKEND_URL in client/.env
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:10000' : '')
