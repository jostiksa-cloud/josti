function trucks(){return Array.from({length:8},(_,i)=>({id:'T'+(i+1),carrier:carriers[i%3],status:['available','waiting','trip','available','offline','available','trip','waiting'][i],x:[365,480,665,735,875,600,995,810][i],y:[165,290,235,360,180,410,310,460][i],distance:(2.4+i*1.2).toFixed(1)}))}
const truckStatus={available:['متاحة','Available'],waiting:['تنتظر','Waiting'],trip:['في رحلة','On trip'],offline:['غير متاحة','Unavailable']};
const colors={available:'#168663',waiting:'#dba545',trip:'#388bb0',offline:'#979aa8'};
