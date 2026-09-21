require('dotenv').config();
if (process.env.DATABASE_URL) {
    module.exports = require('./postgres').createDatabase();
} else {
const mysql = require('mysql2/promise');

const db_config = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    queueLimit: 0
});

module.exports = db_config;
}
