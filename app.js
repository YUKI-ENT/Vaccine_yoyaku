var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var session = require('express-session');

//config file
CONFIGFILE = './config.js'; //Global
for(let i = 0;i < process.argv.length; i++){
  let arg = process.argv[i];
  console.log("argv[" + i + "] = " + arg);
  if(arg === '-c' && process.argv.length > i+1){
    CONFIGFILE = process.argv[i+1];
    console.log("Config file is set to: " + CONFIGFILE);
  }
}
console.log("Loading config file " + CONFIGFILE );
require(CONFIGFILE);

var indexRouter = require('./routes/index');
if(Env.admin !== ''){
  var adminRouter = require('./routes/admin');
}

const { env } = require('process');

const helmet = require('helmet');

var app = express();



// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(helmet()); // ヘルメットを使用する

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));  //default false
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// セッションミドルウェア設定
app.use(session({
   resave:false,
   saveUninitialized:false, 
   secret: 'yuuki-ent-session',
   cookie:{
    httpOnly: true,
    secure: false,
    maxAge: Env.MaxCookieAge
    }
  })); // 追記

app.use('/', indexRouter);
//app.use('/users', usersRouter);
if(Env.admin !== ''){
  app.use(Env.admin, adminRouter);
}

//. 404 エラーが発生した場合、
app.use( function( req, res, next ){
  let errors = [];
  errors.push(req.path)
  res.status( 404 ); //. 404 エラー
  res.render( 'err404', { path: req.path, errors: errors } ); //. 404 エラーが発生したパスをパラメータとして渡す
});

//. 500 エラーが発生した場合、
app.use( function( err, req, res, next ){
  let errors = [];
  errors.push(err);
  res.status( 500 ); //. 500 エラー
  res.render( 'err500', { errors: errors } ); //. 500 エラーの内容をパラメータとして渡す
  errors = [];
});

module.exports = app;
