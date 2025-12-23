var mysql = require('mysql2/promise');
//require(CONFIGFILE);
var moment = require('moment');
const { calendarFormat } = require('moment');

const pool = mysql.createPool({
  connectionLimit: 10,
  host: Db.dbhost,
  user: Db.dbuser,
  password: Db.dbpass,
  database: Db.dbname,
  timezone: '+09:00',
  dateStrings: 'date'
});

async function getLoginFailureCount(ip) {
  try {
    let sql = 'SELECT COUNT(ID) as num FROM `logs` WHERE (`ip` = ?) AND (`LOG` Like ?) AND (date(LOG_date) = CURDATE())';
    const [rows] = await pool.query(sql, [ip, 'FailLogin%']);
    return rows[0].num;
  } catch (e) {
    console.log('Error : getLonginFailureCount');
    console.log(e);
    return 0;
  } finally {
    //  pool.end();
  }
}

async function sid2ptinfo(sid)  // SID -> PT_masterから検索。なければ nullを返す
{
  try {
    let sql = 'SELECT * FROM ' + Db.T_master + ' WHERE `ID_No` = ?';
    const [rows] = await pool.query(sql, [sid]);
    console.log(rows);
    return (rows[0]);
  } catch (e) {
    console.log('Error in sid2ptinfo');
    console.log(e);
    return null;
  }
}

async function sid2uid(sid)  // SID->UID pt_usersから検索。なければ -1を返す
{
  try {
    const sql = 'SELECT UID FROM ' + Db.T_users + ' WHERE SID = ? AND del = 0';
    const [rows] = await pool.query(sql, [sid]);
    if (rows.length === 0) {
      return -1;
    } else {
      return rows[0].UID;
    }
  } catch (e) {
    console.log('Error in sid2uid');
    console.log(e);
    return -1;
  }
}

async function sid2ptusers(sid)  // SID->pt_usersから検索。なければ nullを返す
{
  try {
    const sql = 'SELECT * FROM ' + Db.T_users + ' WHERE SID = ? AND del = 0';
    const [rows] = await pool.query(sql, [sid]);
    if (rows.length === 0) {
      return null;
    } else {
      return rows[0];
    }
  } catch (e) {
    console.log('Error in sid2ptusers');
    console.log(e);
    return null;
  }
}

async function resid2uid(resid){ //予約ID -> UID
  try{
    let uid = 0;
    const q = 'SELECT UID FROM ' + Db.T_reserve + ' WHERE  ID = ?';
    const [rows] = await pool.query(q,[resid]);

    if(rows.length >0) uid = parseInt(rows[0].UID);
    return uid;
  } catch (e) {
    console.log('Error in resid2uid');
    console.log(e);
    return 0;
  }
}

async function uid2ptinfo(uid)  // UID -> pt_usersから検索。なければ nullを返す
{
  try {
    let sql = 'SELECT * FROM ' + Db.T_users+ ' WHERE UID = ? AND del = 0';
    const [rows] = await pool.query(sql, [uid]);
    return (rows[0]);
  } catch (e) {
    console.log('Error in uid2ptinfo');
    console.log(e);
    return null;
  }
}

async function getFamilies(fid) // FID -> pt_usersから
{
  try {
    let sql = 'SELECT * FROM ' + Db.T_users+ ' WHERE FID = ? AND del = 0';
    const [rows] = await pool.query(sql, [fid]);
    return (rows);
  } catch (e) {
    console.log('Error in getFamilies');
    console.log(e);
    return null;
  }
}

