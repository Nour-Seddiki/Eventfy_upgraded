/**
 * ═══════════════════════════════════════════
 * config.js — Eventfy Environment Configuration
 * Sets the API base URL for production / development.
 * This file MUST be loaded BEFORE api.js in every HTML page.
 * ═══════════════════════════════════════════
 */
'use strict';

// Auto-detect environment: local backend on localhost, otherwise the production API on Render
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.EVENTFY_API_BASE = 'http://localhost:8000';
} else {
  window.EVENTFY_API_BASE = 'https://eventfy-upgraded-api.onrender.com';
}
console.log('[Eventfy config.js] hostname:', window.location.hostname, '→ API_BASE:', window.EVENTFY_API_BASE);
