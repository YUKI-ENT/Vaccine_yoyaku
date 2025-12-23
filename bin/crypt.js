const crypto = require('crypto');

const ENCRYPTION_KEY = "zCDSvYFh9DRNrHADTp33kQQgkups6AKE" // 32Byte. このまま利用しないこと！
const BUFFER_KEY = "R6ZZN5C64PHq8hYF" // 16Byte. このまま利用しないこと！
const ENCRYPT_METHOD = "aes-256-cbc" // 暗号化方式
const ENCODING = "hex" // 暗号化時のencoding


function getEncryptedString(raw) {
  let iv = Buffer.from(BUFFER_KEY)
  let cipher = crypto.createCipheriv(ENCRYPT_METHOD, Buffer.from(ENCRYPTION_KEY), iv)
  let encrypted = cipher.update(raw)

  encrypted = Buffer.concat([encrypted, cipher.final()])

  return encrypted.toString(ENCODING)
}

function getDecryptedString(encrypted) {
  let iv = Buffer.from(BUFFER_KEY)
  let encryptedText = Buffer.from(encrypted, ENCODING)
  let decipher = crypto.createDecipheriv(ENCRYPT_METHOD, Buffer.from(ENCRYPTION_KEY), iv)
  let decrypted = decipher.update(encryptedText)

  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString()
}


// ハッシュ化関数
function hashing(data){
    const shasum = crypto.createHash('sha1');
    shasum.update(data);
    let hash = shasum.digest('hex');
    return hash;
}

module.exports.getDecryptedString=getDecryptedString;
module.exports.getEncryptedString=getEncryptedString;
module.exports.hashing = hashing;