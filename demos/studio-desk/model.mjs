export const isoDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function offsetDate(days,base=new Date()){const d=new Date(base);d.setDate(d.getDate()+days);return isoDate(d);}
export function totals(invoice){
 const subtotal=invoice.items.reduce((sum,item)=>sum+Math.round(item.quantity*item.rate),0);
 const discount=Math.min(subtotal,Math.max(0,invoice.discount||0));
 const tax=Math.round((subtotal-discount)*(invoice.tax||0)/100);
 const total=subtotal-discount+tax;
 const paid=(invoice.payments||[]).reduce((sum,p)=>sum+p.amount,0);
 return {subtotal,discount,tax,total,paid,balance:Math.max(0,total-paid)};
}
export function invoiceStatus(invoice,today=isoDate()){
 if(!invoice.issued)return 'Draft';
 const t=totals(invoice);if(t.balance===0)return 'Paid';
 if(invoice.due<today)return 'Overdue';
 if(t.paid>0)return 'Part paid';
 return 'Outstanding';
}
export function addPayment(invoice,amount,date){
 if(!invoice.issued)throw new Error('Issue this invoice before recording a payment.');
 if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Enter a payment greater than zero.');
 if(amount>totals(invoice).balance)throw new Error('Payment cannot exceed the outstanding balance.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00')))throw new Error('Choose a valid payment date.');
 return {...invoice,payments:[...(invoice.payments||[]),{amount,date}]};
}
export function projectProgress(project){return project.tasks.length?Math.round(project.tasks.filter(t=>t.done).length/project.tasks.length*100):0;}
export function csv(rows){return rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
export function seed(now=new Date()){
 const d=days=>offsetDate(days,now);
 const clients=[
 {id:'c1',name:'Olive & Oak',contact:'Maya Collins',email:'maya@example.com',company:'Home & lifestyle',status:'Active',notes:'Website redesign and a new product collection.',color:'olive'},
 {id:'c2',name:'Forma Architecture',contact:'Daniel Reed',email:'daniel@example.com',company:'Architecture',status:'Active',notes:'A calm, image-led portfolio for their practice.',color:'purple'},
 {id:'c3',name:'Sunday Coffee',contact:'Alex Morgan',email:'alex@example.com',company:'Food & beverage',status:'Active',notes:'Brand refresh and packaging artwork.',color:'orange'},
 {id:'c4',name:'Luma Wellness',contact:'Priya Shah',email:'priya@example.com',company:'Health & wellness',status:'Lead',notes:'Discovery call planned for next week.',color:'pink'},
 {id:'c5',name:'Coast Collective',contact:'Jordan Lee',email:'jordan@example.com',company:'Creative studio',status:'Active',notes:'Monthly design support.',color:'blue'},
 {id:'c6',name:'Arc Supply',contact:'Noah Hayes',email:'noah@example.com',company:'Retail',status:'Archived',notes:'Previous brand identity project.',color:'slate'}];
 const task=(id,title,done=false)=>({id,title,done});
 const projects=[
 {id:'p1',name:'A new home for Olive & Oak',clientId:'c1',status:'In progress',budget:480000,due:d(8),description:'A responsive storefront with a considered, editorial feel.',tasks:[task('t1','Discovery & content plan',true),task('t2','Desktop design',true),task('t3','Mobile design',true),task('t4','Build core pages',true),task('t5','Product collection pages'),task('t6','Testing & launch')]},
 {id:'p2',name:'Forma portfolio website',clientId:'c2',status:'Review',budget:320000,due:d(3),description:'A project-led website for an architecture practice.',tasks:[task('t7','Sitemap & wireframes',true),task('t8','Visual direction',true),task('t9','Build project pages',true),task('t10','Client review'),task('t11','Final handover')]},
 {id:'p3',name:'Sunday, reimagined',clientId:'c3',status:'In progress',budget:240000,due:d(14),description:'A refreshed identity and packaging system.',tasks:[task('t12','Brand workshop',true),task('t13','Identity concepts',true),task('t14','Packaging artwork'),task('t15','Brand guidelines')]},
 {id:'p4',name:'Monthly design partnership',clientId:'c5',status:'Planning',budget:160000,due:d(21),description:'A flexible month of design and web support.',tasks:[task('t16','Agree monthly priorities'),task('t17','First delivery'),task('t18','Monthly review')]},
 {id:'p5',name:'Arc identity system',clientId:'c6',status:'Complete',budget:180000,due:d(-35),description:'Completed identity and web guidelines.',tasks:[task('t19','Identity',true),task('t20','Guidelines',true),task('t21','Handover',true)]}];
 const invoices=[
 {id:'i1',number:'INV-2026-014',clientId:'c1',projectId:'p1',issued:true,date:d(-20),due:d(-3),tax:0,discount:0,items:[{description:'Website design — first milestone',quantity:1,rate:240000}],payments:[],notes:'First project milestone.'},
 {id:'i2',number:'INV-2026-015',clientId:'c2',projectId:'p2',issued:true,date:d(-12),due:d(6),tax:0,discount:0,items:[{description:'Portfolio website',quantity:1,rate:320000}],payments:[{amount:160000,date:d(-10)}],notes:'Balance due after the review.'},
 {id:'i3',number:'INV-2026-016',clientId:'c3',projectId:'p3',issued:true,date:d(-5),due:d(12),tax:0,discount:0,items:[{description:'Brand refresh — design milestone',quantity:1,rate:120000}],payments:[],notes:''},
 {id:'i4',number:'INV-2026-013',clientId:'c5',projectId:'p4',issued:true,date:d(-26),due:d(-12),tax:0,discount:0,items:[{description:'Monthly design support',quantity:1,rate:160000}],payments:[{amount:160000,date:d(-16)}],notes:''},
 {id:'i5',number:'INV-2026-012',clientId:'c6',projectId:'p5',issued:true,date:d(-45),due:d(-31),tax:0,discount:0,items:[{description:'Brand identity system',quantity:1,rate:180000}],payments:[{amount:180000,date:d(-34)}],notes:''},
 {id:'i6',number:'INV-2026-017',clientId:'c1',projectId:'p1',issued:false,date:d(0),due:d(21),tax:0,discount:0,items:[{description:'Website development — final milestone',quantity:1,rate:240000}],payments:[],notes:'Review before issuing.'}];
 return {settings:{studio:'North Studio',owner:'Alex Carter',email:'hello@example.com',address:'Independent design & development'},clients,projects,invoices,activity:[{id:'a1',type:'invoice',text:'Invoice INV-2026-017 saved as a draft',at:new Date(now).toISOString()},{id:'a2',type:'project',text:'Forma portfolio website moved to Review',at:new Date(new Date(now)-3600000).toISOString()},{id:'a3',type:'client',text:'Luma Wellness added as a new lead',at:new Date(new Date(now)-7200000).toISOString()}]};
}
