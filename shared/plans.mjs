export const PLANS=Object.freeze({
 essential:{id:'essential',name:'Esencial',monthly:150,annual:1500,tables:20,staff:5,customButtons:2,videos:false,roles:false,branding:false,reports:false,kitchen:false,historyDays:30,mediaBytes:1024**3},
 pro:{id:'pro',name:'Pro',monthly:250,annual:2500,tables:50,staff:null,customButtons:null,videos:true,roles:true,branding:true,reports:false,kitchen:false,historyDays:365,mediaBytes:3*1024**3},
 business:{id:'business',name:'Business',monthly:500,annual:5000,tables:100,staff:null,customButtons:null,videos:true,roles:true,branding:true,reports:true,kitchen:true,historyDays:null,mediaBytes:10*1024**3},
});
export const planFor=id=>PLANS[id]||PLANS.essential;
