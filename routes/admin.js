var express = require('express');
var router = express.Router();

var session = require('express-session'); 
const {check, validationResult} = require('express-validator');
// 外部ファイル化したバリデーション読み込み
const Validator = require('../bin/validator.js');

const moment = require('moment');

var sql=require('../bin/sql.js');
const { calendarFormat } = require('moment');
const { render } = require('ejs');

let resolve = require('../bin/resolve.js');
require('../bin/cronmail.js');

const { callbackify } = require('util');
const { parse } = require('path');

process.on('uncaughtException', function(err) {
    console.log('uncaughtException in admin.js!');
    console.log(err);
});

// グローバル変数 plans 
let errors = [];
let plans = [];
  
/* GET admin listing. */
router.get('/', adminMiddleware, async function(req, res, next){
    try{
        let mode = (req.query.mode) ? req.query.mode : 'cal';
        //Globals
        errors = [];
        if(!plans.length) plans = await sql.getAllPlans();
        
        switch(mode){
            case 'cal':
                admin_cal(req,res,0);
                break;
            case 'sheet':
                admin_sheet(req,res);
                break;
            case 'new':
                admin_new(req,res);
                break;
            case 'newconf':
                admin_new_conf(req,res);
                break;
            case 'newcomplete':
                admin_new_complete(req,res);
                break;
            case 'pt':
                admin_pt(req,res);
                break;
            case 'changeconf':
                admin_change(req,res);
                break;
            case 'changecomplete':
                admin_change_complete(req,res);
                break;
            case 'plan':
                admin_plan(req,res);
                break;
            case 'planchange':
                admin_planedit(req,res);
                break;
            case 'waku':
                admin_waku(req,res);
                break;
            case 'user':
                admin_user(req,res);
                break;
            case 'userchange':
                admin_userchange(req,res);
                break;
            case 'usercomplete':
                admin_userchangecomplete(req,res);
                break;
            case 'zanryo':
                admin_vial(req,res);
                break;
            case 'log':
                admin_log(req,res);
                break;
            case 'settings':
                admin_settings(req,res);
                break;
            case 'mail':
                admin_mail(req,res);
                break;
            case 'mailsend':
                admin_mail_send(req,res);
                break;
            case 'maillist':
                admin_mail_list(req,res);
                break;
            default:
                admin_cal(req,res,0);
        }
    } catch(e){
        errors.push(e);
        error_render(req,res,'admin / get');
        return;
    } 
});

router.get('/login', function(req, res, next) {
    res.render('admin_login', { 
        Env: Env,
        errors: errors
     });
     
});
  
router.post('/login', adminAuthenticate);
////////////////////

function adminMiddleware(req,res,next){ 
    console.log('Admin middleware is called.');
    let hosts = resolve.arrhome();
    console.log("Reliable host list is :" );
    console.log(hosts);
    console.log("Your IP :" + req.ip);

    if (req.session.username || hosts.some((ip) => req.ip.indexOf(ip) >= 0)) {  // 認証済
   //     sql.set_log(req,0,"Admin login success");
      console.log("Authenticated to admin pages");
      return next();
    }
    else {  // 認証されていない
      console.log("Admin no session data");
      errors.push('セッション期限が切れました。再度ログインしてください。');
      res.redirect(Env.admin + '/login');  // ログイン画面に遷移
    }
}

function adminAuthenticate(req,res,next){
    const username = req.body.username;
    const password = req.body.password;
    console.log('Admin access from IP:' + req.ip);
    if (username === Admin.username && password === Admin.password) {
        console.log('Admin auth success');
        sql.set_log(req,0,"Admin authenticated by ID & password.");
        req.session.regenerate((err) => {
            req.session.username = Admin.username;
            res.redirect(Env.admin);
        });
    } else {
        console.log('Admin auth fail');
        sql.set_log(req,0,"Admin authenticate failure. ID:" + username + ", password: " + password);
        res.redirect(Env.admin + '/login');
    }
}

