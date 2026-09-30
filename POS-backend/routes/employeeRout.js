const sql = require('../config/dialect');
const express = require('express');
const db = require('../config/database');
const { requireManagement } = require('../middleware/auth');
const { databaseToday, listShifts } = require('../services/schedulingService');
const { shiftInput, weekdays, validDate, badRequest } = require('../services/schedulingRules');

const router = express.Router();
const {management}=require('../services/accessPolicy');
// An occurrence created offline is addressed by its repeating rule and date
// until the server materializes its permanent shift ID.
async function resolveShiftId(value) {
  const match = /^(\d+):(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (!match) return value;
  const rows = await listShifts(match[2], match[2]);
  const shift = rows.find(row => Number(row.recurrence_id) === Number(match[1]));
  if (!shift) throw Object.assign(new Error('Repeating shift occurrence no longer exists.'), { status: 409 });
  return shift.shift_id;
}

router.get('/employees', async(req,res)=>{
 try{
  // Employees may create colleagues, but do not receive the management directory.
  if(!management(req.user.access_level))return res.json([]);
  const [rows]=await db.execute(`SELECT user_id,user_name,user_email,user_position,access_level,created_at FROM users ${req.user.access_level==='admin'?'':"WHERE access_level <> 'admin'"} ORDER BY user_name`);
  res.json(rows);
 }catch(error){res.status(500).json({error:error.message});}
});
async function accountWrite(req,res,kind){
 let connection;
 try{
  connection=await db.getConnection();await connection.beginTransaction();
  const service=require('../services/employeeAccountService');
  const result=kind==='delete'?await service.deleteAccount(connection,req.user,req.params.id):await service.saveAccount(connection,req.user,kind==='create'?null:req.params.id,req.body);
  await connection.commit();res.status(kind==='create'?201:200).json(result);
 }catch(error){if(connection)await connection.rollback();res.status(error.code==='ER_DUP_ENTRY'?409:error.status||500).json({error:error.code==='ER_DUP_ENTRY'?'Name, email or Owner account already exists.':error.message});}finally{connection?.release();}
}
router.post('/employees',(req,res)=>accountWrite(req,res,'create'));
router.patch('/employees/:id',(req,res)=>accountWrite(req,res,'edit'));
router.delete('/employees/:id',(req,res)=>accountWrite(req,res,'delete'));

router.get('/shifts', async (req, res) => {
  try {
    const today = await databaseToday();
    const from = req.query.from || `${today.slice(0, 7)}-01`;
    const to = req.query.to || new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
    res.json(await listShifts(from, to, management(req.user.access_level) ? null : req.user.user_id,req.user.access_level==='admin'));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/shifts', requireManagement, async (req, res) => {
  try {
    const { userId, date, startTime, endTime, notes } = shiftInput(req.body);
    const [result] = await db.execute(
      'INSERT INTO shifts (user_id, shift_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?)',
      [userId, date, startTime, endTime, notes]
    );
    res.status(201).json({ shift_id: result.insertId });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.patch('/shifts/:id', requireManagement, async (req, res) => {
  let connection;
  try {
    const input = shiftInput(req.body);
    req.params.id = await resolveShiftId(req.params.id);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[shift]] = await connection.execute('SELECT shift_id, recurrence_id, shift_date FROM shifts WHERE shift_id = ? AND cancelled_at IS NULL FOR UPDATE', [req.params.id]);
    if (!shift) throw Object.assign(new Error('Shift not found.'), { status: 404 });
    const [[checkin]] = await connection.execute(`SELECT request_id FROM workflow_requests WHERE request_type = 'shift_checkin'
      AND status IN ('pending', 'approved') AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.shiftId'))`, `(payload ->> 'shiftId')`)} = ? LIMIT 1`, [String(shift.shift_id)]);
    if (checkin) throw Object.assign(new Error('A shift with a pending or approved check-in cannot be edited.'), { status: 409 });
    let shiftId = shift.shift_id;
    if (shift.recurrence_id && input.date !== String(shift.shift_date).slice(0, 10)) {
      // Keep the original occurrence as cancelled so calendar expansion cannot recreate it.
      await connection.execute('UPDATE shifts SET cancelled_at = CURRENT_TIMESTAMP WHERE shift_id = ?', [shiftId]);
      const [result] = await connection.execute('INSERT INTO shifts (user_id, shift_date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?)',
        [input.userId, input.date, input.startTime, input.endTime, input.notes]);
      shiftId = result.insertId;
    } else {
      await connection.execute('UPDATE shifts SET user_id = ?, shift_date = ?, start_time = ?, end_time = ?, notes = ? WHERE shift_id = ?',
        [input.userId, input.date, input.startTime, input.endTime, input.notes, shiftId]);
    }
    await connection.commit();
    res.json({ success: true, shift_id: shiftId });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

router.delete('/shifts/:id', requireManagement, async (req, res) => {
  let connection;
  try {
    req.params.id = await resolveShiftId(req.params.id);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[shift]] = await connection.execute('SELECT shift_id FROM shifts WHERE shift_id = ? AND cancelled_at IS NULL FOR UPDATE', [req.params.id]);
    if (!shift) throw Object.assign(new Error('Shift not found.'), { status: 404 });
    const [[checkin]] = await connection.execute(`SELECT request_id FROM workflow_requests WHERE request_type = 'shift_checkin'
      AND status IN ('pending', 'approved') AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.shiftId'))`, `(payload ->> 'shiftId')`)} = ? LIMIT 1`, [String(shift.shift_id)]);
    if (checkin) throw Object.assign(new Error('A shift with a pending or approved check-in cannot be removed.'), { status: 409 });
    await connection.execute('UPDATE shifts SET cancelled_at = CURRENT_TIMESTAMP WHERE shift_id = ?', [shift.shift_id]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

router.post('/recurring-shifts', requireManagement, async (req, res) => {
  try {
    const shift = shiftInput(req.body);
    const days = weekdays(req.body.weekdays);
    const [result] = await db.execute(`INSERT INTO recurring_shifts (user_id, starts_on, weekdays, start_time, end_time, notes)
      VALUES (?, ?, ?, ?, ?, ?)`, [shift.userId, shift.date, JSON.stringify(days), shift.startTime, shift.endTime, shift.notes]);
    res.status(201).json({ recurrence_id: result.insertId });
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.get('/recurring-shifts', async (req, res) => {
  try {
    const isAdmin = management(req.user.access_level);
    const [rows] = await db.execute(`SELECT r.*, u.user_name FROM recurring_shifts r JOIN users u ON u.user_id = r.user_id
      WHERE (r.stopped_from IS NULL OR r.stopped_from > CURRENT_DATE) ${isAdmin ? '' : 'AND r.user_id = ?'} ${req.user.access_level==='admin'?'':"AND u.access_level <> 'admin'"} ORDER BY u.user_name, r.start_time`, isAdmin ? [] : [req.user.user_id]);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.patch('/recurring-shifts/:id/stop', requireManagement, async (req, res) => {
  let connection;
  try {
    const from = req.body?.from;
    if (!validDate(from) || from < await databaseToday()) throw badRequest('Stop date must be today or later.');
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [[rule]] = await connection.execute('SELECT * FROM recurring_shifts WHERE recurrence_id = ? FOR UPDATE', [req.params.id]);
    if (!rule) throw Object.assign(new Error('Repeating schedule not found.'), { status: 404 });
    const stopDate = rule.stopped_from && rule.stopped_from < from ? rule.stopped_from : from;
    await connection.execute('UPDATE recurring_shifts SET stopped_from = ? WHERE recurrence_id = ?', [stopDate, rule.recurrence_id]);
    await connection.execute(`UPDATE shifts s SET cancelled_at = CURRENT_TIMESTAMP WHERE recurrence_id = ? AND shift_date >= ? AND cancelled_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM workflow_requests r WHERE r.request_type = 'shift_checkin' AND r.status IN ('pending', 'approved')
        AND ${sql(`JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.shiftId'))`, `(r.payload ->> 'shiftId')`)} = ${sql(`CAST(s.shift_id AS CHAR)`, `CAST(s.shift_id AS TEXT)`)})`, [rule.recurrence_id, stopDate]);
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(error.status || 500).json({ error: error.message });
  } finally { connection?.release(); }
});

module.exports = router;