async function set_ptusers(sid, newfid = 0, name1 = '', name2 = '', birth = '') {
  ////SID -> UIDなければ登録.  返り値{FID:,UID:,SID:},SID=0で新規登録。 newfidを指定したらその番号で新規登録か更新
  try {
    let UID = 0;
    let FID = parseInt(newfid);
    sid = parseInt(sid);

    if (sid === 0) {  //家族会員でSIDが0の場合、MIN(SID) -1で新規登録
      let [rows] = await pool.query('SELECT MIN(SID) as minsid FROM ' + Db.T_users);
      sid = rows[0].minsid;
      if (sid >= 0) {
        sid = -1;
      } else {
        sid += -1;
      }
    }

    //UID,FID取得
    if (sid > 0) { //診察券持ち
      let sql = 'SELECT * FROM ' + Db.T_users + ' WHERE (SID = ?) AND (del = 0)';
      let [udata] = await pool.query(sql, [sid]);
      if (udata.length > 0) { //既登録ならUID、FIDを取得のみで終了
        UID = udata[0].UID;
        FID = udata[0].FID;
        if (parseInt(newfid) > 0) { //FID更新
          sql = 'UPDATE ' + Db.T_users + ' SET FID = ? WHERE SID = ?';
          let [updateresult] = await pool.query(sql, [newfid, sid]);
          console.log(updateresult.changedRows + '件のFIDを変更しました');
          FID = newfid;
        }
      }
    } else {
      UID = 0;
      FID = parseInt(newfid);
    }

    //users未登録の場合
    if (UID === 0) {
      if (FID === 0) {
        //FID新規登録
        console.log('初めてのログインのため、FIDを新規登録し、pt_usersに登録します SID:' + sid);
        const [fids] = await pool.query('SELECT MAX(FID) as maxfid FROM ' + Db.T_users);
        FID = fids[0].maxfid + 1;
      }

      let d = [];
      if (sid > 0) {
        const ptinfo = await sid2ptinfo(sid);
        const names = ptinfo.furigana.replace(/　/g," ").split(' ');
        if (names.length > 2) {
          for (let j = 2; j < names.length; j++) {
            names[1] += names[j];
          }
        } else if(names.length < 2){
          names[1] = " ";
        }
        d = [{
          SID: sid,
          name1: names[0],
          name2: names[1],
          birth: ptinfo.PT_birth,
          FID: FID,
          main: 1,
          del: 0
        }];
      } else { //診察券なしの新規登録
        d = [{
          SID: sid,
          name1: name1,
          name2: name2,
          birth: moment(birth).format('YYYY-MM-DD'),
          FID: FID,
          main: 1,
          del: 0
        }];
      }
      //新規FIDでUID登録
      sql = 'INSERT INTO ' + Db.T_users + ' SET ?';
      const [result] = await pool.query(sql, d);
      UID = result.insertId;
      console.log('新規UIDを登録しました: ' + UID);
    }
    return { UID: parseInt(UID), FID: parseInt(FID), SID: sid };

  } catch (e) {
    console.log('Error in set_ptusers ');
    console.log(e);
    return null;
  }
}

async function getActivePlans() { //stat = 1, <=y_end で抽出、arrayでreturn. 予約開始前は 'preopen' =1
  try {
    const sql = 'SELECT * FROM ' + Db.T_plans + ' WHERE (stat = 1) AND (y_end >= NOW())';
    let [plans,fields] = await pool.query(sql);
    
    moment.locale('ja');

    if (plans.length > 0) { 
      for(let i=0;i<plans.length;i++){
        let y_start = moment(plans[i].y_start);
        plans[i].y_start = y_start.format('YYYY年M月D日 H時m分');
        plans[i].preopen = (y_start.isAfter(moment())) ? 1 : 0;
        plans[i].start = moment(plans[i].start).format('YYYY年M月D日');
        plans[i].end = moment(plans[i].end).format('YYYY年M月D日');
      }
    }
    return plans;
  } catch (e) {
    console.log('Error in getActivePlans');
    console.log(e);
  }
}

async function getAllPlans() {
  try {
    const q = 'SELECT * FROM ' + Db.T_plans + ' ORDER by `year` DESC';
    const [rows] = await pool.query(q);
    let plans = [];

    rows.forEach(function (row) {
      let preopen = (moment(row.y_start) > moment()) ? 1 : 0;
      row.preopen = preopen;

      plans.push(row);
    });
    return plans;
  } catch (e) {
    console.log('Error in getAllPlans');
    console.log(e);
    return null;
  }
}

async function getPlan(planid) {
  try {
    const q = 'SELECT * FROM ' + Db.T_plans + ' WHERE id = ?';
    const [rows] = await pool.query(q,[planid]);
    
    return rows[0];
  } catch (e) {
    console.log('Error in getPlan');
    console.log(e);
    return null;
  }
}

async function getZones(planid) {
  try {
    const q = 'SELECT * FROM ' + Db.T_zones + ' WHERE plan = ? ORDER by `id` ';
    const [rows, fields] = await pool.query(q, [planid]);

    return rows;
  } catch (e) {
    console.log('Error in getZones');
    console.log(e);
    return null;
  }
}

