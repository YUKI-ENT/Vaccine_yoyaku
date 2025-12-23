// モジュールをロード
const nodemailer = require('nodemailer');
const maillib = require('nodemailer/lib/mailer');
const sql = require('./sql.js');
//const crypt = require('./crypt.js');

//require('../config.js');

// サーバの設定
var transport = nodemailer.createTransport({
    host: Mail.host,
    port: Mail.port,
    secure: false, // STARTTLSを使用
    tls: {
        rejectUnauthorized: false // 自己署名証明書の警告を無視
    }});

// Default settings
var message = {
    from: Mail.sender,
    to: '',
	envelope: {
       from: Mail.sender  // バウンスメールの戻り先アドレス
      // to: ''       // 実際の送信先
    },
    subject: '',
    text: ""
};

// メール送信

function sendmail(title, address, mes){
	message.subject = Mail.title_prefix + ' ' + title;
	message.text = mes;
    message.to = address;
    message.envelope.to = address;
	
	let mail;
	try{
	    mail = transport.sendMail(message, function(error, success){
	        if(error){
	            console.log(error);
	            return;
	        }
			const q = "INSERT INTO mail SET ?";
	        if(success){
	            console.log("success send ok to " + address);

				sql.pool.query(q,{title: title, content: mes, recipient: address});
	        }else{
	            console.log("success send ng to " + address);
	        }
	        //console.log(mail);
	        //console.log(message);
	        message.transport.close();
	        return;
	    });

	}catch(e){
	    console.log(e);
	}
}

module.exports.sendmail = sendmail;
