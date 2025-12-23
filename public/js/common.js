
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