async function getReservedNumber(planid, year, month, day=0) { // num{day:[{zoneid:,zonename:, num:}]}
  let num = {}, ret = {}; //day=0ならその月の全データ、day>0ならその日のみ
  try {
    const zones = await getZones(planid);
    
    let q = `SELECT PT_date, PT_zone, Del, ${Db.T_reserve}.plan, ${Db.T_zones}.name as zonename, Count(${Db.T_reserve}.ID) AS PT_num 
           FROM ${Db.T_reserve} LEFT JOIN ${Db.T_zones} ON PT_zone = ${Db.T_zones}.id  GROUP BY PT_date, PT_zone, Del, ${Db.T_reserve}.plan 
           HAVING ((Del = 0) AND (${Db.T_reserve}.plan = ?) AND( PT_date LIKE ?)) ORDER BY PT_date, PT_zone`;
    let d =  (day ===0 )? moment([year, month - 1, 1]).format('YYYY-MM-%') : moment([year, month - 1, day]).format('YYYY-MM-DD');
    let [rows, fields] = await pool.query(q, [planid, d]);

    rows.forEach(function (row) {
      let date = moment(row.PT_date).date();
      if (!num[date]) num[date] = [];
      num[date].push({ zoneid: parseInt(row.PT_zone), zonename: row.zonename, num: parseInt(row.PT_num) });
    });
    
    //予約数0のゾーンデータを追加
    for(let k in num){
      ret[k] = [];
      zones.forEach(function(zone){
        let result = num[k].find((u) => u.zoneid === parseInt(zone.id));
        if(!result) {
            ret[k].push({
                zoneid: parseInt(zone.id),
                zonename: zone.name,
                num: 0
            });
        } else {
            ret[k].push(result);
        }
      });
    }
  } catch (e) {
    console.log('Error in getReservedNumber :' + e);
    ret = null;
  } finally {
    return ret;
  }
}

async function getWaku(planid, year, month) {  // {day:[zoneid:, zonename:, num:]} 人数０のzone情報はない
  let waku = {};
  try {
    const q = `SELECT  ${Db.T_waku}.*, ${Db.T_zones}.name as zonename FROM ${Db.T_waku}
              LEFT JOIN ${Db.T_zones} ON ${Db.T_waku}.zone = ${Db.T_zones}.id 
              WHERE (${Db.T_waku}.plan = ?) AND (${Db.T_waku}.Sch_date LIKE ?)  
              ORDER BY ${Db.T_waku}.Sch_date, ${Db.T_waku}.zone`;
    
    let d = moment([year, month - 1, 1]).format('YYYY-MM-%');
    const [rows, fields] = await pool.query(q, [planid, d]);
    
    rows.forEach(function (row) {
      let date = moment(row.Sch_date).date();
      if (!waku[date]) waku[date] = [];
      waku[date].push({ zoneid: parseInt(row.zone), zonename: row.zonename, num: parseInt(row.Sch_Num) });
    });

  } catch (e) {
    console.log('Error in getWaku :' + e);
    waku = null;
  } finally {
    return waku;
  }
}

async function getReservedVialMl(planid, plandata) { //vialml{'YYYY-MM-DD':{ml:, vial:},,,total_vial:,full:} シリンジモード total_vialとfullだけを返す
  let vialml = {};
  let total_vial = 0, full = 0;
  try {
    if (plandata.syringe == 0) { //バイアルモード
      let q = 'SELECT DISTINCTROW DATE_FORMAT(PT_date,\'%Y-%m-%d\') AS day, State, Sum(Vac_volume) AS ml  FROM ' + Db.T_reserve + ' WHERE ((Del = 0) AND (plan = ?))  GROUP BY day ';
      let [rows, fields] = await pool.query(q, [planid]);

      rows.forEach(function (row) {
        let date = moment(row.day).format('YYYY-MM-DD');
        let vial = Math.ceil(row.ml / plandata.mlpervial);
        vialml[date] = {
          ml: parseFloat(row.ml),
          vial: vial
        };
        total_vial += vial;
      })
      vialml.total_vial = total_vial;
      vialml.full = (total_vial >= plandata.vial) ? true : false; //予約上限に達しているか:0.25を考慮する必要あり！！
    } else {
      //シリンジモード total_vialとfullだけを返す
      let q = 'SELECT COUNT(ID) as reserve_num FROM ' + Db.T_reserve + ' WHERE ((Del = 0) AND(plan = ?))';
      let [rows, fields] = await pool.query(q, [planid]);
      vialml.total_vial = rows[0].reserve_num;
      vialml.full = (vialml.total_vial >= plandata.vial) ? true : false; //予約上限に達しているか:
    }
    return vialml;
  } catch (e) {
    console.log('Error in getReservedVialMl : ' + e);
    return null;
  }
}

