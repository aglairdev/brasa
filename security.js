'use strict';
const _STORE = {
  key: '__brs_k',   
  data: '__brs_d',   
};

// converte ArrayBuffer ou Uint8Array para string hexadecimal
function _bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
// converte string hexadecimal para Uint8Array
function _hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
// converte Uint8Array para string Base64
function _bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
// converte string Base64 para Uint8Array
function _base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
async function _loadOrCreateKey() {
  let hex = localStorage.getItem(_STORE.key);
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    // primeira vez ou chave inválida: gera chave de 256 bits
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    hex = _bufToHex(bytes);
    try {
      localStorage.setItem(_STORE.key, hex);
    } catch (err) {
      // localStorage bloqueado (modo privado restrito, storage cheio, etc)
      console.warn('[brasa:security] Não foi possível persistir a chave:', err.message);
    }
  }
  // importa o material da chave como CryptoKey para AES-GCM
  const keyMaterial = _hexToBuf(hex);
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,           // não exportável: impede extração via exportKey()
    ['encrypt', 'decrypt']
  );
}
const Security = (() => {
  // cryptoKey carregada uma única vez por sessão
  let _cryptoKey = null;
  async function init() {
    try {
      if (!window.crypto?.subtle) {
        console.error('[brasa:security] Web Crypto API não disponível neste ambiente.');
        return false;
      }
      _cryptoKey = await _loadOrCreateKey();
      return !!_cryptoKey;
    } catch (err) {
      console.error('[brasa:security] Falha na inicialização:', err.message);
      return false;
    }
  }
  async function encrypt(dataObj) {
    if (!_cryptoKey) throw new Error('[brasa:security] Segurança não inicializada. Chame await Security.init() primeiro.');
    const json = JSON.stringify(dataObj);
    const encoded = new TextEncoder().encode(json);
    // IV de 12 bytes (96 bits) — tamanho recomendado para AES-GCM
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      _cryptoKey,
      encoded
    );
    const payload = _bufToHex(iv) + ':' + _bufToBase64(cipherBuf);
    return btoa(payload);
  }
  async function decrypt(base64Str) {
    if (!_cryptoKey) return null;
    try {
      const payload = atob(base64Str);
      const sepIdx = payload.indexOf(':');
      if (sepIdx === -1) return null;
      const iv = _hexToBuf(payload.slice(0, sepIdx));
      const cipherBuf = _base64ToBuf(payload.slice(sepIdx + 1));
      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        _cryptoKey,
        cipherBuf
      );
      const json = new TextDecoder().decode(plainBuf);
      return JSON.parse(json);
    } catch {
      // falha silenciosa: cobre chave errada, dado corrompido, adulteração (GCM auth fail)
      return null;
    }
  }
  async function saveState(stateObj) {
    try {
      const ciphertext = await encrypt(stateObj);
      localStorage.setItem(_STORE.data, ciphertext);
      return true;
    } catch (err) {
      console.warn('[brasa:security] Erro ao salvar estado:', err.message);
      return false;
    }
  }
  async function loadState() {
    try {
      const raw = localStorage.getItem(_STORE.data);
      if (!raw) return null;
      return await decrypt(raw);
    } catch {
      return null;
    }
  }
  function clearAll() {
    localStorage.removeItem(_STORE.key);
    localStorage.removeItem(_STORE.data);
    _cryptoKey = null;
  }
  function sanitizeText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  function safeSetText(el, text) {
    if (el) el.textContent = String(text ?? '');
  }
  function exportPlaintext(stateObj, filename) {
    const data = {
      _brasa_export: true,
      exportedAt: new Date().toISOString(),
      ...stateObj,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'brasa-backup.json';
    a.click();
    // libera a URL temporária após 60s para evitar memory leak
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return { init, saveState, loadState, clearAll, sanitizeText, safeSetText, exportPlaintext };
})();
window.Security = Security;