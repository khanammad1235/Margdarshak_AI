// middleware/studentMiddleware.js
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const Student = require('../models/Student');

const protectStudent = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      console.log("Token received:", token);

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

      // Get student from the token
      req.student = await Student.findById(decoded.id).select('-password');
      
      if (!req.student) {
        return res.status(401).json({
          code: "1",
          message: "Student not found"
        });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({
        code: "1",
        message: "Not authorized, invalid token"
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      code: "1",
      message: "Not authorized, no token provided"
    });
  }
});

module.exports = { protectStudent };