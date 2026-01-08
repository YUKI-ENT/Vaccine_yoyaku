var express = require('express');
var router = express.Router();

var passport = require('passport'); // 追記
var LocalStrategy = require('passport-local').Strategy; // 追記
var session = require('express-session'); 

const {check, validationResult} = require('express-validator');
// 外部ファイル化したバリデーション読み込み
const Validator = require('../bin/validator.js');

var moment = require('moment');

var sql=require('../bin/sql.js');
const mail = require('../bin/mail.js');
const crypt = require('../bin/crypt.js');
const ejs = require('ejs');

sql.set_log(null,0,Env.title + ' System started on port ' + Env.port);
// var errorlists = require('../bin/errors.json');
// var errors = [];

//var ptinfo = new Object();

process.on('uncaughtException', function(err) {
  console.log('uncaughtException!');
  console.log(err);
});

// Passport ログイン処理
// セッションミドルウェア設定
passport.use(new LocalStrategy({
  usernameField: 'sid',
  passwordField: 'birth',
  passReqToCallback: true,
  // session: false,
}, async function (req, sid, birth, done) {
    try{
      if (/^\d{2,5}$/.test(String(sid)) && moment(birth, ['YYYY-MM-DD','YYYY/MM/DD','YYYYMMDD'], true).isValid()) {
        const input_birth = normalizeBirth(birth);
        if (!input_birth) {
          throw new Error('生年月日の形式が不正です');
        }
        let ptinfo = await sql.sid2ptinfo(sid); //PT_master検索
        if(ptinfo != null){
          const birthday = wareki2datestr(ptinfo.nengo, ptinfo.B_year, ptinfo.B_month, ptinfo.B_day);
        
          if(input_birth === birthday){ //ログイン成功
            console.log("login success");
            sql.set_log(req,sid,'SuccessLogin');
            return done(null, sid);
          } else{
            console.log("login error");
            sql.set_log(req,sid,'FailLogin');
  //         errors.push(errorlists[0]);
            return done(null, false);
          }
        } else {
          console.log("login error, invalid sid" + sid);
          sql.set_log(req,sid,'FailLogin_Invalid sid');
    //      errors.push(errorlists[0]);
          return done(null, false);
        }
      } else {
        console.log("login validation error, invalid sid" + sid);
        sql.set_log(req,sid,'FailLogin_Invalid sid');
    //      errors.push(errorlists[0]);
        return done(null, false);
      }
    } catch(e){
          console.log('Auth error.');
          console.log(e);
          sql.set_log(req,sid,'FailLoginException');
   //       errors.push(errorlists[0]);
          return done(null, false);
    } finally{
    }
  }));

passport.serializeUser(function (user, done) {
//  console.log('Serialize ...');
  done(null, user);
});

passport.deserializeUser(function (user, done) {
//  console.log('Deserialize ...');
  done(null, user);
});

router.use(passport.initialize());
router.use(passport.session());

function normalizeBirth(birth) {
  if (!birth) return null;

  let m;

  if (birth instanceof Date) {
    m = moment(birth);
  } else {
    m = moment(
      birth,
      ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMMDD'],
      true
    );
  }

  if (!m.isValid()) return null;

  return m.format('YYYY-MM-DD');
}

///

/* GET home page. */
router.get(Env.https_path, isAuthenticated, Validator,  async function(req, res, next) { //ログイン後
    let errors = [];
    try{
      const ValidationErrors = validationResult(req);
      if (!ValidationErrors.isEmpty()) {
        console.log('Validation error.');
        ValidationErrors.array().forEach(e => {
          errors.push(e.msg);
        });
        error_render(req,res,'Validation',errors);
        return;
      }
    
      // Userdata(pt_usersから)を暗号化してcookieに保存する（壊れてたら作り直す）
    let userdata = null;

    // 1) cookieがあれば復号してみる（失敗したら破棄）
    if (req.cookies && req.cookies.USERINFOS) {
      try {
        const dec = crypt.getDecryptedString(req.cookies.USERINFOS);
        userdata = JSON.parse(dec);

        // 最低限の妥当性チェック（足りなければ無効扱い）
        if (!userdata || typeof userdata !== 'object' || !userdata.UID || !userdata.FID) {
          userdata = null;
          res.clearCookie('USERINFOS');
        }
      } catch (e) {
        // 復号失敗＝壊れた/改ざんの可能性 → 破棄して作り直す
        userdata = null;
        res.clearCookie('USERINFOS');
      }
    }

    // 2) cookieが無い/無効なら DB から作る
    if (!userdata) {
      // sid -> pt_users
      userdata = await sql.sid2ptusers(req.user);

      if (!userdata) { // 初めてのログイン set_ptusersでuid登録
        console.log("Registering new uid, fid for SID:" + req.user);

        const newuser = await sql.set_ptusers(req.user);
        sql.set_log(req, newuser.SID, '新規UID登録');

        // uid2ptinfo が返す形に合わせる（既存コード踏襲）
        userdata = await sql.uid2ptinfo(newuser.UID);
      }

      // 3) cookieに保存する内容は「必要最小限」に絞る（巨大化・漏えいリスクを減らす）
      const cookieUser = buildUserInfos(userdata);

      try {
        const enc = crypt.getEncryptedString(JSON.stringify(cookieUser));
        // セキュリティ寄りのCookie属性（https運用前提）
        res.cookie('USERINFOS', enc, {
          httpOnly: true,
          secure: true,          // httpsのみで送る
          sameSite: 'lax',
          // maxAgeは運用に合わせて（例：30日）
          maxAge: 1000 * 60 * 60 * 24 * 30
        });
        console.log('Set USERINFOS');
      } catch (e) {
        // cookie保存に失敗しても致命ではないので、ログだけ
        console.log('Failed to set USERINFOS cookie:', e);
      }
    }

    let fid = userdata.FID;
    let ptuid = userdata.UID;

    const mode = (req.query.mode) ? req.query.mode : 'plan';

    let plans = await sql.getActivePlans();

    switch (mode) {
      case 'familyedit':
        return familyedit(req, res, fid);

      case 'familydelconf':
        return familydelconf(req, res);

      case 'familydel':
        return familydel(req, res);

      case 'familyaddconf':
        return familyaddconf(req, res);

      case 'familyadd':
        return familyadd(req, res);

      case 'reservenew':
        return reserve_new_select(req, res);

      case 'reservenewcal':
        return reserve_new_cal(req, res);

      case 'reservenewconf':
        return reserve_new_conf(req, res);

      case 'reservenewcomplete':
        return reserve_new_complete(req, res);

      case 'reservechange':
        return reserve_change(req, res);

      case 'reserveedit':
        return reserve_edit(req, res);

      case 'reserveeditconf':
        return reserve_edit_conf(req, res);

      case 'reserveeditcomplete':
        return reserve_edit_complete(req, res);

      case 'reservedel':
        return reserve_del_complete(req, res);

      case 'mailform':
        return mail_form(req, res);

      case 'mailregist':
        return mail_regist(req, res);

      case 'maildelete':
        return mail_delete(req, res);

      case 'mailauth':
        return mail_auth(req, res);

      default: { // plan
        for (const p of plans) {
          const vialml = await sql.getReservedVialMl(p.id, p);

          p.vialml = vialml; // デバッグ用
          p.warn = null;

          if (vialml && vialml.total_vial >= p.vial) {
            p.warn = '現在予約が満員です。キャンセルや端数のある日のみ予約可能です。';
          } else if (vialml && vialml.total_vial + 10 >= p.vial) {
            p.warn = '現在予約残枠が少ないです。多人数予約で空き枠が出ない場合は人数を減らして試してください。';
          }
        }

        return res.render('plans', {
          user: req.user,
          ptinfo: userdata,
          Env: Env,
          plans: plans,   // 0件でもOK
          errors: errors
        });
      }
    }
  } catch(e) {
    console.log('/ error.');
    errors.push(e);
    error_render(req,res,'get root', errors);
  } 
});

router.get('/login', [
    check('errno').optional({nullable: true}).isNumeric().withMessage('不正なアクセスです')
  ],
  async function(req, res, next) {
  let errors = [];
  try{
    const validationerrors = validationResult(req);
    if(!validationerrors.isEmpty()) { // バリデーション失敗
      error_render(req,res,'login',validationerrors.errors);
      return;
    }
    //cookieが残っていれば削除
    res.clearCookie('USERINFOS');

    //入場制限
    const settings = await sql.getSettings();
    const result = settings.find( ({ item }) => item === 'restrictLogin' );
    if(Env.norestrict !== 1 && result && result.val === '1'){
      const restrictMessage = settings.find(({item}) => item === 'restrictMessage');
      errors.push(restrictMessage.val);
      res.render('restrictLogin', { 
        Env: Env,
        errors: errors
      });
    } else {
    //通常ログイン
      let deny = 0;
      const errorlists = require('../bin/errors.json');
      const logincount = await sql.getLoginFailureCount(req.ip);
      if(logincount > Env.MaxLoginFailure){
        console.log('Too many login failure. Deny login.');
        errors.push('規定のログイン失敗回数を超えました。失敗回数：' + String(logincount) + '回');
        deny = 1;
      } else if(req.query.errno !== undefined){
        errors.push(errorlists[req.query.errno]);
      }

      res.render('login', { 
          user : req.user,
          Env: Env,
          deny: deny,
          errors: errors
      });
    }
  }catch(e){
    console.log(e);
    errors.push(e);
    error_render(req,res,'login',errors);
  }
});

