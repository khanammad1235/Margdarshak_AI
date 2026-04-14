const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

// Connect to MongoDB Atlas
connectDB();

// Middleware: Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Middleware: Enable CORS
app.use(cors());

// Routes
app.use('/api', require('./routes/apiRoutes'));

// Root endpoint
app.get('/', (req, res) => {
  res.send('Margdarshak AI Backend is Running...');
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
