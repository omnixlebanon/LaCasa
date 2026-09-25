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
    credentials: true
}));
// Stay below Vercel's 4.5 MB request limit, including the JSON envelope.
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser())

app.use('/api/auth', auth_routes)
app.use('/api/bot', workflow_routes.botRouter);
app.use('/api',verifyToken,seating_routes)
app.use('/api',verifyToken, stock_routes);
app.use('/api',verifyToken, product_routes);
app.use('/api',verifyToken, history_routes);
app.use('/api', verifyToken, employee_routes);
app.use('/api', verifyToken, workflow_routes.managementRouter);
app.use('/api', verifyToken, payroll_routes);
app.use('/api', verifyToken, require('./routes/expenseRout'));
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
