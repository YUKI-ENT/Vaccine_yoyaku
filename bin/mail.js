// mail.js
const nodemailer = require('nodemailer');
const sql = require('./sql.js');

// Mail.host / Mail.port / Mail.user / Mail.pass / Mail.sender / Mail.title_prefix を想定

function isLocalHost(host) {
  if (!host) return false;
  const h = String(host).trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

// transport は1個だけ作って使い回す（接続再利用できて速い）
function createTransport() {
  const port = Number(Mail.port);

  // --- ローカル配送(25) ---
  if (port === 25) {
    // 事故防止：25番を外部へ投げない（外部25は平文になりがちで危険）
    if (!isLocalHost(Mail.host)) {
      throw new Error(
        `Mail.port=25 の場合は Mail.host を localhost/127.0.0.1/::1 にしてください (current: ${Mail.host})`
      );
    }

    return nodemailer.createTransport({
      host: Mail.host,
      port: 25,
      secure: false,
      // ローカル配送なのでTLSもAUTHも不要（＝無視）
      // auth: undefined,
      // requireTLS: false,
    });
  }

  // --- リモート送信(587想定) ---
  return nodemailer.createTransport({
    host: Mail.host,
    port: port,
    secure: false,       // 587 + STARTTLS
    requireTLS: true,    // STARTTLS必須（平文禁止）
    auth: {
      user: Mail.user,
      pass: Mail.pass
    },
    // 自己署名を許可したい場合だけ使う（本番では基本OFF推奨）
    // tls: { rejectUnauthorized: false },
  });
}

let transport;
function getTransport() {
  if (!transport) transport = createTransport();
  return transport;
}

// メール送信
function sendmail(title, address, mes) {
  const message = {
    from: Mail.sender,
    to: address,
    envelope: {
      from: Mail.sender,
      to: address
    },
    subject: `${Mail.title_prefix} ${title}`,
    text: mes
  };

  try {
    const t = getTransport();
    t.sendMail(message, function (error, info) {
      if (error) {
        console.log("send error:", error);
        return;
      }

      console.log(`success send ok to ${address} (id=${info?.messageId ?? "n/a"})`);

      const q = "INSERT INTO mail SET ?";
      sql.pool.query(q, { title, content: mes, recipient: address }, (dbErr) => {
        if (dbErr) console.log("db insert error:", dbErr);
      });
    });
  } catch (e) {
    console.log("send exception:", e);
  }
}

module.exports.sendmail = sendmail;
