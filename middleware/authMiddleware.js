const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if ( 
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
 console.log("token", token)

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');
// console.log(req.user)
      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Not authorized');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

// Middleware to authorize based on roles
const authorize = (...roles) => {
  return (req, res, next) => {
    console.log(req.user)
    if (!req.user || !roles.includes(req.user.role)) {
      
      console.log(req.user)
      res.status(403);
      throw new Error('User role not authorized to access this route');
    }
    next();
  };
};

const multer = require('multer');

const upload = multer({
  dest: 'uploads/', // temp storage
});
module.exports = { protect, authorize, upload };
