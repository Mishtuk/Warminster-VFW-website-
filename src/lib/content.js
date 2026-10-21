// Content the staff saved in the admin (Admin > Post details and the other self-service views). server.js writes it to
// DATA_DIR/content.json and rebuilds; astro.config puts the file's contents in __VFW_CONTENT__. Anywhere else (tests, CI,
// the GitHub Pages preview, the server itself) there is none, and every caller uses its built-in default.
/* global __VFW_CONTENT__ */
const ALL = typeof __VFW_CONTENT__ === 'undefined' ? {} : __VFW_CONTENT__;
export const content = (key, fallback) => ALL[key] ?? fallback;
