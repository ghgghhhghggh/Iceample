// error-utils.js — Centralized error handling for Tauri invocations + localStorage
//
// Usage:
//   import { safeInvoke, safeLs } from './error-utils.js'
//
//   const data = await safeInvoke('read_text_file', { path })
//   // returns null on failure, shows toast automatically
//
//   safeLs.set('my:key', 'value')   // never throws
//   const v = safeLs.get('my:key', 'fallback')

// ── Tauri invoke wrapper ──────────────────────────────────────────────────────
/**
 * Safely call a Tauri backend command.
 * - Returns the command result on success.
 * - Returns null on failure and shows an error toast.
 * @param {string} cmd   Tauri command name
 * @param {object} args  Command arguments (default: {})
 * @returns {Promise<any|null>}
 */
export async function safeInvoke(cmd, args = {}) {
  try {
    const { invoke } = window.__TAURI__.core
    return await invoke(cmd, args)
  } catch (e) {
    const msg = typeof e === 'string' ? e : (e?.message ?? String(e))
    console.error(`[tauri:${cmd}]`, e)
    window.toast?.(`${cmd}: ${msg}`, 'error', 5000)
    return null
  }
}

// ── Safe localStorage wrapper ─────────────────────────────────────────────────
/**
 * localStorage wrapper that never throws.
 * Handles QuotaExceededError (private browsing, full storage) silently.
 */
export const safeLs = {
  /**
   * Get a string value. Returns `fallback` (default null) on missing or error.
   */
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key)
      return v !== null ? v : fallback
    } catch (e) {
      console.warn('[localStorage:get]', key, e)
      return fallback
    }
  },

  /**
   * Set a string value. Silently ignores quota errors.
   */
  set(key, value) {
    try {
      localStorage.setItem(key, String(value))
    } catch (e) {
      console.warn('[localStorage:set]', key, e)
    }
  },

  /**
   * Remove a key. Silently ignores errors.
   */
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch (e) {
      console.warn('[localStorage:remove]', key, e)
    }
  },

  /**
   * Get a JSON-parsed value. Returns `fallback` on missing, invalid JSON, or error.
   */
  getJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return fallback
      return JSON.parse(raw)
    } catch (e) {
      console.warn('[localStorage:getJson]', key, e)
      return fallback
    }
  },

  /**
   * JSON-serialize and store a value. Silently ignores quota errors.
   */
  setJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.warn('[localStorage:setJson]', key, e)
    }
  },
}
