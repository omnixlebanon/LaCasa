const test=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');const {wrap}=require('../config/postgres');
const {getPaidPayrollCosts,paymentTimestamp}=require('../services/payrollCostService');
test('sales payroll uses saved paid amounts, excludes unpaid, and does not duplicate adjusted payments',async()=>{
 const engine=new PGlite();const db=wrap({async query(config){const r=await engine.query(config.text,config.values);return {...r,rowCount:r.affectedRows??r.rows.length};}});
 try{
  await engine.exec(`CREATE TABLE users(user_id integer PRIMARY KEY,user_name text,access_level text DEFAULT 'employee');CREATE TABLE employee_payroll_payments(user_id integer,salary_month date,status text,amount_paid numeric,paid_at timestamp);INSERT INTO users(user_id,user_name) VALUES(1,'Cashier'),(2,'Other');INSERT INTO employee_payroll_payments VALUES(1,'2026-08-01','paid',550.25,'2026-09-02 12:00:00'),(2,'2026-08-01','unpaid',600,NULL);`);
  let rows=await getPaidPayrollCosts(db);assert.equal(rows.length,1);assert.equal(Number(rows[0].amount_paid),550.25);
  await db.execute("UPDATE employee_payroll_payments SET amount_paid = 600 WHERE user_id = 1");
  rows=await getPaidPayrollCosts(db);assert.equal(rows.length,1);assert.equal(Number(rows[0].amount_paid),600);
  await db.execute("UPDATE employee_payroll_payments SET status = 'unpaid' WHERE user_id = 1");assert.equal((await getPaidPayrollCosts(db)).length,0);
  assert.equal(paymentTimestamp('2026-09-30T21:30:00Z'),'2026-10-01 00:30:00');assert.throws(()=>paymentTimestamp('invalid'));
 }finally{await engine.close();}
});
