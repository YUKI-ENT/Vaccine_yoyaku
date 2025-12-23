$(function(){
    // //リロード等の読み込み時は初期状態からチェックが入っているため、関数で判定を行う 
    checkedButton();
    
    //チェック時に制限チェックの関数で判定を行う 
    $('input[name="ptuids[]"]').change(checkedButton);
    
    function checkedButton(){
        $('input[id^="ptuids"]').each((key,val)=>{
            const userdata = $(val).data();
            let uid = "Checkbox" + userdata.uid;
            if($(val).prop('checked')){
                $(`input[id=${uid}]`).prop('disabled',false);
            }else{
                $(`input[id=${uid}]`).prop('disabled',true);
            }
        });
    }
    
});