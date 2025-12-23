$("#btnadd").click( function() {
    var content = $("#planid").val();
    var result = confirm(content + "をコピーして新規接種プランを作成します");
    if(result){
 //       $(this).trigger('submit', ['execute']);
        $('form').submit();
}else{
        return false;
    }
});
$("#btnedit").click( function() {
    var content = $("#planid").val();
    var result = confirm(content + "のプラン内容を変更します。現在運用中のプランの変更には十分注意してください");
    if(result){
 //       $(this).trigger('submit', ['execute']);
        $('form').submit();
}else{
        return false;
    }
});

$("#formplan").submit(function(){
    var result = confirm("送信します" );
    if(result){
        $('form').submit();
}else{
        return false;
    }
});

//////waku
$('#chk1').change(function(){
    if( $(this).prop('checked') ){
        $("[id=num1]").prop('disabled', false);
    } else{
        $("[id=num1]").prop('disabled', true);
    }
});
$('#chk2').change(function(){
    if( $(this).prop('checked') ){
        $("[id=num2]").prop('disabled', false);
    } else{
        $("[id=num2]").prop('disabled', true);
    }
});
$('#chk3').change(function(){
    if( $(this).prop('checked') ){
        $("[id=num3]").prop('disabled', false);
    } else{
        $("[id=num3]").prop('disabled', true);
    }
});
$('#chk4').change(function(){
    if( $(this).prop('checked') ){
        $("[id=num4]").prop('disabled', false);
    } else{
        $("[id=num4]").prop('disabled', true);
    }
});
$('#chk5').change(function(){
    if( $(this).prop('checked') ){
        $("[id=num5]").prop('disabled', false);
    } else{
        $("[id=num5]").prop('disabled', true);
    }
});
$('#chk6').change(function(){
    if( $(this).prop('checked') ){
        $("[id=num6]").prop('disabled', false);
    } else{
        $("[id=num6]").prop('disabled', true);
    }
});
$('#btndel').click(function(){
    if(!confirm('設定済みの予約枠を一括削除します')){
        return false;
    }
    return;
});

///// new
$('#selnum').change(function(){
    this.form.submit();
});
// 初期表示は非表示にする
$('[id=newpt]').toggle();
$("[id=btnnokarte]").click(function() {
    $('[id=newpt]').toggle();
});


// pt,userchange
$('[id=btndelres]').click(function(){
    if(!confirm('予約が削除されますがよろしいですか？')){
        return false;
    }
    return;
});

$("#select_days").change(function(){
	this.form.submit();
});

//mail
$('#checkall').change(function(){
    $("input[name='ptuids[]']").prop('checked', this.checked);
});
$('#sendmail').click(function(){
    if(!confirm('メールを送信しますがよろしいですか？')){
        return false;
    }
    return;
});