async function admin_cal(req, res, daymode=0, year = 0, month = 0, contentday = 1, ptdata = {}) //カレンダーのみモード：0、日予定：１, 予約変更：２
{
    let planindex =0;
    let strdate = '';
    let years = [], months = [];
    let calendars  = [], reslists = [], resid = [];
        
    try{
        //plan取得
        const lastplan = (plans.length) ? parseInt(plans[0].id) : 0;
        const planid = (req.query.id) ? parseInt(req.query.id) : lastplan;

        //planindex取得
        for (let i = 0; i < plans.length; ++i) {
            if(plans[i].id == planid) {
                planindex = i;
                break;  
            } 
        }
        //zone
        const zones = await sql.getZones(planid);

        if(daymode === 0 && req.query.day) daymode = 1;
        
        //表示年月日取得 year month指定がなければ、予約開始年月に
        let day = 1;
        var startdate = moment(plans[planindex].start).format('YYYY-MM-DD');
        if(req.query.year || req.query.month){
            year = (req.query.year) ? Number(req.query.year) : moment(startdate).year();
            month = (req.query.month) ? Number(req.query.month) : moment(startdate).month() + 1;
            contentday = (req.query.day) ? Number(req.query.day) : 1;
        } else{
            if(moment().isAfter(moment(startdate))){
                year = moment().year();
                month = moment().month() + 1;
                contentday = (req.query.day) ? Number(req.query.day) : 1;
            } else {
                year = moment(startdate).year();
                month = moment(startdate).month() + 1;
                contentday = (req.query.day) ? Number(req.query.day) : 1;
            }
        }
               
        for (var i = moment(startdate).year() ; i <=  moment(startdate).year() +1; i++) {
            years.push({
                id:  i,
                flag: (year == i) ? true : false
            });
        }
        for (var i = 1; i <= 12; i++) {
            months.push({
                id: i,
                flag: (month == i) ? true : false
            });
        }
        
        //予約済人数取得
        let ReservedNum = await sql.getReservedNumber(planid, year, month); 
        
        //枠取得
        //let waku = await sql.getWaku(planid,year,month,1);

        //ワクチン残量取得、バイアル総数：バイアル総数が既定値に達するようなら、端数モードに
        let vialml = await sql.getReservedVialMl(planid, plans[planindex]); // vialモード:{'YYYY-MM-DD':{ml:, vial:},,total_vial:,full:}, syringeモード{total_vial:,full:
        //祝日取得
        let holidays = require('../holidays.json');

        //カレンダ作成
        let key   = moment([year,month-1,1]).day();
        let last  = moment([year,month-1,1]).endOf('month').date();
        let type  = '';
        let count = 0, zanryou = 0, past =0;

        for (let i = 0; i < 42; i++) {
            if (i === key) {
                type = 'day';
            } else if (day > last) {
                type = '';
            }
            if (i === 35 && type == '') { //6行目にいかない
                break;
            }
            if (type != '' && i % 7 == 1) {
                count++;
            }
            if (type != '' && i % 7 == 0) {
                type = 'sunday';
            } else if (type != '' && i % 7 == 6) {
                type = 'satday';
            } else if (type != '') {
                type = 'day';
            }

            if (type != '' && String(year) in holidays && holidays[String(year)].indexOf(('00' + month).slice(-2) + ('00' + day).slice(-2)) >= 0){
                    type = 'sunday';
            }

            if(type != ''){
                strdate = moment([year,month-1,day]).format('YYYY-MM-DD');
                if(vialml[strdate] == undefined){ 
                    zanryou = 0;
                } else {
                    zanryou = vialml[strdate].vial * plans[planindex].mlpervial - vialml[strdate].ml;
                }
                //過去はpast =1 
                past = (moment(strdate) < (moment().startOf('days'))) ? 1 : 0;
                
                rns = [];
                if(ReservedNum[day]) rns = ReservedNum[day];
                
            }else{
                var rns = [];
                zanryou = 0;
                past = 0;
            }
            
            calendars.push({
                day: day,
                type: type,
                rns: rns,
                zan: zanryou,
                past: past
            });
            if (type) day++;
        } // for

        //データ表示
        let template;
        switch(daymode){
            case 0:
                template = 'admin_cal_new';
                break;
            case 1:
                template = 'admin_cal_new';
                q = 'SELECT * FROM ' + Db.T_reserve +  ' WHERE ((Del = 0) AND (plan = ?) AND ( PT_date LIKE ?)) ';
                strdate = moment([year,month-1,contentday]).format('YYYY-MM-DD');

                let [dayrows, dayfields] = await sql.pool.query(q,[planid, strdate]);
                reslists = dayrows;
                break;
            case 2:
                template = 'admin_pt';
                let resid = req.query.resid;
                break;
        }

        res.render(template, { 
            Env: Env,
            daymode: daymode,
            errors: errors,
            plan: plans[planindex],
            plans: plans,
            zones: zones,
            form:{id: planid,year: year, month:month, day:contentday},
            years: years,
            months: months,
            calendars: calendars,
            reslists: reslists,
            tvial: vialml.total_vial,
            resid: resid,
            ptdata: ptdata
        });
    } catch(e){
        console.log('Error in admin_cal:' + e);
        error_render(req, res, 'admin_cal');
    }
}

async function admin_plan(req,res){
    try{
        //plan取得
        const lastplan = (plans.length) ? parseInt(plans[0].id) : 0;
        const planid = (req.query.id) ? parseInt(req.query.id) : lastplan;
        
        for(let i in plans){
            plans[i].y_start = moment(plans[i].y_start).format('YYYY-MM-DDTHH:mm'); //html5 datetime-local対策
            plans[i].y_end = moment(plans[i].y_end).format('YYYY-MM-DDTHH:mm');
            plans[i].start = moment(plans[i].start).format('YYYY-MM-DD');
            plans[i].end = moment(plans[i].end).format('YYYY-MM-DD');
        };

        res.render('admin_plans', { 
            Env: Env,
            errors: errors,
            form:{id: planid},
            plan: planid,
            plans: plans       
        });
    } catch(e){
        console.log('Error in admin_plan:' + e);
        error_render(req, res, 'admin_cal');
    }
}