router.post('/login', passport.authenticate('local', 
  {successRedirect: Env.https_path + '?mode=plan',
  failureRedirect: '/login?errno=0',
  session: true
}));


router.get('/logout', function(req, res) {
  res.clearCookie('USER_COOKIE_SID'); //Cookie削除
  res.clearCookie('USER_COOKIE_FID'); 
  res.clearCookie('USER_COOKIE_UID');
  res.clearCookie('USER_COOKIE_BIRTH');
  res.clearCookie('USERINFOS');
  req.logout();
  res.redirect('/login?errno=1');
});



// ここまで========================================================
function validateLogin() {
  const v = 
    [
        check('sid')
            .not().isEmpty()
            .isInt(),
        check('birth')
            .not().isEmpty()
            .isDate(),
        check('mode')
            .optional({nullable: true})
            .isAlpha()
    ];
    console.log(v);
    return v;
    
}

function isAuthenticated(req, res, next){
  console.log(req.session);
  if (req.isAuthenticated()) {  // 認証済
    // console.log("Authenticated by Session data");
    return next();
  }
  else {  // 認証されていない
    // console.log("No session data");
    //cookie削除
    res.clearCookie('USERINFOS');
    res.redirect('/login?errno=3');  // ログイン画面に遷移
  }
}



async function familyedit(req, res){
  let errs = [];
  try{
    const userdata = getUserinfos(req);
    if(!userdata){
      errs.push('セッションの有効期限が切れました。もう一度ログインし直してください。');
      error_render(req,res,'familyedit',errs);
      return;
    }

    const q = 'SELECT DISTINCT UID, name1, name2, birth, del  FROM ' + Db.T_users + ' WHERE ((del = 0) AND (FID = ? )AND (UID  != ?)) ORDER BY birth';
    const d = [userdata.FID, userdata.UID];
    let [rows] = await sql.pool.query(q, d);

    rows.forEach(function(r, key){
      r.birth =  moment(r.birth).format('YYYY-MM-DD');
    })
    
    res.render('familyedit', { 
      ptinfo: userdata,
      Env: Env,
      family: rows,
      errors: errs
    });
  } catch(e) {
    console.log('Error in familyedit');
    console.log(e);
    errs.push(e);
    error_render(req,res,'family_edit',errs);
  } 
}

async function familydelconf(req,res){
  let errors = [];
  try{
    //アクセス元チェック
    //入力内容チェック
    if(!req.query.deluid){
      errors.push('削除する人が選択されていません');
      error_render(req,res,'familydelconf',errors); 
    } else {
      let deluids = req.query.deluid;
      let delusers = [];
      let err = 0;

      // forEachは非同期になるので、for ofで
      for(let deluid of deluids){
        //先日付の有効な予約があれば、エラー
        let q = 'SELECT * FROM '+ Db.T_reserve + ' WHERE ((PT_date >= NOW() ) AND (UID = ?) AND (Del = 0))';
        let [reserves] = await sql.pool.query(q, [deluid]);

        if(reserves.length > 0) {
          err = 1;
          errors.push(reserves[0].PT_name + 'さんの予約が入っているようです。予約を消してから、登録削除して下さい')
        } else {
          let ptdata = await sql.uid2ptinfo(deluid);
          if(ptdata){
            delusers.push({
              uid:  ptdata.UID,
              name: ptdata.name1 + ptdata.name2
            });
          } else {
            err = 1;
            errors.push('削除しようとしているご家族は、すでに削除されているようです。再度家族登録削除ページから操作してみてください');
          }
        }
      }//for

      if(err === 0){
        res.render('familydelconf', { 
          delusers: delusers,
          Env: Env,
          errors: errors
        });
      }else{
        error_render(req,res,'familydelconf',errors);
      }
    }
  } catch(e) {
    console.log('Error in familydelconf');
    errors.push(e);
    error_render(req,res,'familydelconf',errors); 
  }
}

async function familydel(req, res){
  let errors=[];
  try{
    const userdata = getUserinfos(req);
    //入力内容チェック
    if(!req.query.deluid || !userdata){
      errors.push('削除に失敗しました。もう一度家族の削除ページから操作し直してください。');
      error_render(req,res,'familydel',errors);
    } else {
      let deluids = req.query.deluid;
      const sid = userdata.SID;
      
      //データ削除
      let i = 0;
      for(let deluid of deluids){
        let q = 'UPDATE `pt_users` SET del = 1 WHERE UID = ? ';
        let [result] = await sql.pool.query(q, [deluid]); //待たない
        sql.set_log(req,sid,'家族削除 UID:' + deluid );
        i++;
      }
      errors.push(i + '人の家族登録を削除しました。');
      res.render('end', { 
        Env: Env,
        errors: errors
      });
    }
  } catch(e){
    console.log('Error in familydel');
    errors.push(e);
    error_render(req,res,'familydel',errors);
  }
}