async function getRequiredMl(plandata,moment_date,ptuids){
  let ml = 0;
  try{
    if(ptuids.length > 0){
      for(let ptuid of ptuids){
        //年齢取得
        let ptinfo = await uid2ptinfo(ptuid);
        let age = calcAge(moment(ptinfo.birth),moment_date);
        ml += (age >= plandata.halfdoseage) ? parseFloat(plandata.std_dose) : parseFloat(plandata.std_dose) *0.5;
      }
    }
    return ml;
  } catch (e) {
    console.log('Error in getRequiredMl : ' + e);
    return null;
  } 
}

async function getReserveCount(ptuid, planid, vac_id = 0) {  //予約済み予約数を返す。過去の予約はカウントしない3回以上の予約確認チェック用
  // vac_idを指定しなければ、予約日ベースでのカウント数。指定すれば、指定ワクチンのみのカウント数
  try {
    if(vac_id === 0){
      let sql = `SELECT COUNT(ID) as num FROM ${Db.T_reserve} WHERE ((Del = 0) AND (UID = ?) AND (plan = ?) AND (PT_date >= NOW()))`;
    } else {
      let sql = `SELECT COUNT(ID) as num FROM  ${Db.T_reserve} LEFT JOIN ${Db.T_reserved_vaccines} 
                  ON ${Db.T_reserve}.ID = ${Db.T_reserved_vaccines}.resid 
                  WHERE ((Del = 0) AND (UID = ?) AND (plan = ?) AND (PT_date >= NOW()))`;
    }
    let [result] = await pool.query(sql, [ptuid, planid]);
    return result[0].num;
  } catch (e) {
    console.log('Error in getReserveCount : ' + e);
    return -1;
  }
}

async function getRecentReserve(ptuid, strdate, planid, resid = 0, intweek = 0) //resdate:yyyy-mm-dd (string) {plan.intweek}以内の予約を返す
{ //intweek = 0なら、planを検索して、intweekを取得する. resid : 除外するID。予約変更時
  try{
    if(intweek === 0){
      const [planresult] = await pool.query('SELECT intweek FROM ' + Db.T_plans + ' WHERE id = ?',[planid]);
      intweek = parseInt(planresult[0].intweek);
    }
    const intdays = intweek * 7 - 1;
  
    const date1 = moment(strdate).subtract(intdays, 'days').format('YYYY-MM-DD');
    const date2 = moment(strdate).add(intdays, 'days').format('YYYY-MM-DD');

    const sql = 'SELECT * FROM ' + Db.T_reserve +  ' WHERE ((ID != ?) AND (UID = ?)  AND (Del = 0) AND (PT_date BETWEEN ? AND ?))';
    const [result,fields] = await pool.query(sql,[resid,ptuid,date1,date2]);
    return result;
  } catch (e) {
    console.log('Error in getRecentReserve : ' + e);
    return null;
  }
}

async function getReservesFromUid(ptuid, planid){ //UID -> 予約一覧
  try{
    const q = `SELECT ${Db.T_reserve}.*, ${Db.T_zones}.name as zonename FROM ${Db.T_reserve} 
      INNER JOIN ${Db.T_zones} ON ${Db.T_reserve}.PT_zone = ${Db.T_zones}.id 
      WHERE (${Db.T_reserve}.UID = ?) AND (${Db.T_reserve}.plan = ?) AND (${Db.T_reserve}.Del = 0) ORDER BY ${Db.T_reserve}.PT_date`;
    
    const [resdata, fields] = await pool.query(q,[ptuid,planid]);

    return resdata;
  } catch (e) {
    console.log('Error in getReservesFromUid : ' + e);
    return null;
  }
}

