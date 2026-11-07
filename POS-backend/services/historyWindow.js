function historyWindow(query, column) {
 const clauses=[],values=[];
 if(query.recent==='1'){clauses.push(`${column} >= ?`);values.push(new Date(Date.now()-90*86400000).toISOString().slice(0,10));}
 for(const [name,operator] of [['from','>='],['to','<']])if(query[name]){
  const date=String(query[name]);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Object.assign(Error('Choose valid history dates.'),{status:400});
  clauses.push(`${column} ${operator} ?`);
  values.push(name==='to'?new Date(Date.parse(date)+86400000).toISOString().slice(0,10):date);
 }
 let page='';
 if(query.limit!==undefined){
  const limit=Number(query.limit),offset=Number(query.offset||0);
  if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('Invalid history page.'),{status:400});
  page=' LIMIT ? OFFSET ?';values.push(limit,offset);
 }
 return {where:clauses.length?'WHERE '+clauses.join(' AND '):'',page,values};
}
module.exports=historyWindow;