async function admin_planedit(req,res){
    try{
        const edit = (req.query.edit) ? 1 : 0;
        let planid = parseInt(req.query.id);

        if (edit) { //更新モード
            const q = 'UPDATE ' + Db.T_plans +  ' SET ?  WHERE id = ?';
            
            let d ={
                stat    : Number(req.query.stat),
                break   : Number(req.query.break),
                y_start : moment(req.query.y_start).format('YYYY-MM-DD HH:mm'),
                y_end   : moment(req.query.y_end).format('YYYY-MM-DD HH:mm'),
                start   : moment(req.query.start).format('YYYY-MM-DD'),
                end     : moment(req.query.end).format('YYYY-MM-DD'),
                name    : req.query.name,
                price1  : Number(req.query.price1),
                price2  : Number(req.query.price2),
                apply   : Number(req.query.apply),
                cancel  : Number(req.query.cancel),
                text    : req.query.text.trim(),
                detail  : req.query.detail,
                sort    : Number(req.query.sort),
                year    : moment(req.query.start).year(),
                start_m : moment(req.query.start).month() + 1,
                end_m   : moment(req.query.end).month() + 1,
                syringe : Number(req.query.syringe),
                vial    : Number(req.query.vial),
                full    : Number(req.query.full),
                mlpervial : parseFloat(req.query.mlpervial),
                std_dose : parseFloat(req.query.std_dose),
                halfdoseage : parseInt(req.query.halfdoseage),
                intweek : parseInt(req.query.intweek)
            };
            let [result] = await sql.pool.query(q,[d,planid]);
            if(result.affectedRows){
                errors.push('ID「' + planid  + '」の編集しました。');
            } else {
                errors.push('PlanデータのUPDATEに失敗しました');
            }

        } else {  //Add New plan
            //新規ID取得
		    let q = 'SELECT MAX(id) as maxid  FROM ' + Db.T_plans;

            let [data] = await sql.pool.query(q);
            let newplanid = parseInt(data[0].maxid) + 1;

            q = 'INSERT INTO ' + Db.T_plans +  ' SET ? ';
            let d ={
                id      : newplanid,
                stat    : 0,
                break   : Number(req.query.break),
                y_start : moment(req.query.y_start).format('YYYY-MM-DD HH:mm'),
                y_end   : moment(req.query.y_end).format('YYYY-MM-DD HH:mm'),
                start   : moment(req.query.start).format('YYYY-MM-DD'),
                end     : moment(req.query.end).format('YYYY-MM-DD'),
                name    : req.query.name,
                price1  : Number(req.query.price1),
                price2  : Number(req.query.price2),
                apply   : Number(req.query.apply),
                cancel  : Number(req.query.cancel),
                text    : req.query.text.trim(),
                detail  : req.query.detail,
                sort    : Number(req.query.sort),
                year    : moment(req.query.start).year(),
                start_m : moment(req.query.start).month() + 1,
                end_m   : moment(req.query.end).month() + 1,
                syringe : Number(req.query.syringe),
                vial    : Number(req.query.vial),
                full    : 0,
                mlpervial : parseFloat(req.query.mlpervial),
                std_dose : parseFloat(req.query.std_dose),
                halfdoseage : parseInt(req.query.halfdoseage),
                intweek : parseInt(req.query.intweek)
            };
            let [result] = await sql.pool.query(q,[d]);
            if(result.affectedRows){
                errors.push('ID「' + newplanid  + '」を追加しました。');
            } else {
                errors.push('PlanデータのINSERTに失敗しました');
            }
        }
        plans = [];
        plans = await sql.getAllPlans();
        //表示
        admin_plan(req,res);

    } catch(e){
        console.log('Error in admin_planedit:' + e);
        error_render(req, res, 'admin_planedit');
    }	
}

async function admin_sheet(req,res){
    try{
        //plan取得
        const lastplan = (plans.length) ? parseInt(plans[0].id) : 0;
        const planid = (req.query.id) ? parseInt(req.query.id) : lastplan;
        
        // param
        const sort = (req.query.sort) ? ' ORDER BY ' + req.query.sort : ' ORDER BY `ID` Desc';
        const viewmode = (req.query.view) ? parseInt(req.query.view) : 0; // 0:全表示、1：削除してないもののみ
        let sumi = 0,past = 0;
        let total = 0;
        let reslists = [];

        const q = `SELECT ${Db.T_reserve}.*, ${Db.T_zones}.name as zonename FROM  ${Db.T_reserve} LEFT JOIN ${Db.T_zones} ON PT_zone = ${Db.T_zones}.id  WHERE ((${Db.T_reserve}.plan = ?) AND (Del = 0)) ${sort}`;
        const [rows,fields] = await sql.pool.query(q,[planid]);

        let data = {};
        rows.forEach(function(r){
            past = (moment(r.PT_date).isBefore(moment()))? 1 : 0;//接種日がすぎている
            sumi += past;
            data = r;
            data.past = past;

            reslists.push(data);
        });
        total = rows.length;

        res.render('admin_sheet', { 
            Env: Env,
            errors: errors,
            res: reslists,
            plan: planid,
            form:{id: planid},
            sumi: sumi,
            total: total,
            plans: plans        
        });
    }catch(e){
        console.log('Error in admin_sheet:' + e);
        error_render(req, res, 'admin_sheet');
    }	
}