async function getReservesFromFid(fid,planid){ //FID ->予約一覧 j_date,state付加
  try{
    const q = `SELECT ${Db.T_reserve}.*, ${Db.T_zones}.name as zonename FROM ${Db.T_reserve} 
      INNER JOIN ${Db.T_zones} ON ${Db.T_reserve}.PT_zone = ${Db.T_zones}.id 
      WHERE (${Db.T_reserve}.FID = ?) AND (${Db.T_reserve}.plan = ?) AND (${Db.T_reserve}.Del = 0) 
      ORDER BY ${Db.T_reserve}.PT_date, ${Db.T_reserve}.PT_zone`;
    
    const [resdata, fields] = await pool.query(q,[fid,planid]);
    const plandata = await getPlan(planid);

    moment.locale('ja');
    for(let index in resdata){
      if(moment(resdata[index].PT_date).isBefore(moment())){
        resdata[index].state = '接種済';
      }else if(moment(resdata[index].PT_date).isBefore(moment().add(parseInt(plandata.cancel),'hours'))){
        resdata[index].state = '変更不可です。<br>予約を変更される場合は、お手数ですが直接病院までご連絡下さい';
      } else {
        resdata[index].state = '';
      }
      resdata[index].j_date = moment(resdata[index].PT_date).format('YYYY年M月D日(dddd)');
    }//for
    
    return resdata;
  } catch (e) {
    console.log('Error in getReservesFromFid : ' + e);
    return null;
  }
}

async function getVaccineList(planid){  //planのワクチンリスト[]
  try{
    const q = 'SELECT * FROM ' + Db.T_vaclist  + ' WHERE plan = ?';
    const [rows] = await pool.query(q,[planid]);

    return rows;
  }catch(e){
    console.log('Error in getVaccineInfo : ' + e);
    return null;
  }
}

async function set_vac_name(ptuid, planid){ //1回目か2回目か抽出・T_reserveに書き込みする
	try{
    let q = 'SELECT ID,  PT_date  FROM ' + Db.T_reserve + ' WHERE (UID = ?) AND (plan = ?) AND (Del = 0) ORDER BY PT_date';
    const [reslists] = await pool.query(q,[ptuid,planid]);
    let nowaits = [], results = [];

    const num = reslists.length;  //予約総数
    q = 'UPDATE ' + Db.T_reserve + ' SET Vac_name = ? WHERE ID = ?';
    for(let i=0;i<num;i++){
      nowaits[i] = pool.query(q,[i+1, reslists[i].ID]);
      results[i] = await nowaits[i];
    }

    return num;
  } catch(e){
    console.log('Error in set_vac_name : ' + e);
    return -1;
  }        
}

async function getReserveInfo(resid,fid=0){ //予約ID -> 予約情報 FID:0 adminモード。FIDが一致しないとヒットしないように
  try{
    let q,d;

    if(fid == 0){
      q = `SELECT ${Db.T_reserve}.*, ${Db.T_zones}.name as zonename FROM ${Db.T_reserve} INNER JOIN ${Db.T_zones} ON ${Db.T_reserve}.PT_zone = ${Db.T_zones}.id WHERE ${Db.T_reserve}.ID = ?`;
      d = [resid];
    } else {
      q = `SELECT ${Db.T_reserve}.*, ${Db.T_zones}.name as zonename FROM ${Db.T_reserve} 
      INNER JOIN ${Db.T_zones} ON ${Db.T_reserve}.PT_zone = ${Db.T_zones}.id 
      WHERE ${Db.T_reserve}.ID = ? AND ${Db.T_reserve}.FID = ?`;
      d = [resid,fid];
    }
    const [data] = await pool.query(q,d);

    if(data.length > 0) {
      return data[0];
    } else {
      return null;
    }
  } catch(e){
    console.log('Error in getReserveInfo : ' + e);
    return null;
  }        
}

