console.log("Loading cronmail.js.");

let mail = require('./mail.js');
let sql = require('./sql.js');
const ejs = require('ejs');
let moment = require('moment');

const timeout = 1 * 60 * 1000; // 1min
let AlertFlag = 0; // ★ let を付けてグローバル汚染防止

setInterval(async function alertmail() {
  try {
    const alertBefore = parseInt(Mail.alertbefore, 10) || 0;
    if (alertBefore <= 0) return; // ★ 0なら通知しない

    const currenttime = moment().format('HHmm');
    const cron = parseInt(Mail.crontime, 10);

    if (
      AlertFlag === 0 &&
      parseInt(currenttime, 10) >= cron &&
      (parseInt(currenttime, 10) - cron) < 2
    ) {
      console.log("Starting mail alert.");

      // ★ 対象日（alertBefore日後）の「日付文字列」だけ作る（DATE型なのでこれで十分）
      const targetDate = moment().add(alertBefore, 'days').format('YYYY-MM-DD');

      const q = `
        SELECT r.*,
               u.email AS email,
               z.name  AS zonename,
               p.name  AS plan_name
        FROM ${Db.T_reserve} r
        LEFT JOIN ${Db.T_users} u ON r.UID = u.UID
        JOIN ${Db.T_zones}  z ON r.PT_zone = z.id
        JOIN ${Db.T_plans}  p ON r.plan = p.id
        WHERE r.Del = 0
          AND r.PT_date = ?
      `;

      const [results] = await sql.pool.query(q, [targetDate]);

      sql.set_log(null, 0, `Cron-mail is invoked. targetDate=${targetDate}, Message number is ${results.length}`);

      moment.locale('ja');

      // forEach + async混在を避けて、エラーを拾いやすくする
      for (const r of results) {
        if (!r.email) continue;

        const subject = r.plan_name ? `予防接種予約確認（${r.plan_name}）` : '予防接種予約確認';

        const reslists = await sql.getReservesFromFid(r.FID); // すべての予約

        ejs.renderFile('./views/mailtemp_alert.ejs', {
          Env: Env,
          Mail: Mail,
          ptname: r.PT_name,
          planname: r.plan_name, // 追加したいならテンプレ側で表示
          resdate: moment(r.PT_date).format('YYYY年M月D日(dddd)'),
          zonename: r.zonename,
          reslists: reslists, 
        }, function (err, text) {
          if (err) {
            console.log(err);
            return;
          }
          mail.sendmail(subject, r.email, text);

        //   console.log('debug:', { rid: r.ID, uid: r.UID, fid: r.FID, PT_ID: r.PT_ID, email: r.email, pt: r.PT_name, date: r.PT_date });
          const sidForLog = (r.PT_ID != null) ? r.PT_ID : 0;
          sql.set_log(null, r.PT_ID, "Sent a complete mail to " + r.email);
          console.log("Sent a complete mail to " + r.email);
        });
      }

      AlertFlag = 1;
    }

    // 日付またぎでフラグを戻す（00:00〜00:01あたり）
    if (parseInt(currenttime, 10) <= 1) AlertFlag = 0;

  } catch (e) {
    console.log(e);
  }
}, timeout);
