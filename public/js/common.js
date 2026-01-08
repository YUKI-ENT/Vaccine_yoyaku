
$("#backbtn").click( function() {
	history.go(-1);
});

$("#select_year").change(function(){
	this.form.submit();
});
$("#select_month").change(function(){
	this.form.submit();
});

$('#btndel').click(function(){
    if(!confirm('予約を削除(キャンセル)しますがよろしいですか？')){
        return false;
    }
    return;
});

$('#btnmaildel').click(function(){
    if(!confirm('登録されたメールアドレスを削除しますがよろしいですか？')){
        return false;
    }
    return;
});

// datepicker
$('#birth_picker').datepicker(
    {
        language:'ja',
        endDate: new Date(),
        format: 'yyyy/mm/dd',
        maxViewMode: 2,
        startView: 2,
        startDate: '1920-01-01'
    }
);
$('#fbirth').datepicker(
    {
        language:'ja',
        endDate: new Date(),
        format: 'yyyy/mm/dd',
        maxViewMode: 2,
        startView: 2,
        startDate: '1920-01-01'
    }
);
// 予約確定時の警告（data-warnings を見て confirm）
$(document).on('submit', '#reserveConfirmForm', function (e) {
    const raw = $(this).attr('data-warnings');
    if (!raw) return true;

    let warnings = [];
    try {
        warnings = JSON.parse(raw);
    } catch (err) {
        // JSON壊れてたら安全側：確認なしで通す or 止める、どちらか選ぶ
        // ここは「止めない」方が運用上ラクなので通す
        console.warn('Invalid warnings JSON:', err);
        return true;
    }

    if (Array.isArray(warnings) && warnings.length > 0) {
        const msg = warnings.join("\n\n") + "\n\n予約を実行しますか？";
        if (!window.confirm(msg)) {
            e.preventDefault();
            return false;
        }
    }
    return true;
});

// reserve_change: 過去予約表示トグル（CSP対策：inline eventを使わない）
$(document).on('change', '#showpast', function () {
    const $form = $('#showpastForm');
    if ($form.length) $form.trigger('submit'); // もしくは $form[0].submit()
});