async function admin_waku(req,res,change = 0){
    try{
        //plan取得
        const lastplan = (plans.length) ? parseInt(plans[0].id) : 0;
        const planid = (req.query.id) ? parseInt(req.query.id) : lastplan;
        const activeplan = plans.find((p) => parseInt(p.id) === planid);

        if(change === 1) req.query.work = "change";

        //work分岐
        if(req.query.work){
            switch(req.query.work){
                case "zoneadd":
                    if(!req.query.zonename) { 
                        errors.push('時間帯名が空白です');
                    } else { 
                        let q = 'INSERT INTO ' + Db.T_zones + ' set ? ';
                        let d = {name: req.query.zonename, plan: planid};
                        let [result] = await sql.pool.query(q,[d]);    
                    }
                    break;
                case "delwaku":
                    let q = 'DELETE FROM ' + Db.T_waku + ' WHERE plan = ?';
                    let [result] = await sql.pool.query(q,[planid]);
                    errors.push('枠を一括削除しました');
                    break;
                case "delday":
                    const qdel = 'DELETE FROM ' + Db.T_waku + ' WHERE ID = ?';
                    const ddel = parseInt(req.query.wakuid);
                    const [resultdel] = await sql.pool.query(qdel,[ddel]);
                    errors.push('枠を削除しました');
                    break;
                case "zoneedit":
                    if(req.query.zonedel){
                        let q = 'DELETE FROM ' + Db.T_zones + ' WHERE id = ?';
                        const [result] = await sql.pool.query(q, [req.query.zoneid]);
                        errors.push('時間帯を削除しました');
                    } else if(!req.query.zonename){
                        errors.push('時間帯名が空白です');
                    }else{
                        let q = 'UPDATE ' + Db.T_zones + ' SET ? WHERE id = ?';
                        let d = {name: req.query.zonename};
                        const [result] = await sql.pool.query(q, [d,req.query.zoneid]);
                        errors.push('時間帯名を変更しました');
                    }
                    break;
                case "change": //枠更新
                    let weekdays = (req.query.wds) ? req.query.wds : null;
                    let datestart = moment(req.query.datestart);
                    let dateend = moment(req.query.dateend);
                    let num = req.query.num;  //2次元配列
                    let zoneids = req.query.zoneids;
                    
                    //追加
                    dateloop = datestart;
                    const holidays=require('../holidays.json');

                    while (dateloop.unix() <= dateend.unix()){
                        let wd = dateloop.day();
                        let dayindex = weekdays.findIndex((d) => parseInt(d) === wd);
                        // 祝日チェック
                        if(holidays[dateloop.year()].indexOf(dateloop.format('MMDD')) < 0){
                            if(dayindex >= 0){ //曜日該当
                                let q = 'DELETE FROM '+ Db.T_waku + ' WHERE (`plan` = ?) AND (`Sch_date` = ?) ';
                                let [result] = await sql.pool.query(q,[planid, dateloop.format('YYYY-MM-DD')]);
                                for(const[index,zoneid] of zoneids.entries()){
                                    console.log(num);
                                    if(Array.isArray(num)){
                                        console.log("num is array" );
                                    }else{
                                        console.log("num is object");
                                    }
                                    let n = (Array.isArray(num)) ? parseInt(num[index][dayindex]) : parseInt(num[zoneid][dayindex]);
                                    console.log("n= " + n);
                                    if(n > 0){
                                        q = 'INSERT INTO ' + Db.T_waku + ' SET ?';
                                        let d = {
                                            Sch_date    :dateloop.format('YYYY-MM-DD'),
                                            Sch_Num     :n,
                                            plan        :planid,
                                            zone        :parseInt(zoneid)
                                        } ;
                                        console.log("Adding waku");
                                        result = await sql.pool.query(q,[d]);
                                    }
                                }
                            }
                        }   
                        dateloop.add(1, 'days');
                    } //loop
                    console.log("End change");
                    break; //change
            } //switch work
        } //work

        //枠情報取得
      	let q = 'SELECT ' + Db.T_waku + '.*, ' + Db.T_zones + '.name as zonename FROM ' + Db.T_waku + ' LEFT JOIN ' + Db.T_zones + ' ON ' + Db.T_waku + '.zone = ' + Db.T_zones + '.id  WHERE (' + Db.T_waku + '.plan = ?) ORDER BY ' + Db.T_waku + '.Sch_date, ' + Db.T_waku + '.zone';
        let [rows,fields] = await sql.pool.query(q,[planid]);
        const waku = rows;
        let zones = await sql.getZones(planid);
        
        res.render('admin_waku', { 
            Env: Env,
            errors: errors,
            waku: waku,
            plan: planid,
            form:{id: planid},
            activeplan: activeplan,
            plans: plans  ,
            zones: zones      
        });
    } catch(e) {
        console.log('Error in admin_waku:' + e);
        error_render(req, res, 'admin_waku');
    }	
}

function admin_new(req, res){
    try{
        const rdata  = {
            num     : (req.query.num) ? parseInt(req.query.num) : 1,
            year    :parseInt(req.query.year),
            month   : parseInt(req.query.month),
            day     : parseInt(req.query.day),
            zoneid  : parseInt(req.query.zoneid),
            zonename: req.query.zonename,
            plan    : parseInt(req.query.plan),
        };
        
        res.render('admin_new', { 
            Env: Env,
            errors: errors,
            res: rdata,
            plan: rdata.plan,
            form:req.query,
            plans: plans
        });
    } catch(e) {
        console.log('Error in admin_new:' + e);
        error_render(req, res, 'admin_new');
    }	
}

