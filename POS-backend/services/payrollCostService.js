async function getPaidPayrollCosts(connection) {
 const [rows]=await connection.execute(`SELECT p.user_id, u.user_name AS employee_name, p.salary_month, p.amount_paid, p.paid_at
 FROM employee_payroll_payments p JOIN users u ON u.user_id = p.user_id
 WHERE u.access_level IN ('employee','payroll_only','manager') AND p.status = 'paid' AND p.paid_at IS NOT NULL ORDER BY p.paid_at DESC, p.user_id`);
 return rows;
}
function paymentTimestamp(value) {
 const date=value?new Date(value):new Date();
 if(!Number.isFinite(date.getTime()))throw Object.assign(Error('Invalid payment time.'),{status:400});
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:process.env.APP_TIMEZONE||'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
module.exports={getPaidPayrollCosts,paymentTimestamp};
