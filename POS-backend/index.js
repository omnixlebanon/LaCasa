// index.js
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware to allow frontend access and parse JSON data
app.use(cors());
app.use(express.json());

// Base Route
app.get('/', (req, res) => {
    res.send('Backend server is running successfully!');
});

// Sample API Route for testing
app.get('/api/users', (req, res) => {
    const users = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
    ];
    res.json(users);
});

// Start listening for incoming requests
app.listen(PORT, () => {
    console.log(`Server is live at http://localhost:${PORT}`);
});