async function admin_new_conf(req,res){
    try{
        let family = (req.query.family)? req.query.family : 0;
        let sids = req.query.Karte;
        let dname1 = req.query.dname1;
        let dname2 = req.query.dname2;
        let births = req.query.birth;
        let ptinfos = [], pts=[];
        let ptuid, fid=0;
        let planid = parseInt(req.query.plan);
        let resdate = moment([parseInt(req.query.year),parseInt(req.query.month) -1 , parseInt(req.query.day)]);

        let q;

        if(!req.query.num){
            errors.push('予約人数が設定されていません');
            error_render(req, res,'admin_new_conf');
            return;
        }

        const num = parseInt(req.query.num);

        const resdata = {
            year    : req.query.year,
            month   : req.query.month,
            day     : req.query.day,
            zoneid  : req.query.zoneid,
            zonename: req.query.zonename,
            plan    : planid
        };

        for(let i=0;i<num;i++){
            if(req.query.Karte[i]){ //診察券持ち
                sids[i]  = parseInt(req.query.Karte[i]);
                ptinfos[i] = await sql.sid2ptinfo(sids[i]); //pt_masterから
                if(!ptinfos[i]) {
                    errors.push(String(i) + '番目の診察券番号が正しくありません');
                    error_render(req, res,'admin_new_conf');
                    return;
                }
                let names = ptinfos[i].furigana.split('　');
                if(dname1[i].length === 0) dname1[i] = names[0];
                if(dname2[i].length === 0){
                    dname2[i] = '';
                    for(let j=1;j<names.length;j++){
                        dname2[i] += names[j]; 
                    }
                }
                if(births[i].length < 10)   births[i] = ptinfos[i].PT_birth;
            } else { //SIDなし=0
                sids[i] = 0;
                if(!req.query.dname1[i] || !req.query.dname2[i]) {
                    errors.push('名前が入力されていません');
                    error_render(req, res, 'admin_new_conf');
                    return;
                } else if(!req.query.birth[i]){
                    errors.push('誕生日が入力されていません');
                    error_render(req, res, 'admin_new_conf');
                    return;
                }
            }

            //UID既登録か確認 (UID,FID,SID取得)
            if(sids[i] > 0){
               // 診察券持ち
               let userdata = await sql.set_ptusers(sids[i],fid);
               ptuid = userdata.UID;
               if(family > 0) fid = userdata.FID;
            }else{ //初診 患者名・タンジョウビで既登録か検索 // 極めてレアにしかヒットしない！
                q = 'SELECT *  FROM ' + Db.T_users +  ' WHERE (del = 0) AND  (name1 like ?) AND (name2 like ?) AND (birth = ?)'
                let [udata] = await sql.pool.query(q,[dname1[i],dname2[i],births[i]]);
                if(udata.length > 0){
                    ptuid = parseInt(udata[0].UID);
                    if(family > 0) fid = udata[0].FID;
                    sids[i] = udata[0].SID;
                }else{//USERSテーブルになく、診察券もなし //ほとんどこちら //たくさんの家族会員が重複する可能性があるのでfamily=0が望ましい
                    let userdata = await sql.set_ptusers(0,fid,dname1[i],dname2[i],births[i]);
                    ptuid = userdata.UID;
                    if(family > 0) fid = userdata.FID;
                    sids[i] = userdata.SID;
                }
            }

            //3回以上のチェック
            let more2 = await sql.getReserveCount(ptuid, planid);
            if(more2 >= 2) errors.push(dname1[i] + dname2[i] + '様、既に2回以上の予約が入っていますが、続行しますか?');
            
            //接種間隔のチェック
            let otherreserve = await sql.getRecentReserve(ptuid,resdate.format('YYYY-MM-DD'),planid);
            if(otherreserve.length > 0){
                otherreserve.forEach(function(reserve){
                    errors.push(dname1[i] + dname2[i] + '様、' + reserve.PT_date + 'との接種間隔が規定週間以内となりますが続行しますか?');
                });
            }

            pts.push({
                sid     : sids[i],
                ptuid   : ptuid,
                dname1  : dname1[i],
                dname2  : dname2[i],
                birth   : births[i],
            });
        } //For
        
        res.render('admin_new_conf', { 
            Env: Env,
            errors: errors,
            pts: pts,
            res: resdata,
            form: req.query,
            plan: planid,
            num: num,
            family: family
        });
    } catch(e) {
        console.log('Error in admin_new_conf:' + e);
        error_render(req, res, 'admin_new_conf');
    }
}

async function admin_new_complete(req,res){
    try{
        const year = parseInt(req.query.year);
        const month= parseInt(req.query.month);
        const day  = parseInt(req.query.day);
        const zoneid = parseInt(req.query.zoneid);
        const planid   = parseInt(req.query.plan);
        
        const ptuids   = req.query.ptuids; //array
       
        const num = ptuids.length;
        const resdate = moment([year,month-1,day]);
        let ptinfo = {}, age =0, volume = 0, d = [], nowait =[];

        const plandata = await sql.getPlan(planid);
        
        //予約データ準備
        for(let i=0;i<num;i++){ 
            ptinfo = await sql.uid2ptinfo(ptuids[i]);
        
            //接種時年齢計算、接種量決定
            age = sql.calcAge(moment(ptinfo.birth), resdate);
            volume = (age >= parseInt(plandata.halfdoseage)) ? parseFloat(plandata.std_dose) : parseFloat(plandata.std_dose) * 0.5;

            d.push([ptuids[i],ptinfo.FID,planid,resdate.format('YYYY-MM-DD'),zoneid,ptinfo.name1 + ptinfo.name2,ptinfo.SID,age,ptinfo.birth,volume,moment().format('YYYY-MM-DD HH:mm:ss.SS')]);
        }
        //予約実行
        let q = 'INSERT INTO ' + Db.T_reserve + ' (UID,FID,plan,PT_date,PT_zone,PT_name,PT_ID,PT_age,PT_birth,Vac_volume,Y_date) VALUES ? ';

        let [reserveresult] = await sql.pool.query(q,[d]);

        //接種回数設定
        for(let i=0;i<num;i++){
            nowait[i] = sql.set_vac_name(ptuids[i], planid);
        }
        
        res.render('admin_new_complete', { 
            Env: Env,
            errors: errors,
            form: req.query,
            plan: planid,
            num: num
        });
        
        let wait = [];
        for(let i=0;i<nowait.length;i++){
            wait[i] = await nowait[i];
        }
        return;
    } catch(e) {
        console.log('Error in admin_new_complete:' + e);
        error_render(req, res, 'admin_new_complete');
    }
}

