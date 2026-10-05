const express = require('express');
const dotenv = require('dotenv')
const cors = require('cors');
const cookieParser = require('cookie-parser');

const seating_routes= require('./routes/tablesRout')
const auth_routes = require('./routes/authRout')
const stock_routes = require('./routes/stockRout');
const product_routes = require('./routes/productRout');
const history_routes = require('./routes/historyRout');
const employee_routes = require('./routes/employeeRout');
const workflow_routes = require('./routes/workflowRout');
const payroll_routes = require('./routes/payrollRout');
const { verifyToken } = require('./middleware/auth');




dotenv.config()
const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    exposedHeaders: ['X-Sync-Revision']
}));
// Stay below Vercel's 4.5 MB request limit, including the JSON envelope.
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser())

app.use('/api/public', require('./routes/publicMenuRout'));
app.use('/api/auth', auth_routes)
app.use(require('./middleware/disabledChatbot'));
app.use('/api', verifyToken, require('./middleware/durableSync'));
app.get('/api/offline/revision', (req,res) => res.json({ ready: true }));
app.get('/api/offline/operations/:id', async (req,res,next) => {
    try { const [[row]] = await require('./config/database').query('SELECT owner_id FROM offline_sync_operations WHERE operation_id = ?', [req.params.id]); res.json({ applied: !!row && row.owner_id === String(req.user.user_id) }); }
    catch(error) { next(error); }
});
app.get('/api/offline/batches', async (req,res,next) => {
    try { const [rows] = await require('./config/database').query('SELECT batch_id, item_id, batch_stock, batch_exDate FROM batches WHERE batch_stock > 0'); res.json(rows); }
    catch (error) { next(error); }
});
app.use('/api', seating_routes)
app.use('/api', require('./routes/settingsRout'));
app.use('/api', require('./routes/openOrdersRout').router);
app.use('/api', stock_routes);
app.use('/api', product_routes);
app.use('/api', history_routes);
app.use('/api', employee_routes);
app.use('/api', workflow_routes.managementRouter);
app.use('/api', payroll_routes);
app.use('/api', require('./routes/expenseRout'));
app.use('/api', (req,res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large. Use a smaller image (request limit: 4 MB).' });
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong on the server!' });
});

module.exports = app;
if (require.main === module) {
    const port = Number(process.env.PORT || 8080);
    app.listen(port, () => console.log(`Server running on port ${port}`));
}