async function familyaddconf(req, res){
  let errors = [];
  try{
    const userdata = getUserinfos(req);
    if(!userdata) {
      errors.push('セッションの有効期限が切れました。もう一度ログインし直してください。');
      error_render(req,res,'familyedit',errors);
      return;
    }

    req.query.fbirth = (req.query.fbirth).replace(/\//g,'-');
    let result = await family_check(req,userdata.FID);
    errors = result.err;
    //エラーチェック
    if(errors.length > 0){
      //入力エラーがあればエラー表示
      res.status( 500 ); //. 500 エラー
      res.render( 'err500', { errors: errors } );
    } else {  // エラーなければPreviewへ
      let name1;
      let name2;
      if(result.syosin == 1){
        name1 = req.query.name1;
        name2 = req.query.name2;
      } else {
        // 診察券番号から生年月日認証
        let pt = await sql.sid2ptinfo(req.query.Karte);
        let names = pt.furigana.split('　');
        name1 = names[0];
        name2 = names[1];
      }

      let form = {
        fid: userdata.FID,
        Karte:  req.query.Karte,
        fbirth:  req.query.fbirth,
        name1:  name1,
        name2:  name2,
        age:    sql.calcAge(moment(req.query.fbirth),moment())
      }

      res.render('familyaddconf', { 
        form: form,
        Env: Env,
        errors: errors
      });
    }
  } catch(e){
    console.log('Error in familyaddconf');
    errors.push(e);
    error_render(req,res,'familyaddconf',errors);
  }
}

async function  family_check(req, fid){ //{syosin: 0, err:[]}配列を返す。
  let ret = {syosin: 0, err:[]};
  try{
    //診察券番号チェック
    if(!req.query.Karte) { //初診
      ret.syosin = 1;
      if (!req.query.name1 || !req.query.name2) {
        ret.err.push('診察券をお持ちでなければ、名前(セイ、メイ)を入力して下さい');
      } else if(!req.query.fbirth) {
        ret.err.push('生年月日を入力して下さい');
      } else {
        //既登録チェック
        let q = 'SELECT *  FROM `pt_users` WHERE (del = 0) AND (FID = ?) AND (name1 like ?) AND (name2 like ?)';
        let [rows] = await sql.pool.query(q, [fid, req.query.name1, req.query.name2]);
        if(rows.length > 0){
          ret.err.push(req.query.name1 + req.query.name2 + 'さんはすでに家族登録されています');
        }
      }
    } else if (!Number(req.query.Karte)) {  //診察券持ち
      ret.err.push('診察券番号が正しくありません。(半角数字)');
    } else { //診察券持ち
      ret.syosin = 0;
      let q = 'SELECT * FROM `pt_master` WHERE ID_No = ?';
      let [rows] = await sql.pool.query(q, [req.query.Karte]);
      let req_fbirth = (req.query.fbirth).replace('/','-');
      fbirth_date = moment(req_fbirth);
//      fbirth_date.utcOffset("+0900");
      let fbirth_str = fbirth_date.format('YYYY-MM-DD');

      if(rows.length == 0 ){ //SID見つからない
        ret.err.push('診察券番号が正しくありません。4桁か5桁の数字ですのでご確認の上再度登録し直してください。5回以上間違えると本日の操作ができなくなりますので、ご注意ください。');
      } else if(fbirth_str != wareki2datestr(rows[0].nengo, rows[0].B_year, rows[0].B_month, rows[0].B_day)){
        ret.err.push('診察券番号と生年月日が一致しません。')
      } else {
        //既登録チェックはカットした。既に家族持ちの会員の場合、変更先FIDをすべて変更元FIDに書き換える仕様に 2021/05/24
      }
    }
  }catch(e){
    ret.err.push('家族追加操作でエラーが発生しました。入力内容をご確認の上、もう一度操作し直してみてください。');
    ret.err.push(e);
  } finally {
    return ret;
  }
}

async function familyadd(req, res){
  let errors = [];
  try{
    const userdata = getUserinfos(req);
    if(!userdata) {
      errors.push('セッションの有効期限が切れました。もう一度ログインし直してください。');
      error_render(req,res,'familyadd',errors);
      return;
    }

    let fid = req.query.fid;
    let birth_str = req.query.fbirth;
    let name1 = req.query.name1;
    let name2 = req.query.name2;
    let sid = 0;

    //ユーザー登録
    if (!req.query.Karte) { //新患 SID <0
      let q = 'SELECT MIN(SID) as minsid FROM `pt_users`';
      let [rows] = await sql.pool.execute(q);
      sid = Number(rows[0].minsid);
      if (sid >= 0) {
          sid = -1;
      } else {
          sid += -1;
      }

      q = 'INSERT INTO  `pt_users`  SET ? ';
      let d = {
        SID:  sid,
        name1:  name1,
        name2:  name2,
        birth:  birth_str,
        FID:    fid,
        main:   0,
        del:    0
      };
      result = await sql.pool.query(q,d);
      sql.set_log(req,userdata.SID, '家族追加:' + name1 + name2);
      
    } else { //診察券持ち: pt_usersに登録されていてFIDを持ってる場合は FIDを書き換える
        sid = Number(req.query.Karte);
        let newuid = await sql.set_ptusers(sid,fid);
        sql.set_log(req,userdata.SID, '家族追加(診察券あり):' + name1 + name2);
    }
    errors.push('家族登録が完了しました');
    res.render('end', { 
      Env: Env,
      errors: errors
    });
  } catch(e){
    console.log('Error in familyadd');
    errors.push(e);
    error_render(req,res,'familyadd',errors); 
  }
}

// reserve_new_select : 予約する人の選択（年齢ルールを見て選択可否を付与）
async function reserve_new_select(req, res) {
  let errors = [];
  try {
    const userdata = getUserinfos(req);
    if (!userdata || !req.query.plan) {
      errors.push('最初のページから再度アクセスし直してください。');
      error_render(req, res, 'reserve_new_select', errors);
      return;
    }

    const planid = parseInt(req.query.plan, 10);
    const fid = userdata.FID;

    // プラン取得
    const plandata = await sql.getPlan(planid);

    // detail整形（既存踏襲）
    if (plandata.break && plandata.detail) {
      plandata.detail = '<p>' + nl2br(plandata.detail) + '</p>';
    }

    // Fullモード（既存踏襲）
    const stop = parseInt(plandata.full, 10);
    if (stop) {
      errors.push('予約は満員になりました。申し訳ございませんが、現在新規の予約はできません。');
      res.render('reserve_new_select', {
        Env: Env,
        errors: errors,
        plan: plandata
      });
      return;
    }

    // 家族情報取得
    const q = `
      SELECT DISTINCT UID, name1, name2, birth, del
      FROM ${Db.T_users}
      WHERE ((del = 0) AND (FID = ?))
      ORDER BY birth
    `;
    let [rows] = await sql.pool.query(q, [fid]);
    let families = rows || [];

    // ===== 年齢ルール（reserve_plan_rules）を読み込む =====
    // rules: [{min_age_m,max_age_m,required_doses,note,...}, ...]
    const rules = await sql.getPlanRules(planid);

    // 月齢計算（満月齢）
    function calcMonthsAge(birthDate, baseDate) {
      const b = new Date(birthDate);
      const d = new Date(baseDate);
      let months = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
      if (d.getDate() < b.getDate()) months -= 1;
      return months;
    }

    function matchRuleByMonths(rulesArr, monthsAge) {
      return (rulesArr || []).find(r => {
        const minM = Number(r.min_age_m);
        const maxM = Number(r.max_age_m);
        return monthsAge >= minM && monthsAge <= maxM;
      }) || null;
    }

    // 接種日未確定なので、患者選択時は「下限だけ 12ヶ月（=1歳）ゆるめる」
    const RELAX_MIN_M = 12;
    const today = new Date();

    moment.locale('ja');

    families = families.map(f => {
      const birth = f.birth;                  // DBのbirth（Date or string）
      const age_m = calcMonthsAge(birth, today);

      // 厳密一致（今日 ）
      const strictRule = matchRuleByMonths(rules, age_m);

      // ゆるめ一致：min_age_m のみ 12ヶ月緩和
      const relaxedRule = (rules || []).find(r => {
        const minM = Number(r.min_age_m) - RELAX_MIN_M;
        const maxM = Number(r.max_age_m);
        return age_m >= minM && age_m <= maxM;
      }) || null;

      // 付与情報
      let eligible = true;
      let age_note = '';
      let required_doses = null; // 表示に使うなら

      if (strictRule) {
        eligible = true;
        required_doses = strictRule.required_doses;
        // note は表示したいなら使う（例：2-18歳、13歳未満など）
        if (strictRule.note) age_note = `対象：${strictRule.note}`;
      } else if (relaxedRule) {
        // 日程次第で対象に入る可能性があるので、選択は許可して「要確認」表示
        eligible = true;
        required_doses = relaxedRule.required_doses;
        age_note = '年齢要確認（接種日によって対象になります）';
      } else {
        // 明らかに対象外 → 選択不可
        eligible = false;
        age_note = '対象年齢外です';
      }

      return {
        ...f,
        birth_disp: moment(birth).format('YYYY年M月D日'),
        age_m: age_m,
        eligible: eligible,
        age_note: age_note,
        required_doses: required_doses
      };
    });

    // 画面へ
    res.render('reserve_new_select', {
      Env: Env,
      errors: errors,
      plan: plandata,
      family: families
    });

  } catch (e) {
    console.log('Error in reserve_new_select', e);
    errors.push(e);
    error_render(req, res, 'reserve_new_select', errors);
  }
}


async function reserve_new_cal(req, res, edit = 0, reserved_ids = []) { //変更モードと新規モード兼用
  //変更モードで起動:edit=1
  let errors = [];
  try {
    let families = [], resinfos = [];
    let num;
    let newvials = 0, decvials = 0, required_ml = 0.0;
    let args = [], ptuids = [];
    moment.locale('ja');
    const userdata = getUserinfos(req);

    // ---- helper（挙動を変えない範囲で重複排除） ----
    function buildZonesForDay(day, wakus, resnumbers, partySize, subtractPartySize) {
      const zns = [];
      let av = false;

      if (wakus[day]) {
        for (const waku of wakus[day]) {
          const resdata = (resnumbers[day]) ? resnumbers[day].find((r) => r.zoneid === waku.zoneid) : null;
          const resnum = (resdata) ? resdata.num : 0;
          const aki = waku.num - resnum - (subtractPartySize ? partySize : 0);

          zns.push({
            zoneid: waku.zoneid,
            zonename: waku.zonename,
            num: aki
          });
          if (aki >= 0) av = true;
        }
      }
      return { zns, av };
    }

    function isHoliday(holidays, year, month, day) {
      // 祝日判定ロジックは元のまま
      const y = String(year);
      const mmdd = ('00' + month).slice(-2) + ('00' + day).slice(-2);
      return (y in holidays) && (holidays[y].indexOf(mmdd) >= 0);
    }
    // ---- helper end ----

    // 引数チェック
    args = (edit === 0) ? ['plan', 'ptuids'] : ['plan', 'resids'];
    if (check_args(req.query, args).length > 0) {
      errors.push('予約操作を行う人が選択されていません。元のページにもどって、選択しなおして下さい');
      error_render(req, res, 'reserve_new_cal', errors);
      return;
    }
    if (!userdata) {
      errors.push('不正なアクセスです。トップページから操作し直してみてください。');
      error_render(req, res, 'reserve_edit', errors);
      return;
    }
    const fid = userdata.FID;

    const planid = parseInt(req.query.plan);
    let plandata = await sql.getPlan(planid);
    if (!plandata) {
      errors.push('指定の予防接種枠が存在しません。もう一度トップページから操作し直してください。');
      error_render(req, res, 'reserve_new_cal', errors);
      return;
    }

    // detailのHTML化（元コードの条件のまま）
    // if (plandata.break && plandata.detail) {
    //   plandata.detail = '<p>' + nl2br(plandata.detail) + '</p>';
    // }

    let full = plandata.full;
    const syringe = parseInt(plandata.syringe);

    // 表示年月日取得
    let year = moment(plandata.start).year();
    let month = moment(plandata.start).month() + 1;
    let day = 1;
    if (req.query.yearmonth) {
      const ym = req.query.yearmonth.split('-');
      year = parseInt(ym[0]);
      month = parseInt(ym[1]);
    }

    // 予約済人数 / 枠 / 残量（同時取得）
    const [resnumbers, wakus, vialml] = await Promise.all([
      sql.getReservedNumber(planid, year, month),
      sql.getWaku(planid, year, month),
      sql.getReservedVialMl(planid, plandata),
    ]);

    // 新規：ptuids -> families、変更：resids-> resinfo
    if (edit === 0) {
      ptuids = req.query.ptuids;

      for (const ptuid of ptuids) {
        const ptinfo = await sql.uid2ptinfo(ptuid);
        families.push({
          uid: ptuid,
          name: ptinfo.name1 + ptinfo.name2
        });

        // 3回以上の予約でないかチェック:新規予約のみ
        const reservecount = await more2_check(ptuid, planid);
        // planによって上限回数が違う
        const maxDoses = await sql.getPlanMaxDoses(planid);
        if (reservecount >= maxDoses) errors.push(ptinfo.name1 + ptinfo.name2 + '様：既に' + reservecount + '回の予約が入っています。' + (reservecount +1) + '回以上の予約はできません。');
      }

      // 人数
      num = ptuids.length;
      required_ml = await sql.getRequiredMl(plandata, moment([year, month - 1, 1]).endOf('month'), ptuids);
      decvials = 0;
      newvials = Math.ceil(required_ml / parseFloat(plandata.mlpervial));
    } else {
      if (reserved_ids.length === 0) reserved_ids = req.query.resids;
      num = reserved_ids.length;
      newvials = 0;

      let res_ml = 0;
      for (const resid of reserved_ids) {
        const resinfo = await sql.getReserveInfo(resid, fid);
        resinfo.j_date = moment(resinfo.PT_date).format('YYYY年M月D日(dddd)');
        ptuids.push(resinfo.UID);
        resinfos.push(resinfo);
        res_ml += parseFloat(resinfo.Vac_volume);
      }

      const res_date = moment(resinfos[0].PT_date);

      // 同一ptuid(1,2回目同時)の変更はエラー
      if (ptuids.length !== Array.from(new Set(ptuids)).length) {
        errors.push('同一人物を同時に変更することはできません。接種回数ごとに変更操作を行ってください。');
      }

      // 減るバイアル数（元コードの式そのまま）
      const key = res_date.format('YYYY-MM-DD');
      decvials = vialml[key].vial - Math.ceil((vialml[key].ml - res_ml) / plandata.mlpervial);

      required_ml = await sql.getRequiredMl(plandata, moment([year, month - 1, 1]).endOf('month'), ptuids);
      newvials = Math.ceil(required_ml / parseFloat(plandata.mlpervial));
    }

    if (num < 1) errors.push('接種する人が選択されていません。元のページにもどって、選択しなおして下さい');
    if (errors.length > 0) {
      error_render(req, res, 'reserve_new_cal', errors);
      return;
    }

    // 表示年・月一覧
    const yearmonths = [];
    for (let y = moment(plandata.start).startOf('month'); y.isSameOrBefore(moment(plandata.end)); y.add(1, 'months')) {
      const flag = (y.year() === year && y.month() + 1 === month) ? true : false;
      yearmonths.push({ id: y.format('YYYY-MM'), name: y.format('YYYY年M月'), flag: flag });
    }

    // バイアル総数が既定値に達するようなら満員扱い（元コードそのまま）
    if (vialml.total_vial + newvials - decvials > parseInt(plandata.vial)) full = 1;

    // 祝日
    const holidays = require('../holidays.json');

    // カレンダ作成
    let w = moment([year, month - 1, 1]).day();
    let lastdate = moment([year, month - 1, 1]).daysInMonth();
    let calenders = [];
    let type = '';
    let count = 0;
    let av = false;
    let zns = [];
    let applydate = moment().add(parseInt(plandata.apply), 'days');

    for (let i = 0; i < 42; i++) {
      av = false;
      zns = [];  // set default

      if (i === w) { // 最初の日
        type = 'day';
      } else if (day > lastdate) {
        type = '';
      }
      if (i === 35 && !type) break;
      if (type && i % 7 == 1) count++;
      if (type && i % 7 == 0) {
        type = 'sunday';
      } else if (type && i % 7 == 6) {
        type = 'satday';
      } else if (type) {
        type = 'day';
      }

      if (type) {
        // 祝日なら日曜扱い（元ロジック）
        if (isHoliday(holidays, year, month, day)) {
          type = 'sunday';
        }

        // 残数取得
        let date = moment([year, month - 1, day]).endOf('days');

        // ---- 端数モード（満員＆バイアル） ----
        if ((full) && (syringe === 0)) {
          if (date.isAfter(applydate) && type) { // 稼働日
            let zanryou = 0;
            const strdate = date.format('YYYY-MM-DD');
            if (vialml[strdate]) {
              zanryou = vialml[strdate].vial * parseFloat(plandata.mlpervial) - vialml[strdate].ml;
            }

            if (zanryou + (decvials * plandata.mlpervial) >= required_ml) {
              // 枠チェック（元の引き算: aki = waku.num - resnum - num）
              const r = buildZonesForDay(day, wakus, resnumbers, num, true);
              zns = r.zns;
              av = r.av;
            }
          }
        }
        // ---- 満員＆シリンジ ----
        else if ((full) && (syringe === 1) && (date.isAfter(applydate))) {
          // シリンジ満員で変更の時は、枠の範囲で自由に変更できる（元コード）
          if (edit === 1) {
            // 元の引き算: aki = waku.num - resnum （numを引かない）
            const r = buildZonesForDay(day, wakus, resnumbers, num, false);
            zns = r.zns;
            av = r.av;
          }
        }
        // ---- 通常（満員でない / シリンジ満員じゃない）----
        else if ((date.isAfter(applydate) && type)) {
          // 元の引き算: aki = waku.num - resnum （numを引かない）
          const r = buildZonesForDay(day, wakus, resnumbers, num, false);
          zns = r.zns;
          av = r.av;
        }

        calenders.push({
          day: day,
          type: type,
          available: av,
          zns: zns
        });

        day++;
      } else {
        calenders.push({
          day: 0,
          type: '',
          available: false,
          zns: null
        });
      }
    }

    let form = {
      plan: planid,
      num: num,
      year: year,
      month: month,
      day: day
    };

    let template = (edit === 0) ? 'reserve_new_cal' : 'reserve_edit_cal';
    if (errors.length > 0) {
      error_render(req, res, 'reserve_new_cal', errors);
      return;
    } else {
      res.render(template, {
        Env: Env,
        errors: errors,
        plan: plandata,
        families: families,
        resinfos: resinfos,
        resids: reserved_ids,
        ptuids: ptuids,
        form: form,
        yearmonths: yearmonths,
        calenders: calenders
      });
    }
  } catch (e) {
    errors.push(e);
    error_render(req, res, 'reserve_new_cal', errors);
  }
}


async function reserve_new_conf(req, res) {
  let errors = [];
  let warnings = [];

  try {
    let userdata = getUserinfos(req);
    if (check_args(req.query, ['plan', 'ptuids', 'year', 'month', 'day']).length > 0 || !userdata) {
      errors.push('不正なアクセスです。もう一度トップページから操作し直してみてください。');
      error_render(req, res, 'reserve_new_conf', errors);
      return;
    }

    const planid = parseInt(req.query.plan, 10);

    const plandatapromise = sql.getPlan(planid);
    const zonespromise = sql.getZones(planid);
    const rulespromise = sql.getPlanRules(planid); // ★追加：年齢ルール
    const plandata = await plandatapromise;
    const zones = await zonespromise;
    const rules = await rulespromise;

    // 予約情報設定
    moment.locale('ja');
    const rdate = moment([parseInt(req.query.year, 10), parseInt(req.query.month, 10) - 1, parseInt(req.query.day, 10)]);
    let resdata = {
      plan: planid,
      year: rdate.year(),
      month: rdate.month() + 1,
      day: rdate.date(),
      zoneid: parseInt(req.query.zoneid, 10),
      zonename: zones.find((z) => z.id === parseInt(req.query.zoneid, 10)).name,
      num: parseInt(req.query.num, 10),
      youbi: rdate.format('dddd')
    };

    // ===== ユーティリティ：月齢計算（満月齢）=====
    function calcMonthsAge(birthDate, baseMoment) {
      const b = moment(birthDate);
      if (!b.isValid()) return null;
      // “月差”から日付ぶん調整（誕生日当月に到達してないなら -1）
      let months = baseMoment.diff(b, 'months');
      // momentのdiff('months')は多くの場合これでOKだが、フォーマット揺れ対策で明示的に
      // （必要ならここを厳密化可能）
      return months;
    }

    function matchRuleByMonths(rulesArr, monthsAge) {
      if (!Array.isArray(rulesArr) || rulesArr.length === 0) return null;
      return rulesArr.find(r => monthsAge >= Number(r.min_age_m) && monthsAge <= Number(r.max_age_m)) || null;
    }

    // 家族情報取得
    const ptuids = Array.isArray(req.query.ptuids) ? req.query.ptuids : [req.query.ptuids];
    let families = [];

    for (let ptuid of ptuids) {
      let ptdata = await sql.uid2ptinfo(ptuid);
      families.push(ptdata);

      // 重複の確認（既存）
      let recentreserve = await sql.getRecentReserve(
        ptuid,
        rdate.format('YYYY-MM-DD'),
        planid,
        0,
        plandata.intweek
      );
      if (recentreserve.length > 0) {
        recentreserve.forEach(function (r) {
          errors.push(
            r.PT_name + '様、接種間隔があいていません。' +
            r.PT_date + 'の予約から' + plandata.intweek + '週間以上あけてください。'
          );
        });
      }

      // ===== ①対象年齢チェック（厳密：接種日で判定）=====
      // ptdata.birth が Date or string 想定
      const birthRaw = ptdata.birth;
      let birthMoment = null;

      if (birthRaw instanceof Date) {
        birthMoment = moment(birthRaw);
      } else if (typeof birthRaw === 'string') {
        birthMoment = moment(birthRaw, ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY年M月D日', 'YYYYMMDD'], true);
        if (!birthMoment.isValid()) birthMoment = moment(birthRaw); // 最後の保険
      } else {
        birthMoment = moment(birthRaw); // null等でも受ける
      }

      if (!birthMoment || !birthMoment.isValid()) {
        // 生年月日が取れないのは本来おかしいので、確定不可にするのが安全
        errors.push(`${ptdata.name1}${ptdata.name2}様：生年月日を取得できませんでした。受付にご連絡ください。`);
      } else {
        const ageMonths = calcMonthsAge(birthMoment, rdate);
        if (ageMonths === null || !Number.isFinite(ageMonths)) {
          errors.push(`${ptdata.name1}${ptdata.name2}様：年齢計算に失敗しました。受付にご連絡ください。`);
        } else {
          const rule = matchRuleByMonths(rules, ageMonths);

          if (!rule) {
            // 対象外 → エラー（確定不可）
            errors.push(
              `${ptdata.name1}${ptdata.name2}様（予約日時点 ${formatAgeYM(ageMonths)}）は、対象年齢外のため予約できません。`
            );
          } else {
            // 対象内 → 参考情報として warnings に入れても良い（任意）
            // 例：13歳未満/以上のルール表示
            if (rule.note) {
              // 表示が邪魔なら消してOK
              // warnings.push(`${ptdata.name1}${ptdata.name2}様は「${rule.note}」の区分です。`);
            }
          }
        }
      }

      // ===== ②推奨回数チェック（警告：confirm用）=====
      // ここはあなたの既存ロジックを活かす（接種日で月齢を取ると一貫する）
      if (birthMoment && birthMoment.isValid()) {
        const ageMonthsAtShot = rdate.diff(birthMoment, 'months'); // 予約日時点の月齢
        const recDoses = await sql.getRecommendedDosesByAge(planid, ageMonthsAtShot);

        if (recDoses !== null) {
          const currentCount = await more2_check(ptuid, planid);
          const afterCount = currentCount + 1; // 今回を含めた回数

          if (afterCount > recDoses) {
            warnings.push(
              `${ptdata.name1}${ptdata.name2}様（予約日時点 ${formatAgeYM(ageMonthsAtShot)}）は推奨接種回数が${recDoses}回ですが、今回で${afterCount}回目の予約になります。`
            );
          }
        }
      }
    }

    if (errors.length > 0) {
      error_render(req, res, '予約確認', errors);
      return;
    }

    // 予約実行OKのTokenを発行する
    moment.locale('en');
    const token = crypt.hashing(`${userdata.UID}:${moment().valueOf()}:${Math.random()}`);

    // 予約データの暗号化
    const resobj = { resdata: resdata, ptuids: ptuids };
    const enc_data = crypt.getEncryptedString(JSON.stringify(resobj));

    // tokenの保存
    const q = 'UPDATE ' + Db.T_users + ' SET hash = ?, hashAt = cast( now() as datetime ) WHERE UID = ?';
    await sql.pool.query(q, [token, userdata.UID]);

    res.render('reserve_new_conf', {
      Env: Env,
      errors: errors,
      warnings: warnings,
      plan: plandata,
      families: families,
      res: resdata,
      ptuids: ptuids,
      token: token,
      data: enc_data,
      form: req.query
    });

  } catch (e) {
    errors.push(e);
    error_render(req, res, 'reserve_new_conf', errors);
  }
}

function formatAgeYM(ageMonths) {
  if (!Number.isInteger(ageMonths) || ageMonths < 0) return '';
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  return `${years}才${months}ヶ月`;
}

async function reserve_edit_conf(req,res)
{
  let errors = [];
  try{
    //引数チェック
    let userdata = getUserinfos(req);
    args = ['plan','resids','year','month','day','zoneid','num'];
    if(check_args(req.query,args).length > 0 || !userdata)  {
        errors.push('不正なアクセスです。もう一度トップページから操作し直してみてください。');
        error_render(req,res,'reserve_new_cal',errors);
        return;
    }
    moment.locale('ja');
    const planid = parseInt(req.query.plan);
    const plandata = await sql.getPlan(planid);
    const zones = await sql.getZones(planid);
    const resids = req.query.resids;
    const rdate = moment([parseInt(req.query.year),parseInt(req.query.month)-1,parseInt(req.query.day)]);
    const fid = userdata.FID;
    let resinfo=[],resinfopromise = [];
    const newres = {
      plan: planid,
      j_date: rdate.format('YYYY年M月D日(dddd)'),
      year  : rdate.year(),
      month : rdate.month()+1,
      day   : rdate.date(),
      zoneid: parseInt(req.query.zoneid),
      zonename: zones.find((z)=> z.id === parseInt(req.query.zoneid)).name,
      num   : parseInt(req.query.num)
    };
    
    //重複の確認
    for(let resid of resids){
      let ptuid = await sql.resid2uid(resid);
      let recentreserve = await sql.getRecentReserve(ptuid,rdate.format('YYYY-MM-DD'),planid,resid,plandata.intweek);
      if(recentreserve.length > 0){
        recentreserve.forEach(function(r){
          errors.push(r.PT_name + '様、接種間隔が短すぎます。' + moment(r.PT_date).format('YYYY年M月D日') + 'の予約から' + plandata.intweek + '週間以上あけてください。');
        }) ;
      }else{
        resinfopromise.push(sql.getReserveInfo(resid,fid));
      }
    }
    if(errors.length > 0){
      error_render(req,res, '予約変更確認',errors);
      return;
    }
    for(let r of resinfopromise){
      resinfo.push(await r);
    }
    for(let i in resinfo){
      resinfo[i].j_date = moment(resinfo[i].PT_date).format('YYYY年M月D日(dddd)');
    }

    //予約実行OKのTokenを発行する
    moment.locale('en');
    const token = crypt.hashing(rdate.format() + ':' + moment().valueOf() + ':' + Math.random());

    //予約データの暗号化
    const resobj = {newres: newres, resids:resids};
    const enc_data = crypt.getEncryptedString(JSON.stringify(resobj));

    //tokenの保存
    
    const q = 'UPDATE ' + Db.T_users + ' SET hash = ? , hashAt = cast( now() as datetime ) WHERE UID=  ?' ;
    // userdata.hash = token;
    // userdata.hashAt = moment().format();
    const [updateresult] = await sql.pool.query(q,[token, userdata.UID]);
    //USERINFOSの更新
    // res.cookie('USERINFOS',crypt.getEncryptedString(JSON.stringify(userdata)));

    res.render('reserve_edit_conf', { 
      Env: Env,
      errors: errors,
      plan: plandata,
      res: resinfo,
      newres: newres,
      token: token,
      data: enc_data,
      form:  req.query
    });
  } catch(e) {
    errors.push(e);
    error_render(req,res,'reserve_edit_conf',errors);
  } 
}

async function reserve_new_complete(req, res) {
  let errors = [];
  let userdata = null;

  try {
    if (check_args(req.query, ['data', 'token']).length > 0) {
      errors.push('不正なアクセスです。トップページから操作し直してください。');
      error_render(req, res, 'reserve_new_complete', errors);
      return;
    }

    const token = req.query.token;
    const data = JSON.parse(crypt.getDecryptedString(req.query.data));

    const planid = data.resdata.plan;
    const year = data.resdata.year;
    const month = data.resdata.month;
    const day = data.resdata.day;
    const zoneid = data.resdata.zoneid;
    const ptuids = data.ptuids;

    const plandata = await sql.getPlan(planid);
    const maxDoses = await sql.getPlanMaxDoses(planid);

    userdata = getUserinfos(req);
    if (!userdata) {
      errors.push('ログイン情報が確認できません。トップページから操作し直してください。');
      error_render(req, res, 'reserve_new_complete', errors);
      return;
    }
    const ptuid = userdata.UID;
    const fid = userdata.FID; // ★追加：未定義バグ修正

    // Token確認
    const tokenresult = await sql.check_token(ptuid, token, 1);
    if (!tokenresult) {
      errors.push('予約データが正しくありません。予約実行ボタンを複数回押してしまった可能性があります。予約確認のページから予約が正しく取れているか確認の上、操作し直してください。');
      error_render(req, res, 'reserve_new_complete', errors);
      return;
    }

    // 再度枠空き確認
    const num = ptuids.length;
    const strdate = moment([year, month - 1, day]).format('YYYY-MM-DD');
    const akinum = await sql.getAkiWaku(strdate, zoneid, planid);
    if (akinum < num) {
      errors.push('申し訳ございませんが予約日は満員です。他の利用者が、少し前に予約を実行された可能性があります。日付を変更して予約しなおしてください');
      error_render(req, res, 'reserve_new_complete', errors);
      return;
    }

    // Total vial上限チェック
    const vialml = await sql.getReservedVialMl(planid, plandata);
    const required_ml = await sql.getRequiredMl(plandata, moment([year, month - 1, day]), ptuids);

    const newvials = (strdate in vialml)
      ? Math.ceil((vialml[strdate].ml + required_ml) / plandata.mlpervial) - vialml[strdate].vial
      : Math.ceil(required_ml / plandata.mlpervial);

    if (newvials > 0 && vialml.total_vial + newvials > plandata.vial) {
      errors.push('申し訳ございませんがワクチン予約数が上限に達したため予約を完了できませんでした。他の利用者が、少し前に予約を実行された可能性があります。端数のある日に予約が可能な場合がありますので、人数、日付を変更して予約しなおしてみてください');
      error_render(req, res, 'reserve_new_complete', errors);
      return;
    }

    // 予約データ準備
    const halfdoseage = parseFloat(plandata.halfdoseage);
    let d = [];
    let resinfos = [];

    for (let i = 0; i < num; i++) {
      const ptuser = await sql.uid2ptinfo(ptuids[i]);

      const age = sql.calcAge(moment(ptuser.birth), moment([year, month - 1, day]));
      const volume = (age < halfdoseage) ? parseFloat(plandata.std_dose) * 0.5 : parseFloat(plandata.std_dose);

      d.push([
        ptuids[i],
        ptuser.FID,
        planid,
        strdate,
        zoneid,
        ptuser.name1 + ptuser.name2,
        ptuser.SID,
        age,
        ptuser.birth,
        volume,
        moment().format('YYYY-MM-DD HH:mm:ss.SS')
      ]);

      resinfos.push({ PT_name: ptuser.name1 + ptuser.name2, PT_date: strdate, SID: ptuser.SID });
    }

    // 予約実行
    const q = `INSERT INTO ${Db.T_reserve} (UID,FID,plan,PT_date,PT_zone,PT_name,PT_ID,PT_age,PT_birth,Vac_volume,Y_date) VALUES ?`;
    await sql.pool.query(q, [d]);

    // ★画面を返す（ここまでが本処理）
    res.render('reserve_new_complete', {
      Env: Env,
      errors: errors,
      plan: plandata,
      planid: planid,
      form: req.query,
      maxDoses
    });

    // -----------------------
    // 以降は後処理（失敗しても画面は返してるので error_render しない）
    // -----------------------
    (async () => {
      try {
        // 接種回数設定（並列）
        await Promise.all(ptuids.map(u => sql.set_vac_name(u, planid).catch(() => null)));

        // ログ
        for (let ri of resinfos) {
          try { sql.set_log(req, ri.SID, '新規予約' + ri.PT_name + ':' + strdate); } catch (e) { console.log(e); }
        }

        // メール送信
        const reslists = await sql.getReservesFromFid(fid); // すべての予約

        moment.locale('ja');
        const userdb = await sql.uid2ptinfo(ptuid);
        const email = userdb?.email;
        if (!email) return;

        const planName = plandata?.name || plandata?.planname || plandata?.title || '';
        const subject = planName ? `予約完了（${planName}）` : '予約完了';

        console.log(Mail);
        ejs.renderFile('./views/mailtemp_edit.ejs', {
          Mail: Mail,
          ptname: (userdata.name1 || userdb.name1 || '') + (userdata.name2 || userdb.name2 || ''),
          plandata: plandata,
          res: resinfos,
          resdate: moment(strdate).format('YYYY年M月D日(dddd)'),
          reslists: reslists,
          zonename: data.resdata.zonename
        }, function (err, text) {
          if (err) { console.log(err); return; }
          mail.sendmail(subject, email, text);
          console.log("Sent a complete mail to " + email);
        });

      } catch (e) {
        console.log('post-process error in reserve_new_complete:', e);
      }
    })();

  } catch (e) {
    errors.push(e);
    if (res.headersSent) {
      console.log('reserve_new_complete error after headers sent:', e);
      return;
    }
    error_render(req, res, 'reserve_new_complete', errors);
  }
}


async function reserve_edit_complete(req, res) {
  let errors = [];
  let userdata = null;

  try {
    userdata = getUserinfos(req);

    const args = ['token', 'data'];
    if (check_args(req.query, args).length > 0 || !userdata) {
      errors.push('不正なアクセスです。もう一度トップページから操作し直してみてください。');
      error_render(req, res, 'reserve_edit_complete', errors);
      return;
    }

    const data = JSON.parse(crypt.getDecryptedString(req.query.data));
    const token = req.query.token;

    const planid = data.newres.plan;
    const year = data.newres.year;
    const month = data.newres.month;
    const day = data.newres.day;
    const zoneid = data.newres.zoneid;
    const resids = data.resids;

    const plandata = await sql.getPlan(planid);

    const fid = userdata.FID;
    const ptuid = userdata.UID;

    // Token確認
    const tokenresult = await sql.check_token(ptuid, token, 1);
    if (!tokenresult) {
      errors.push('予約データが正しくありません。予約実行ボタンを複数回押してしまった可能性があります。予約一覧ページから予約が正しく取れているか確認の上、操作し直してください。');
      error_render(req, res, 'reserve_edit_complete', errors);
      return;
    }

    // 再度枠空き確認
    const num = resids.length;
    const strdate = moment([year, month - 1, day]).format('YYYY-MM-DD');
    const akinum = await sql.getAkiWaku(strdate, zoneid, planid);

    if (akinum < num) {
      errors.push('申し訳ございませんが、変更先予約日は満員です。他の利用者が、少し前に予約を実行された可能性があります。日付を変更して変更操作しなおしてください');
      error_render(req, res, 'reserve_edit_complete', errors);
      return;
    }

    // 予約変更本体
    const halfdoseage = parseFloat(plandata.halfdoseage);
    const q = `UPDATE ${Db.T_reserve}
               SET PT_date = ?, PT_zone = ?, PT_age = ?, Vac_volume = ?, PT_memo = ?
               WHERE ID = ? AND FID = ?`;

    let resinfos = [];
    let updatepromises = [];

    for (let resid of resids) {
      const resinfo = await sql.getReserveInfo(resid);

      const age = sql.calcAge(moment(resinfo.PT_birth), moment([year, month - 1, day]));
      const volume = (age < halfdoseage) ? parseFloat(plandata.std_dose) * 0.5 : parseFloat(plandata.std_dose);

      const memo = (resinfo.PT_memo || '') +
        `${moment(resinfo.PT_date).format('YYYY-MM-DD')}から変更(${moment().format()})/`;

      resinfos.push(resinfo);

      updatepromises.push(
        sql.pool.query(q, [strdate, zoneid, age, volume, memo, resid, fid])
      );
    }

    for (const p of updatepromises) {
      const [r] = await p;
      if (r.changedRows === 0) {
        errors.push('一部の予約変更に失敗しました。予約の変更メニューをご確認ください。');
      }
    }

    // ★画面を返す（ここまでが本処理）
    res.render('reserve_edit_complete', {
      Env: Env,
      errors: errors,
      plan: plandata,
      planid: planid,
      form: req.query
    });

    // -----------------------
    // 以降は後処理：失敗しても画面は返してるので error_render しない
    // -----------------------
    (async () => {
      try {
        // 接種回数設定 + ログ（並列寄り）
        await Promise.all(resinfos.map(async (ri) => {
          try { sql.set_vac_name(ri.UID, planid); } catch (e) { console.log(e); }
          try { sql.set_log(req, ri.PT_ID, '予約変更' + ri.PT_name + ':' + strdate); } catch (e) { console.log(e); }
        }));

        // メール送信
        const reslists = await sql.getReservesFromFid(fid); //すべての予約

        moment.locale('ja');
        const userdb = await sql.uid2ptinfo(ptuid);
        const email = userdb?.email;
        if (!email) return;

        const planName = plandata?.name || plandata?.planname || plandata?.title || '';
        const subject = planName ? `予約日変更完了（${planName}）` : '予約日変更完了';

        ejs.renderFile('./views/mailtemp_edit.ejs', {
          Mail: Mail,
          ptname: (userdata.name1 || userdb.name1 || '') + (userdata.name2 || userdb.name2 || ''),
          plandata: plandata,
          res: resinfos,
          resdate: moment(strdate).format('YYYY年M月D日(dddd)'),
          reslists: reslists,
          zonename: data.newres.zonename  // ★修正：data.resdata → data.newres
        }, function (err, text) {
          if (err) { console.log(err); return; }
          mail.sendmail(subject, email, text);
          console.log("Sent a complete mail to " + email);
        });

      } catch (e) {
        console.log('post-process error in reserve_edit_complete:', e);
      }
    })();

  } catch (e) {
    errors.push(e);

    // 画面返却済みなら二重レスポンスしない
    if (res.headersSent) {
      console.log('reserve_edit_complete error after headers sent:', e);
      return;
    }
    error_render(req, res, 'reserve_edit_complete', errors);
  }
}


async function reserve_change(req,res){
  let errors = [];
  try{
    const userdata = getUserinfos(req);
    if(!req.user || !userdata){
      errors.push("セッションエラー：ログインから一定時間が経過したため、ログインしなおしてください");
      error_render(req,res,'reserve_change',errors);
      return;
    }

    const fid = userdata.FID;
    // plan指定なら従来通り / 無ければ全予約
    const planid = (req.query.plan !== undefined) ? req.query.plan : null;
    
    const showPast = (req.query.showpast === '1');
    const resdata = await sql.getReservesFromFid(fid,planid, showPast); 

    res.render('reserve_change', { 
      Env: Env,
      errors: errors,
      form:  req.query,
      res: resdata || []
    });
  } catch(e) {
    errors.push(e);
    error_render(req,res,'reserve_change',errors);
  } 
}
	
async function reserve_edit(req,res){
  let errors=[];
  try{
    let planid = req.query.plan ? Number(req.query.plan) : null;
    const resids = req.query.resids || [];
    
    const userdata = getUserinfos(req);
    const fid = userdata.FID;

    if(!req.query.resids){
      errors.push('予約変更する人が選択されていません。変更したい人にチェックを入れて実行して下さい');
      error_render(req,res,'reserve_edit',errors);
      return;
    }
    if(check_args(req.query, ['plan','change_act','resids']).length > 0  || !userdata) {
      errors.push('不正なアクセスです。トップページから操作し直してみてください。');
      error_render(req,res,'reserve_edit',errors);
      return;
    }

    if (!planid) {
      // 1件目からplanを推定
      const first = await sql.getReserveInfo(resids[0], fid);
      if (!first) { errors.push('予約情報が取得できませんでした'); /*...*/ }
      planid = Number(first.plan);
    }
    // 混在チェック
    const plans = new Set();
    for (const id of resids) {
      const info = await sql.getReserveInfo(id, fid);
      if (info) plans.add(Number(info.plan));
    }
    if (plans.size >= 2) {
      errors.push('異なる予防接種プランの予約を同時に変更・キャンセルすることはできません。プランごとに操作してください。');
      // ここで reserve_change に戻す（全予約画面へ）
      res.redirect(`${Env.https_path}?mode=reservechange`);
      return;
    }
        
    if(req.query.change_act == 1){ //変更
      reserve_new_cal(req,res,1,resids);
    } else{ //削除
      //予約情報
      let resdata = [];
      moment.locale('ja');
      for(let resid of resids){
        let r = await sql.getReserveInfo(resid,fid);
        r.j_date = moment(r.PT_date).format('YYYY年M月D日(dddd)');
        resdata.push(r);
      }
      res.render('reserve_del_conf', { 
        Env: Env,
        errors: errors,
        form:  req.query,
        res: resdata
      });
    }
  } catch(e){
    errors.push(e);
    error_render(req,res,'reserve_edit',errors);
  }
}

async function reserve_del_complete(req, res) {
  let errors = [];
  let userdata = null;

  try {
    userdata = getUserinfos(req);
    if (check_args(req.query, ['plan', 'resids']).length > 0 || !userdata) {
      errors.push('不正なアクセスです。トップページから操作し直してみてください。');
      error_render(req, res, 'reserve_del_complete', errors);
      return;
    }

    const fid = userdata.FID;
    const planid = parseInt(req.query.plan, 10);
    const resids = req.query.resids;

    const q = `UPDATE ${Db.T_reserve} SET Del = 1 WHERE (FID = ?) AND (ID = ?)`;

    let updatepromises = [];
    let ptuidspromises = [];

    for (let resid of resids) {
      updatepromises.push(sql.pool.query(q, [fid, resid]));
      ptuidspromises.push(sql.resid2uid(resid));
      sql.set_log(req, userdata.SID, '予約削除:' + resid);
    }

    let ptuids = [];

    for (let i = 0; i < updatepromises.length; i++) {
      const [r] = await updatepromises[i];        // ★ changedRows を正しく取る
      const ptuid = await ptuidspromises[i];
      ptuids.push(ptuid);

      if (r.changedRows === 0) {
        errors.push('一部の予約が削除できませんでした。もう一度予約の変更メニューから操作し直してみてください。');
      }
    }

    // 画面はここで返す（ここまでが“本処理”）
    res.render('reserve_del_complete', {
      Env: Env,
      errors: errors,
      form: req.query
    });

    // -----------------------
    // 以降は“後処理”：失敗しても画面は返してるので error_render しない
    // -----------------------
    (async () => {
      try {
        // Vac_name計算（await しないなら並列でOK）
        for (let ptuid of ptuids) {
          try { sql.set_vac_name(ptuid, planid); } catch (e) { console.log(e); }
        }

        // メール送信
        moment.locale('ja');
        const reslists = await sql.getReservesFromFid(fid); //すべての予約

        const userdb = await sql.uid2ptinfo(userdata.UID);  // ★ここ修正（ptuid→userdata.UID）
        const email = userdb?.email;
        if (!email) return;

        let resinfos = [];
        for (let resid of resids) {
          let resinfo = await sql.getReserveInfo(resid);
          resinfo.j_date = moment(resinfo.PT_date).format('YYYY年M月D日(dddd)');
          resinfos.push(resinfo);
        }

        ejs.renderFile('./views/mailtemp_delete.ejs', {
          Mail: Mail,
          ptname: userdata.name1 + userdata.name2,
          reslists: reslists,
          res: resinfos
        }, function (err, text) {
          if (err) {
            console.log(err);
            return;
          }
          mail.sendmail('キャンセル完了', email, text);
          console.log("Sent a complete mail to " + email);
        });

      } catch (e) {
        console.log('post-process error in reserve_del_complete:', e);
      }
    })();

  } catch (e) {
    // ここに来た時点で、render済みの可能性があるのでガード
    errors.push(e);
    if (res.headersSent) {
      console.log('reserve_del_complete error after headers sent:', e);
      return;
    }
    error_render(req, res, 'reserve_del_complete', errors);
  }
}


async function mail_form(req, res) {
  let errors = [];
  try {
    const cookieUser = getUserinfos(req);
    if (!cookieUser) {
      errors.push('不正なアクセスです。トップページから操作し直してください。');
      error_render(req, res, 'mail_form', errors);
      return;
    }

    // email等はDBから毎回取る
    const userdata = await sql.uid2ptinfo(cookieUser.UID);
    if (!userdata) {
      errors.push('セッションの有効期限が切れました。もう一度ログインし直してください。');
      error_render(req, res, 'mail_form', errors);
      return;
    }

    userdata.registed = !!userdata.email;

    res.render('mail_form', {
      Env: Env,
      form: req.query,
      ptdata: userdata
    });
  } catch (e) {
    errors.push(e);
    error_render(req, res, 'mail_form', errors);
  }
}


async function mail_regist(req,res){
  let errors=[];
  try{
    const cookieUser = getUserinfos(req);
    if (!cookieUser) {
      errors.push('不正なアクセスです。トップページから操作し直してください。');
      error_render(req, res, 'mail_form', errors);
      return;
    }

    // email等はDBから毎回取る
    const userdata = await sql.uid2ptinfo(cookieUser.UID);
    if (!userdata) {
      errors.push('セッションの有効期限が切れました。もう一度ログインし直してください。');
      error_render(req, res, 'mail_form', errors);
      return;
    }
    
    if(check_args(req.query,['email']).length > 0){
      errors.push('メールアドレスが入力されていません');
      error_render(req,res,'mail_regist',errors);
      return;
    }

    const ptuid = userdata.UID;
    const email = req.query.email;
    let token = ('000000' + parseInt(Math.random() * 1000000)).slice(-6);
    
    let mes = 'ゆうき耳鼻咽喉科ワクチン予約システムのメールアドレス登録手続きいただきありがとうございます。\n'
              + '下記の数字6桁の認証コードを入力してください。\n'
              + '10分以上経過しますと認証コードは無効となりますので、再度メールアドレスの仮登録手続きから操作し直してください。\n\n';
    mes += '認証コード: ' + token + '\n\n'; 
    mes += '本メールに心当たりのない方は、お手数ですが、ゆうき耳鼻咽喉科 <vaccine@yuuki-jibika.com> までご連絡ください。';

    mail.sendmail('本登録認証用コードのご連絡', email,mes);

    //tokenの保存
    
    const q = 'UPDATE ' + Db.T_users + ' SET hash = ?, hashAt = cast( now() as datetime ) WHERE UID = ?';
    userdata.hash = token;
    userdata.hashAt = moment().format('YYYY-MM-DD HH:mm:ss');
    let d = [token, ptuid];
    const [result] = await sql.pool.query(q,d);
    if(result.changedRows === 0){
      errors.push('tokenの保存に失敗しました。もう一度操作し直してみてください。');
      error_render(req,res,'mail_regist',errors);
      return;
    }
    //USERINFOSの更新
    // res.cookie('USERINFOS',crypt.getEncryptedString(JSON.stringify(userdata)));

    res.render('mail_sent', { 
      Env: Env,
      errors: errors,
      form:  req.query
    });
    
    sql.set_log(req,userdata.SID,'メールアドレス仮登録' + email);
  }catch(e) {
    errors.push(e);
    error_render(req,res,'mail_regist',errors);
  } 
}

async function mail_delete(req,res){
  let errors=[];
  try{
    let userdata = getUserinfos(req);
    if(!userdata){
      errors.push('セッションの有効期限が切れました。もう一度ログインし直してください。');
      error_render(req,res,'mail_delete',errors);
      return;
    }
    const ptuid = userdata.UID;
    
    const q = 'UPDATE ' + Db.T_users + ' SET email = null, hash = null, hashAt = null WHERE UID = ?';
    // userdata.hash = '';
    // userdata.email = '';
    // userdata.registed = false;

   // userdata.hashAt = moment().format('YYYY-MM-DD HH:mm:ss');
    const [result] = await sql.pool.query(q,[ptuid]);
    if(result.affectedRows === 0){
      errors.push('登録されたEmailアドレスの削除に失敗しました。もう一度操作し直してみてください。');
      error_render(req,res,'mail_delete',errors);
      return;
    }
    //USERINFOSの更新
    // res.cookie('USERINFOS',crypt.getEncryptedString(JSON.stringify(userdata)));
     
    res.render('mail_delete_comp', { 
      Env: Env,
      form:  req.query
    });
  }catch(e) {
    errors.push(e);
    error_render(req,res,'mail_regist',errors);
  } 
}

async function mail_auth(req,res){
  let errors=[];
  try{
  //  let userdata = getUserinfos(req);
    const ptuid = getUserinfos(req).UID;
    let userdata = await sql.uid2ptinfo(ptuid);
    if(check_args(req.query,['email','authcode']).length > 0){
      errors.push('認証コードが正しく入力されていません。仮登録メールを確認の上、もう一度操作し直してみてください。');
      error_render(req,res,'mail_auth',errors);
      return;
    }else if(!userdata){
      errors.push('セッションの有効期限が切れました。もう一度ログインし直してください。');
      error_render(req,res,'mail_auth',errors);
      return;
    }

    const authcode = req.query.authcode;
    const email = req.query.email;

    //認証コード確認
    const createdTime = moment(userdata.hashAt);
    console.log("hashAt:" + createdTime.format());
    if(userdata.hash == authcode && createdTime.isAfter(moment().add(-10,'minutes'))){
      console.log('mail address is registered.');
      const q = 'UPDATE ' + Db.T_users + ' SET email = ? WHERE UID = ? AND del = 0';
      const [result] = await sql.pool.query(q,[email,ptuid]);
      
      if(result.affectedRows > 0){
        //USERINFOSの更新
        // userdata.email = email;
        // res.cookie('USERINFOS',crypt.getEncryptedString(JSON.stringify(userdata)));

        res.render('mail_auth', { 
          Env: Env,
          errors: errors,
          form:  req.query,
          result: result.changedRows
        });
        sql.set_log(req,userdata.SID,'Registered Email');
        //完了メール送信
        ejs.renderFile('./views/mailtemp_registaddress.ejs', {
          Mail: Mail,
          ptname: userdata.name1 + userdata.name2,
          Env: Env
        },function(err,data){
          if(err) console.log(err);
          mail.sendmail('メールアドレス登録完了のお知らせ',email,data);
          console.log("Sent a complete mail to " + email);
        });

      } else {
        errors.push('Emailの登録に失敗しました。もう一度仮登録メールの登録から操作し直してみてください。');
        error_render(req,res,'mail_auth',errors);
        return;
      }
      
    } else {
      errors.push('認証コードの期限が切れています。もう一度仮登録メールの登録から操作し直してみてください。');
      error_render(req,res,'mail_auth',errors);
      return;
    }

  } catch(e) {
    errors.push(e);
    error_render(req,res,'mail_auth',errors);
  } 
}


function wareki2datestr(nengo, y, m, d){
  var s = '';
  if((nengo == '令和') && (y > 0)){
    s = (y+2018) + '-';
  } else if ((nengo == '平成') && (y > 0)) {
    s = (y+1988)+'-';
  } else if ((nengo == '昭和') && (y > 0) && (y <= 64)) {
    s = (y+1925)+'-';
  } else if ((nengo == '大正') && (y > 0) && (y <= 15)) {
    s = (y+1911)+'-';
  } else if ((nengo == '明治') && (y > 0) && (y <= 45)) {
    s = (y+1867)+'-';
  } 

  s += ('00' + m ).slice(-2) + '-' + ('00' + d).slice(-2);
  return s;
}

function nl2br(str) {
  str = str.replace(/\r\n/g, "<br />");
  str = str.replace(/(\n|\r)/g, "<br />");
  return str;
}

async function more2_check(ptuid, planid) //既に入っている予約数をかえす // 過去の予約もカウントに変更
{
  try{
    const q = 'SELECT COUNT(ID) as PT_num FROM `flu_reserve` WHERE ((UID = ?)  AND (Del = 0) AND (plan = ?))';
    const [rows] = await sql.pool.query(q, [ptuid, planid]);

    return rows[0].PT_num;
  } catch(e){
    console.log('Error in more2_check' + e);
    return -1;
  }
}

function error_render(req,res, module_name, errs){
  console.log('Error in ' + module_name);
  res.status( 500 ); //. 500 エラー
  res.render( 'err500', { errors: errs } ); 

  const userinfo = getUserinfos(req);
  const strerr = JSON.stringify(errs);
  sql.set_log(req,userinfo.SID,strerr);
}

function check_args(reqbody, fields){ //req.query or bodyが存在しなければ、存在しないfieldを返す
  let err = [];
  try{
    fields.forEach((f) => {
      if(!reqbody[f]) err.push(f);
    });
  } catch(e){
    console.log('Error in check_args' + e);
    err = ['check error'];
  }finally{
    return err;
  }
}

function getUserinfos(req){
  //Userdata(pt_usersから)を復号する . Errorあればnullを返す
  if(!req.cookies.USERINFOS) return null;
  const userdata = JSON.parse(crypt.getDecryptedString(req.cookies.USERINFOS));
  return userdata;
}

function buildUserInfos(userdata) {
  return {
    UID: userdata.UID,
    FID: userdata.FID,
    SID: userdata.SID,
    name1: userdata.name1,
    name2: userdata.name2,
    main: userdata.main ?? 0
    // emailは入れない
  };
}


module.exports = router;