async function admin_pt(req,res){
    try{
        let cal = 0, resid = 0, resdata = {}, other_res = {}, ptdata = {}, year, month, day;

        if(req.query.resid){
            resid = parseInt(req.query.resid);
            cal   = (req.query.cal) ? req.query.cal : 0;
        }else {
            errors.push('不正なアクセスです。トップページからアクセスし治して下さい。');
            error_render(req,res,'admin_pt');
            return;
        }

        resdata = await sql.getReserveInfo(resid);
        if(!resdata){
            errors.push('予約データが見つかりません。');
            error_render(req,res,'admin_pt');
            return;
        }

        other_res = await sql.getAllOtherReserve(resid, resdata.UID, resdata.plan);

        moment.locale("ja");
        const rdate = moment(resdata.PT_date);
        resdata.year = rdate.year();
        resdata.month = rdate.month() + 1;
        resdata.day = rdate.date();
        resdata.youbi = rdate.format('dddd');

        //表示月変更時
        if(!req.query.monthchange && req.query.monthchange == '1'){
            year = parseInt(req.query.year);
            month = parseInt(req.query.month);
            day = 1;
        } else {
            year = rdate.year;
            month = rdate.month;
            day = rdate.day;
        }

        ptdata = {
            resdata: resdata,
            other_res: other_res,
            cal: cal,
        };

        admin_cal(req, res, 2, year, month, day, ptdata);
    } catch(e) {
        console.log('Error in admin_pt:' + e);
        errors.push('Error in admin_pt:' + e);
        error_render(req, res, 'admin_pt');
        return;
    }
}

async function admin_change(req,res){
    try{
        let year = (req.query.year) ? parseInt(req.query.year) : null;
        let month = (req.query.month) ? parseInt(req.query.month) : null;
        let day = (req.query.day) ? parseInt(req.query.day) : null;
        let zoneid = (req.query.zoneid) ? parseInt(req.query.zoneid) : null;
        let del = (req.query.del) ? parseInt(req.query.del) : 0;
        let resid = parseInt(req.query.resid);
        const planid = parseInt(req.query.id);

        if(!resid ||!planid) {
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_change');
            return;
        }

        const zones = await sql.getZones(planid);

        moment.locale("ja");
        const newdate = moment([year,month-1,day]);
        const newres = {
            year    :year,
            month   :month,
            day     :day,
            zoneid  :zoneid,
            zonename:zones.find((u)=> u.id === zoneid).name,
            del     :del,
            youbi   :newdate.format('dddd')
        };
        
        const resdata = await sql.getReserveInfo(resid);
        const ptuid = resdata.UID;
        
        const rdate = moment(resdata.PT_date);

        resdata.year = rdate.year();
        resdata.month = rdate.month()+1;
        resdata.day = rdate.date();
        resdata.youbi = rdate.format('dddd');

        //3回以上のチェック
        const more2 = await sql.getReserveCount(ptuid, planid);
        if(more2 > 2) errors.push(resdata.PT_name + '様、既に' + more2 + '回の予約が入っていますが、続行しますか?');
        
        //接種間隔のチェック
        const otherreserve = await sql.getRecentReserve(ptuid,newdate.format('YYYY-MM-DD'),planid,resid);
        if(otherreserve.length > 0){
            otherreserve.forEach(function(reserve){
                errors.push(resdata.PT_name + '様、' + reserve.PT_date + 'との接種間隔が規定週間以内となりますが続行しますか?');
            });
        }

        res.render('admin_change_conf', { 
            Env: Env,
            errors: errors,
            form: req.query,
            plan: planid,
            res: resdata,
            newres: newres
        });
    } catch(e) {
        console.log('Error in admin_change:' + e);
        errors.push('Error in admin_change:' + e);
        error_render(req, res, 'admin_change');
        return;
    }
}
    
