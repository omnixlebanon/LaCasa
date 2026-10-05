const bcrypt=require('bcrypt');
const {assertChange,canManage,roles}=require('./accessPolicy');
async function saveAccount(connection,actor,id,data){
 let current;
 if(id!==null){const [[row]]=await connection.execute('SELECT user_id,access_level FROM users WHERE user_id = ? FOR UPDATE',[id]);if(!row)throw Object.assign(Error('Employee not found.'),{status:404});current=row;}
 const role=data.accessLevel||current?.access_level||'employee';
 if (!current && role === 'payroll_only') {
  data = { ...data, email: data.email || `payroll-${require('crypto').randomUUID()}@employee.invalid`, password: require('crypto').randomUUID(), position: data.position || 'Normal Employee' };
 }
 assertChange(actor.access_level,current?.access_level,role,!current);
 if(current&&Number(current.user_id)===Number(actor.user_id)&&role!==current.access_level)throw Object.assign(Error('An administrator cannot change their own access level.'),{status:403});
 if(role==='owner'){
  const [owners]=await connection.execute("SELECT user_id FROM users WHERE access_level = 'owner' FOR UPDATE");
  if(owners.some(owner=>Number(owner.user_id)!==Number(id)))throw Object.assign(Error('Only one Owner account is allowed.'),{status:409});
 }
 if(!current&&![data.name,data.email,data.password,data.position].every(value=>typeof value==='string'&&value.trim()))throw Object.assign(Error('Name, email, password and position are required.'),{status:400});
 const fields=[],values=[];
 for(const [key,column,max]of [['name','user_name',30],['email','user_email',100],['position','user_position',50]]){
  if(data[key]===undefined)continue;
  if(typeof data[key]!=='string'||!data[key].trim()||data[key].trim().length>max)throw Object.assign(Error(`Enter a valid ${key} (up to ${max} characters).`),{status:400});
  fields.push(column);values.push(key==='email'?data[key].trim().toLowerCase():data[key].trim());
 }
 fields.push('access_level');values.push(role);
 if(data.password){if(typeof data.password!=='string')throw Object.assign(Error('Invalid password.'),{status:400});fields.push('user_password_hash');values.push(await bcrypt.hash(data.password,12));}
 if(current){await connection.execute(`UPDATE users SET ${fields.map(field=>field+' = ?').join(',')} WHERE user_id = ?`,[...values,id]);return {success:true};}
 const [result]=await connection.execute(`INSERT INTO users (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,values);return {user_id:result.insertId};
}
async function deleteAccount(connection,actor,id){
 const [[row]]=await connection.execute('SELECT user_id,access_level FROM users WHERE user_id = ? FOR UPDATE',[id]);
 if(!row)throw Object.assign(Error('Employee not found.'),{status:404});
 if(!canManage(actor.access_level,row.access_level))throw Object.assign(Error('You cannot delete this account.'),{status:403});
 if(Number(id)===Number(actor.user_id))throw Object.assign(Error('You cannot delete your own account.'),{status:400});
 await connection.execute('DELETE FROM users WHERE user_id = ?',[id]);return {success:true};
}
module.exports={saveAccount,deleteAccount};
