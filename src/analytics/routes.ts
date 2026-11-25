export const publicMeasurementPaths = new Set(['/', '/tours', '/reservar', '/contacto', '/terminos', '/privacidad']);
export const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/';
export const isMeasurementPath = (path: string) => publicMeasurementPaths.has(normalizePath(path));
export const safePath = (path: string) => isMeasurementPath(path) ? normalizePath(path) : '/not-found';