async function admin_change_complete(req,res){
    try{
        const resid = req.query.resid;
        const del = (req.query.del) ? parseInt(req.query.del) : 0;
        const planid = (req.query.id) ? parseInt(req.query.id) : 0;
        const year = (req.query.year) ? parseInt(req.query.year) : null;
        const month = (req.query.month) ? parseInt(req.query.month) : null;
        const day = (req.query.day) ? parseInt(req.query.day) : null;
        const zoneid = (req.query.zoneid) ? parseInt(req.query.zoneid) : null;
        let mes = '';
        
        if(!resid ||!planid) {
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_change_complete');
            return;
        }

        let changepromise, logpromise;

        const resdata = await sql.getReserveInfo(resid);

        if(del === 1){
            //削除実行
            let q = 'UPDATE ' + Db.T_reserve +  ' SET Del = 1  WHERE ID = ?';
            changepromise = sql.pool.query(q,[resid]); 
        
            //ログ
            logpromise = sql.set_log(req, resdata.PT_ID, 'Admin予約削除:' + resdata.PT_name);
            mes    = resdata.PT_name + '様の予約を削除しました。';
        } else {
            //変更
            const rdate    = moment([year,month-1,day]);
            const memo = resdata.PT_date +  'から変更';
            const plandata = await sql.getPlan(planid);
                
            //年齢、接種量再計算
            const age = sql.calcAge(moment(resdata.PT_birth), rdate);
            const vol = (age < plandata.halfdoseage) ? parseFloat(plandata.std_dose) *0.5 : parseFloat(plandata.std_dose);
                
                //変更実行
            const q = 'UPDATE ' + Db.T_reserve +  ' SET PT_date = ?, PT_zone = ?, PT_age = ?, Vac_volume = ?, PT_memo = concat(PT_memo, ?)  WHERE ID = ?';
            const d = [rdate.format('YYYY-MM-DD'),zoneid,age,vol,memo, resid];
            changepromise = sql.pool.query(q,d);
            //ログ
            logpromise = sql.set_log(req, resdata.PT_ID, 'Admin予約変更:' + resdata.PT_name);
            mes    = resdata.PT_name + '様の予約を、' +  rdate.format('YYYY-MM-DD') + req.query.zonename + ' に変更しました。';
        }
        

        res.render('admin_change_complete', { 
            Env: Env,
            errors: errors,
            form: req.query,
            plan: planid,
            mes: mes
        });

        const changeresult = await changepromise;
        const logresult = await logpromise;
        //Vac_name(接種回数の名称変更)
        const renamepromise = await sql.set_vac_name(resdata.UID,planid);
        return;
    } catch(e) {
        console.log('Error in admin_change_complete:' + e);
        errors.push('Error in admin_change_complete:' + e);
        error_render(req, res, 'admin_change_complete');
        return;
    }
}

async function admin_user(req,res){
    try{
        const planid = (req.query.id) ? parseInt(req.query.id) : 0;
        if(!planid){
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_user');
            return;
        }
        const sort = (req.query.sort) ? ' ORDER BY ' + req.query.sort : ' ORDER BY UID ' ;

        //filter
        let filter = "";
        if(req.query.fuid) filter = " UID like " + req.query.fuid;
        if(req.query.fsid) filter = " SID like " + req.query.fsid;
        if(req.query.ffid) filter = " FID like " + req.query.ffid;
        if(req.query.fbirth) filter = ' birth like "' + req.query.fbirth + '"';
        if(req.query.fname1) filter = ' name1 like "' + req.query.fname1 + '"';
        if(req.query.fname2) filter = ' name2 like "' + req.query.fname2 + '"';
        if(filter) {
            filter = ' WHERE `Del` = 0 AND ' + filter;
        }else{
            filter = ' WHERE `Del` = 0' ;
        }

        const q = 'SELECT *  FROM  ' + Db.T_users +  filter + sort;
        const [data,fields] = await sql.pool.query(q);

        res.render('admin_user', { 
            Env: Env,
            errors: errors,
            form: req.query,
            plan: planid,
            users: data
        });
    } catch(e) {
        console.log('Error in admin_user:' + e);
        errors.push('Error in admin_user:' + e);
        error_render(req, res, 'admin_user');
        return;
    }
}
 
async function admin_userchange(req,res){
    try{
        if(!req.query.id){ 
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_userchange');
            return;
        }
        const planid = parseInt(req.query.id);

        let ptuid;
        if(!req.query.uid){
            if(!req.query.sid){
                errors.push('UIDもSIDも指定されていません');
                error_render(req,res,'admin_userchange');
                return;
            }else{
                ptuid = await sql.sid2uid(parseInt(req.query.sid));
                if(ptuid < 0){//pt_usersにない
                    errors.push('PT_USERSにIDが見つかりません');
                    error_render(req,res,'admin_userchange');
                    return;
                }
            }
        }else{
            ptuid = parseInt(req.query.uid);
        }

        const resdata = await sql.getReservesFromUid(ptuid,planid);
        const ptinfo = await sql.uid2ptinfo(ptuid);

        //FID -> families
        const families = await sql.getFamilies(parseInt(ptinfo.FID));

        res.render('admin_userchange', { 
            Env: Env,
            errors: errors,
            form: req.query,
            plan: planid,
            user: ptinfo,
            ress: resdata,
            nores: resdata.length,
            families: families
        });
    } catch(e) {
        console.log('Error in admin_userchange:' + e);
        errors.push('Error in admin_userchange:' + e);
        error_render(req, res, 'admin_userchange');
        return;
    }
}

async function admin_userchangecomplete(req,res){
    try{
        const planid = (req.query.id) ? parseInt(req.query.id) : 0;
        const ptuid = (req.query.uid) ? parseInt(req.query.uid) : 0;
        const sid = (req.query.sid) ? parseInt(req.query.sid) : 0;
        const fid = (req.query.fid) ? parseInt(req.query.fid) : 0;
        const birth = (req.query.birth) ? req.query.birth : null;
        const main = (req.query.main) ? parseInt(req.query.main) : 0;
        const name1 = (req.query.name1) ? req.query.name1 : null;
        const name2 = (req.query.name2) ? req.query.name2 : null;
        const email = (req.query.email) ? req.query.email : null;
        
        if(ptuid === 0 || !birth) {
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_userchange_complete');
            return;
        }

        const d ={
            SID: sid,
            name1: name1,
            name2: name2,
            birth: moment(birth).format('YYYY-MM-DD'),
            FID: fid,
            main: main,
            del: 0,
            email: email
          };
        
        const q = 'UPDATE ' + Db.T_users + ' SET  ? WHERE UID = ?';

        const [updateresult] = await sql.pool.query(q,[d, ptuid]);

        errors.push(updateresult.affectedRows + "件のデータを更新しました");

        admin_userchange(req,res);
        sql.set_log(req,sid,"Adminによりユーザー情報を変更しました。ptuid:" + ptuid);

    } catch(e) {
        console.log('Error in admin_userchangecomplete:' + e);
        errors.push('Error in admin_userchangecomplete:' + e);
        error_render(req, res, 'admin_userchangecomplete');
        return;
    }
}

