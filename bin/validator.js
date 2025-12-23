const { check } = require('express-validator');

module.exports = [
    check('mode').optional({nullable: true}).isAlpha().trim().escape().withMessage('不正な呼び出しです'),
    check('sid').optional({nullable: true,checkFalsy: true}).isInt().trim().escape().withMessage('診察券番号は数値を入力してください'),
    check('birth').optional({nullable: true,checkFalsy: true}).isDate().trim().escape().withMessage('誕生日の日付フォーマットが正しくありません'),
    check('Karte').optional({nullable: true,checkFalsy: true}).isInt().trim().escape().withMessage('追加患者の診察券番号は数値を入力してください'),
//    check('fbirth').optional({nullable: true,checkFalsy: true}).isDate().trim().escape().withMessage('誕生日の日付フォーマットが正しくありません'),
    check('name1').optional({nullable: true,checkFalsy: true}).isString().trim().escape().withMessage('名前の文字が正しくありません'),
    check('name2').optional({nullable: true,checkFalsy: true}).isString().trim().escape().withMessage('名前の文字が正しくありません'),
    check('plan').optional({nullable: true}).isInt().trim().escape().withMessage('不正なアクセスです'),
    check('id').optional({nullable: true}).isInt().trim().escape().withMessage('不正なアクセスです'),
    check('ptuid').optional({nullable: true}).isInt().trim().escape(),
    check('email').optional({nullable: true}).isEmail().withMessage('E-mailアドレスの書式が正しくありません。アドレスに間違いがないか確認してください。'),
    check('fbirth').optional({nullable: true}).trim()
        .custom(value => {
            const matches = value.match(/^[12]\d{3}[/\-](0?[1-9]|1[0-2])[/\-](0?[1-9]|[12][0-9]|3[01])?$/);
            const dt = new Date(value);
            if(!matches || isNaN(dt)) {
                throw new Error('誕生日が「YYYY-MM-DD」の正しいフォーマットではありません。年月日の区切りは-か/でお願いします。');
            }
            return true;
    }),
];