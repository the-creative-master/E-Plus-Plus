/* EShare v1: a portable authenticated E++ project and its decryption key. */
(function (global) {
  'use strict';
  var EPP = global.EPP || (global.EPP = {});
  var PREFIX = 'ESHARE1';
  var MAX_CODE_LENGTH = 12 * 1024 * 1024;
  function vault() {
    if (!EPP.Vault) throw new Error('The EShare encryption runtime is unavailable.');
    return EPP.Vault;
  }
  function validate(project) {
    if (!project || typeof project !== 'object' || typeof project.filename !== 'string' ||
        !/^[^/\\\u0000-\u001f]{1,200}\.(enpp|enppl)$/i.test(project.filename) ||
        typeof project.code !== 'string' || project.code.length > MAX_CODE_LENGTH ||
        (project.pictures !== undefined && (!project.pictures || typeof project.pictures !== 'object' || Array.isArray(project.pictures)))) {
      throw new Error('This EShare code does not contain a valid E++ project.');
    }
    return { filename: project.filename, code: project.code, pictures: project.pictures || {} };
  }
  function encode(project) {
    var v = vault();
    var payload = JSON.stringify(validate(project));
    if (payload.length > MAX_CODE_LENGTH) throw new Error('This project is too large to share.');
    var key = v.generateKey();
    return PREFIX + '.' + v.base64Encode(key) + '.' + v.saveText(payload, key).replace(/\s/g, '');
  }
  function decode(text) {
    var v = vault();
    var clean = String(text || '').replace(/\s/g, '');
    if (clean.length > 20 * 1024 * 1024) throw new Error('This EShare code is too large.');
    var parts = clean.split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX || !/^[A-Za-z0-9+/]{43}=$/.test(parts[1]) || !/^[A-Za-z0-9+/]+={0,2}$/.test(parts[2])) {
      throw new Error('That is not a valid EShare code. Copy the entire code and try again.');
    }
    try { return validate(JSON.parse(v.loadText(parts[2], parts[1], 'EShare'))); }
    catch (error) { throw new Error('This EShare code is damaged or incomplete. Copy the entire code and try again.'); }
  }
  EPP.EShare = { encode: encode, decode: decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = EPP.EShare;
})(typeof window !== 'undefined' ? window : globalThis);