async function admin_vial(req,res){
    try{
        if(!req.query.id){ 
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_vial');
            return;
        }

        const planid = parseInt(req.query.id);
        const plandata = await sql.getPlan(planid);
        
        const days = (req.query.days) ? parseInt(req.query.days) : 7;
        const vials  = await sql.get_vials(planid, days, plandata.syringe);
    
        res.render('admin_vial', { 
            Env: Env,
            errors: errors,
            form: req.query,
            plan: planid,
            vials: vials,
            days: days
        });
    } catch(e){
        console.log('Error in admin_vial:' + e);
        errors.push('Error in admin_vial:' + e);
        error_render(req, res, 'admin_vial');
        return;
    }
    
}

async function admin_log(req,res){
    try{
        if(!req.query.id){ 
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_log');
            return;
        }
        let range = (!req.query.range) ? 1 : parseInt(req.query.range);
        const q = `SELECT * FROM ${Db.T_logs} ORDER by ID desc LIMIT ? , 100`;
        const d = (range - 1 ) * 100 ;
        const [logs]  = await sql.pool.query(q,[d]);
    
        res.render('admin_log', { 
            Env: Env,
            errors: errors,
            form: req.query,
            logs: logs
        });
    } catch(e){
        console.log('Error in admin_log:' + e);
        errors.push('Error in admin_log:' + e);
        error_render(req, res, 'admin_log');
        return;
    }
}

async function admin_settings(req,res){
    try{
        if(!req.query.id){ 
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_settings');
            return;
        }
        if(req.query.submit){
            const items = req.query.items;
            const vals = req.query.vals;

            let q =[];
            for(let i=0;i< items.length;i++){
                q[i] = await sql.setSettings(items[i],vals[i]);
            }
        }
        
        let settings = await sql.getSettings();
    
        res.render('admin_settings', { 
            Env: Env,
            errors: errors,
            form: req.query,
            settings: settings
        });
    } catch(e){
        console.log('Error in admin_settings:' + e);
        errors.push('Error in admin_settings:' + e);
        error_render(req, res, 'admin_settings');
        return;
    }
}

async function admin_mail(req,res){
    try{
        if(!req.query.id){ 
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_mail');
            return;
        }
                
        const q = 'SELECT * FROM ' + Db.T_users + ' WHERE LENGTH(`email`) > 3 AND `del` = 0 ';
        const [mailusers] = await sql.pool.query(q);

        const fs= require('fs');
        const template = fs.readFileSync('./views/mailtemp_directmail.ejs');
    
        res.render('admin_mail', { 
            Env: Env,
            errors: errors,
            form: req.query,
            users: mailusers,
            template: template
        });
    } catch(e){
        console.log('Error in admin_mail:' + e);
        errors.push('Error in admin_mail:' + e);
        error_render(req, res, 'admin_mail');
        return;
    }
}

async function admin_mail_send(req,res){
    try{
        if(!req.query.id){ 
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_mail_send');
            return;
        }
           
        const mail_title = req.query.mailtitle;
        const mail_content = req.query.content;
        const ptuids = req.query.ptuids;

        const q = 'SELECT * FROM ' + Db.T_users + ' WHERE UID = ? ';
        let recipients = [];
        
        for(let ptuid of ptuids){
            let [userdata] = await sql.pool.query(q,[ptuid]);
            recipients.push(userdata[0]);
        }

        const mail = require('../bin/mail.js');
        const ejs = require('ejs');

        recipients.forEach(function(result){
            //完了メール送信
            ejs.renderFile('./views/mailtemp_directmail.ejs', {
                ptname: result.name1 + result.name2,
                mailcontent: mail_content,
                Env: Env
            },function(err,data){
                if(err) console.log(err);
                mail.sendmail(mail_title,result.email,data);
                console.log("Sent a complete mail to " + result.email);
            });
        });
    
        res.render('admin_mail_complete', { 
            Env: Env,
            errors: errors,
            form: req.query,
            users: recipients
        });
    } catch(e){
        console.log('Error in admin_mail:' + e);
        errors.push('Error in admin_mail:' + e);
        error_render(req, res, 'admin_mail');
        return;
    }
}

async function admin_mail_list(req,res){
    try{
        if(!req.query.id){ 
            errors.push('不正なアクセスです');
            error_render(req,res,'admin_mail_list');
            return;
        }
                
        const q = 'SELECT * FROM mail ORDER by id DESC ';
        const [maillist] = await sql.pool.query(q);

        res.render('admin_mail_list', { 
            Env: Env,
            errors: errors,
            form: req.query,
            maillist: maillist
        });
    } catch(e){
        console.log('Error in admin_mail_list:' + e);
        errors.push('Error in admin_mail_list:' + e);
        error_render(req, res, 'admin_mail_list');
        return;
    }
}

function error_render(req, res, module_name){
    console.log('Error in ' + module_name);
    errors.push('Error in ' + module_name);
    res.status( 500 ); //. 500 エラー
    res.render( 'err_admin', { errors: errors, form: req.query } ); 
}

module.exports = router;