async function getAllOtherReserve(resid, ptuid, planid){ //有効な他の予約を返す
	try{
    const q = `SELECT ${Db.T_reserve}.*, ${Db.T_zones}.name as zonename 
              FROM ${Db.T_reserve} INNER JOIN ${Db.T_zones} ON ${Db.T_reserve}.PT_zone = ${Db.T_zones}.id 
              WHERE (${Db.T_reserve}.ID <> ?) AND (${Db.T_reserve}.UID = ?) AND (${Db.T_reserve}.plan = ?) AND (${Db.T_reserve}.Del = 0) ORDER BY ${Db.T_reserve}.PT_date` ;
    let [data] = await pool.query(q,[resid, ptuid, planid]);

    moment.locale("ja");
    for(let i=0;i<data.length;i++){
      data[i].jdate = moment(data[i].PT_date).format('YYYY年MM月DD日');
      data[i].youbi = moment(data[i].PT_date).format('dddd');
    }

    return data;
  } catch(e) {
    console.log('Error in getAllOtherRes : ' + e);
    return null;
  }   
}

async function getAkiWaku(strdate, zoneid, planid) { //指定日時の空き枠数を返す ＊＊
  let akinum;
  try{//枠空き確認
    let q = 'SELECT * FROM ' + Db.T_waku + ' WHERE (( Sch_date = ?) AND ( zone = ? ) AND (plan = ?))';
    const [rows] = await pool.query(q,[strdate,zoneid,planid]);
    const wakunum = (rows.length > 0) ? rows[0].Sch_Num : 0;

    //指定日の有効予約数取得
    q =  'SELECT COUNT(ID) AS NUM FROM ' + Db.T_reserve + ' WHERE (PT_date = ?) AND (PT_zone = ?) AND (Del = 0) AND (plan = ?)';
    const [resresults] = await pool.query(q,[strdate,zoneid,planid]);
    const resnum = (resresults.length > 0) ? resresults[0].NUM : 0;

    akinum = wakunum - resnum;
  } catch(e){
    console.log('Error in getAkiWaku : ' + e);
    akinum = -1;
  }finally{
    return akinum;
  }
}
   
async function get_vials(planid, days = 0, syringe = '0'){ //'total','sumi','pos'の連想配列; days日後までの必要数
  let ret={};

  try{
    const targetdate = moment().add(days,'days').endOf('day');
    const plandata = await getPlan(planid);
    const vialml = await getReservedVialMl(planid,plandata);

    if(parseInt(plandata.syringe) === 0){//バイアルモード
      let d_ml=[], d_vial=[],sumi_vial=0, p_vial=0;

      for(let key in vialml){
        if(vialml.hasOwnProperty(key) && moment(key,'YYYY-MM-DD',true).isValid()) {
          if(moment(key).isBefore(moment())){
            sumi_vial += vialml[key].vial;
          } else if(moment(key).isBefore(targetdate)){
            p_vial += vialml[key].vial;
          }
        }
      }

      ret = {
        total: vialml.total_vial,
        sumi : sumi_vial,
        pos  : p_vial,
        total25 : 0,
        sumi25 :  0,
        pos25  :  0,
        total5 : 0,
        sumi5 :  0,
        pos5  :  0
      };

    } else if(parseInt(syringe) === 0){ //シリンジモード
      let q = 'SELECT  DATE_FORMAT(PT_date,\'%Y-%m-%d\') AS day, State, Vac_volume AS ml  FROM ' + Db.T_reserve +  ' WHERE ((Del = 0) AND (plan = ?)) ';
      const [result] = await pool.query(q,[planid]);

      let sumi_vial= 0,p_vial= 0, sumi_vial25  = 0, p_vial25     = 0, total_vial = 0, vial25 = 0;
      
      result.forEach((r)=>{
        if(moment(r.day).startOf('day').isBefore(moment())){//接種済
          sumi_vial++;
          if(r.ml == 0.25) sumi_vial25 ++;
        } else if (moment(r.day).startOf('day').isBefore(targetdate)){ //指定日数内のバイアル
          p_vial++;
          if(r.ml == 0.25) p_vial25 ++;
        }
        total_vial ++ ;
        if(r.ml == 0.25) vial25 ++;
      });    
       
      ret = {
        total:    total_vial,
        sumi:     sumi_vial,
        pos:      p_vial,
        total25:  vial25,
        sumi25:   sumi_vial25,
        pos25:    p_vial25,
        total5:   total_vial - vial25,
        sumi5:    sumi_vial - sumi_vial25,
        pos5:     p_vial - p_vial25
      };
    }
  } catch(e){
    console.log('Error in get_vials : ' + e);
  } finally{ 
    return ret;
  }
}

