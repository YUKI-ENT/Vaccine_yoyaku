console.log("Loading cronmail.js.");

//require('../config.js');
let mail = require('./mail.js');
let sql = require('./sql.js');
const ejs = require('ejs');
let moment = require('moment');

const timeout = 1 * 60 * 1000; //min

AlertFlag = 0; //Global

//// 前日のお知らせメール
setInterval(async function alertmail(){
    try{
        let currenttime = moment().format('HHmm');
        if(AlertFlag === 0 && Mail.alertbefore > 0  && parseInt(currenttime) >= parseInt(Mail.crontime) && (parseInt(currenttime)-parseInt(Mail.crontime)) < 2){
            console.log("Starting mail alert.");

            //翌日の予約一覧
            let q = `SELECT ${Db.T_reserve}.* , ${Db.T_users}.email as email, ${Db.T_zones}.name as zonename FROM ${Db.T_reserve}
                    LEFT JOIN ${Db.T_users} ON ${Db.T_reserve}.UID = ${Db.T_users}.UID 
                    JOIN ${Db.T_zones}  ON ${Db.T_reserve}.PT_zone = ${Db.T_zones}.id 
                    WHERE (${Db.T_reserve}.Del = 0) AND (${Db.T_reserve}.PT_date Like ?) `;
            const d = moment().add(Mail.alertbefore,'days').format('YYYY-MM-DD');
            let [results] = await sql.pool.query(q,[d]);
            //
            sql.set_log(null, 0, "Cron-mail is invoked. Message number is " + results.length);
            
            results.forEach(function(r){
                //メール送信
                moment.locale('ja');
                if(r.email){
                    ejs.renderFile('./views/mailtemp_alert.ejs', {
                        Env: Env,
                        ptname: r.PT_name,
                        resdate: moment(r.PT_date).format('YYYY年M月D日(dddd)'),
                        zonename: r.zonename
                    },function(err,text){
                        if(err) console.log(err);
                        mail.sendmail('予防接種予約確認',r.email,text);
                        sql.set_log(null, r.SID, "Sent a complete mail to " + r.email + text);
                        console.log("Sent a complete mail to " + r.email);
                    });
                }
            });
            AlertFlag = 1;
        }

        if(parseInt(currenttime) <= 1) AlertFlag = 0;
    } catch(e){
        console.log(e);
    }
}, timeout);
