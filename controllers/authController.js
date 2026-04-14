const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../utils/tokenUtils');
const { request } = require('express');

// @desc    Authenticate a user (Legacy password login)
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { emailID, password } = req.body;
  console.log(emailID , password);
  const user = await User.findOne({ emailID: emailID.toLowerCase() });
  console.log(user);
  try {
    if (user && (await bcrypt.compare(password, user.password))) {
      return res.status(200).json({
        code:"0",
        message:"success",
        _id: user._id,
        name: user.name,
        email: user.emailID,
        role: user.role,
        organizationID: user.organizationID,
        branchID: user.branchID,
        token: generateToken(user._id),
        orgType: user.organizationType || null
      });
    } else {
      return res.status(400).json({
        code: "1",
        message: "Invalid credentials"
      });
    }
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      code: "1",
      message: "Server error"
    });
  }
} );


// @desc    Register a new user (Internal use or System Admin)
// @route   POST /api/admin/users
// @access  Private/SystemAdmin
const registerUser = asyncHandler(async (req, res) => {
  const { name, emailID, password, role, organizationID, branchID, mobileNo } = req.body;
  console.log(req.user)
  console.log(req.body)
  if (!name || !emailID || !password || !role || !mobileNo) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  const userExists = await User.findOne({ emailID });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = await User.create({
   
    name,
    emailID: emailID.toLowerCase(),
    password: hashedPassword,
    role,
    organizationID,
    branchID,
    mobileNo,
    createdBy: req.user ? req.user._id : 'SYSTEM_GEN',
  });

  if (user) {
    res.status(201).json({
      code:"0",
      message:"success",   
        _id: user._id,
      name: user.name,
      email: user.emailID,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Get user details
// @route   GET /api/admin/users/:id
// @access  Private/Admin
const getUser = asyncHandler(async (req, res) => {
  try {
    const { organizationID, branchID } = req.query;

    // If only branchID is provided → error
    if (branchID && !organizationID) {
      return res.status(400).json({
        code: "1",
        message: "organizationID is required when branchID is provided"
      });
    }

    // Find user
    // const user = await User.findById(req.params.id).select('-password');

    // if (!user) {
    //   return res.status(404).json({
    //     code: "1",
    //     message: "User not found"
    //   });
    // }

let user=[]
    // Checking organization and branch belongs
    if (organizationID && branchID) {
     user=await User.find({organizationID:organizationID, branchID:branchID}) 
    }
    else if (organizationID) {
     user=await User.find({organizationID:organizationID})
    }

    return res.status(200).json({
      code: "0",
      message: "success",
      data: user
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      code: "1",
      message: "Server error"
    });
  }
});

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin or higher)
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, emailID, role, organizationID, branchID, mobileNo, password } = req.body;
console.log(id, req.body)
  // Find the user
  const user = await User.findById(id);
  
  if (!user) {
    res.status(404).json({
      "code": "1",
      "message": "User not found"
    });
    return;
  }

  // Check if email is being changed and if it already exists
  if (emailID && emailID.toLowerCase() !== user.emailID) {
    const userExists = await User.findOne({ emailID: emailID.toLowerCase() });
    if (userExists) {
      res.status(400).json({
        "code": "1",
        "message": "Email already exists"
      });
      return;
    }
  }

  // Authorization checks based on role of logged-in user
  if (req.user.role === 'ORG_ADMIN') {
    // ORG_ADMIN can only update users within their organization
    if (user.organizationID.toString() !== req.user.organizationID.toString()) {
      res.status(403).json({
        "code": "1",
        "message": "Not authorized to update users from other organizations"
      });
      return;
    }
    
    // ORG_ADMIN cannot change user's organization
    if (organizationID && organizationID.toString() !== req.user.organizationID.toString()) {
      res.status(403).json({
        "code": "1",
        "message": "Cannot change user's organization"
      });
      return;
    }
  }

  // Prepare update data
  const updateData = {
    ...(name && { name }),
    ...(emailID && { emailID: emailID.toLowerCase() }),
    ...(role && { role }),
    ...(organizationID && { organizationID }),
    ...(branchID && { branchID }),
    ...(mobileNo && { mobileNo }),
    updatedBy: req.user._id
  };

  // If password is provided, hash it
  if (password) {
    const salt = await bcrypt.genSalt(10);
    updateData.password = await bcrypt.hash(password, salt);
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password');

  res.status(200).json({
    code: "0",
    message: "User updated successfully",
    data: updatedUser
  });
});

// @desc    Hard delete user (Permanent delete)
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin or higher)
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the user
  const user = await User.findById(id);
  
  if (!user) {
    res.status(404).json({
      "code": "1",
      "message": "User not found"
    });
    return;
  }

  // Prevent deleting self
  if (user._id.toString() === req.user._id.toString()) {
    res.status(400).json({
      "code": "1",
      "message": "Cannot delete your own account"
    });
    return;
  }

  // Authorization checks based on role of logged-in user
  if (req.user.role === 'ORG_ADMIN') {
    // ORG_ADMIN can only delete users within their organization
    if (user.organizationID.toString() !== req.user.organizationID.toString()) {
      res.status(403).json({
        "code": "1",
        "message": "Not authorized to delete users from other organizations"
      });
      return;
    }
    
    // ORG_ADMIN cannot delete other ORG_ADMIN or SUPER_ADMIN
    if (user.role === 'ORG_ADMIN' || user.role === 'SUPER_ADMIN') {
      res.status(403).json({
        "code": "1",
        "message": `Cannot delete user with role: ${user.role}`
      });
      return;
    }
  }

  // SUPER_ADMIN cannot delete another SUPER_ADMIN
  if (req.user.role === 'SUPER_ADMIN' && user.role === 'SUPER_ADMIN') {
    res.status(403).json({
      "code": "1",
      "message": "Cannot delete another Super Admin"
    });
    return;
  }

  // Permanently delete user
  await User.findByIdAndDelete(id);

  res.status(200).json({
    code: "0",
    message: "User deleted successfully"
  });
});

module.exports = {
  loginUser,
  registerUser,
  getUser,
  updateUser,
  deleteUser
};