async function set_log(req, sid, message){
  try{
    let data = (!req) ? {SID: sid, LOG:message.substr(0,254), term: "admin", ip: "local"} : {SID: sid, LOG:message.substr(0,254), term: req.get('user-agent').substr(0,127), ip: req.ip};
    const [result] = await pool.query('INSERT INTO `logs` SET ?',data);
 //   console.log('Writing log');    
 //   sql.pool.end;
  } catch(e){
    console.log(e);
  } 
}

async function check_token(ptuid, token, del = 0){ //OK: true , NG: false, del=1 -> hash削除
  let ret = false;
  try{
    let q = 'SELECT * FROM ' + Db.T_users + ' WHERE UID = ? ';
    const [result] = await pool.query(q,[ptuid]);

    if(result.length>0 && result[0].hash == token && moment(result[0].hashAt).isAfter(moment().subtract(Env.token_expire,'minutes'))){
      ret = true;
    }
    if(del === 1){
      q = 'UPDATE ' + Db.T_users + ' SET hash = null , hashAt = null WHERE UID = ?';
      const [hashdelete] = await pool.query(q,[ptuid]);
      console.log('Deleted hash of UID:' + ptuid);
    }
  } catch(e){
    console.log(e);
  } finally{
    return ret;
  }
}

async function getSettings(){
  let ret = null;
  try{
    const q = 'SELECT * FROM  settings  WHERE del = 0 ';
    const [result] = await pool.query(q);

    ret = result;
  } catch(e){
    console.log(e);
  } finally{
    return ret;
  }
}
async function setSettings(item, val){
  let ret = 0;
  try{
    const q = 'UPDATE settings  SET val = ? WHERE item = ? ';
    const [result] = await pool.query(q,[val, item]);

    ret = result.affectedRows;
  } catch(e){
    console.log(e);
  } finally{
    return ret;
  }
}


function calcAge(birthdate, targetdate) { // moment型
	var age = targetdate.year() - birthdate.year();
	var birthday = moment([targetdate.year(), birthdate.month(), birthdate.date()]);
	if (targetdate < birthday) {
		age--;
	}
	return age;
}

function formatDate(date, format) {// yyyy-M-d H:m:s.S
  format = format.replace(/yyyy/g, date.getFullYear());
  format = format.replace(/M/g, (date.getMonth() + 1));
  format = format.replace(/d/g, (date.getDate()));
  format = format.replace(/H/g, (date.getHours()));
  format = format.replace(/m/g, (date.getMinutes()));
  format = format.replace(/s/g, (date.getSeconds()));
  format = format.replace(/S/g, (date.getMilliseconds()));
  return format;
};

module.exports.pool = pool;
module.exports.getLoginFailureCount = getLoginFailureCount;
module.exports.sid2ptinfo = sid2ptinfo;
module.exports.sid2ptusers = sid2ptusers;
module.exports.uid2ptinfo = uid2ptinfo;
module.exports.getFamilies = getFamilies;
module.exports.resid2uid = resid2uid;
module.exports.set_ptusers = set_ptusers;
module.exports.getActivePlans = getActivePlans;
module.exports.getAllPlans = getAllPlans;
module.exports.formatDate = formatDate;
module.exports.getReservedNumber = getReservedNumber;
module.exports.getWaku = getWaku;
module.exports.getReservedVialMl = getReservedVialMl;
module.exports.getZones = getZones;
module.exports.sid2uid = sid2uid;
module.exports.getReserveCount = getReserveCount;
module.exports.getRecentReserve = getRecentReserve;
module.exports.getPlan = getPlan;
module.exports.calcAge = calcAge;
module.exports.set_vac_name = set_vac_name;
module.exports.getReserveInfo = getReserveInfo;
module.exports.getAllOtherReserve = getAllOtherReserve;
module.exports.set_log = set_log;
module.exports.getReservesFromUid = getReservesFromUid;
module.exports.getReservesFromFid = getReservesFromFid;
module.exports.getAkiWaku = getAkiWaku;
module.exports.check_token = check_token;
module.exports.getVaccineList = getVaccineList;
module.exports.get_vials = get_vials;
module.exports.getSettings = getSettings;
module.exports.setSettings = setSettings;
module.exports.getRequiredMl = getRequiredMl;