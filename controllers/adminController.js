const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Student = require('../models/Student');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../utils/tokenUtils');
const OTP = require('../models/otp');


// @desc    Create a new Organization
// @route   POST /api/admin/orgs
// @access  Private (SystemAdmin Only)
const createOrganization = asyncHandler(async (req, res) => {
  const { name, address, mobileNo, emailID, orgType, numOfBranches, password, otp } = req.body;
 console.log(req.body)
  try {
    if (!name || !mobileNo || !emailID || !orgType || !numOfBranches || !password || !otp) {
      res.status(500).json({
        "code": "1",
        "message": "Please add all mandatory fields"
      });
    }
    //api or function to verifyu otp  
    const verifyOtpResponse = await verifyOtp(otp, emailID, mobileNo)

    if (!verifyOtpResponse) {
      res.status(500).json({
        "code": "1",
        "message": "Invalid OTP"
      });
    }
    console.log(verifyOtpResponse, "verifyOtpResponse");
    const userExists = await User.findOne({ emailID: emailID.toLowerCase() });
    if (userExists) {
      res.status(500).json({
        "code": "1",
        "message": "User with this email already exists"
      });
    }
  
    console.log(userExists, "userExists");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newOrgRef = "ORG_" + Math.floor(100 + Math.random() * 900);


    const organization = await Organization.create({
      orgID: newOrgRef,
      name,
      address,
      mobileNo,
      emailID,
      orgType,
      numOfBranches,
      password: hashedPassword, // Hashed password  
      createdBy: "SELF_REGISTER"
    });
    const user = await User.create({
      userID: "U_" + Math.floor(1000 + Math.random() * 9000),
      name: name,
      emailID: emailID.toLowerCase(),
      password: hashedPassword,
      role: 'ORG_ADMIN',
      organizationID: organization._id.toString(),
      organizationType: orgType,
      mobileNo: mobileNo,
      createdBy: "SELF_REGISTER",
    });
    const token = generateToken(user._id);
    // user create
    return res.status(200).json({
      code: "0",
      message: "Organization created successfully",
    orgId: organization._id,
      token: token
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      code: "1",
      message:"Error"
    });
  }
});

const getAllOrganizations = asyncHandler(async (req, res) => {
  const organizations = await Organization.find({ isDeleted: false });
  res.status(200).json(organizations);
});

const createBranch = asyncHandler(async (req, res) => {
  const { branchID, type, name, boards, address, mobileNo, emailID, organizationID } = req.body;
 console.log(req.user)
 console.log(req.body)

  if (!branchID || !organizationID|| !type || !name || !boards || !address || !mobileNo || !emailID) {
    res.status(500).json({
      "code": "1",
      "message": "Please add all mandatory fields"
    });
  }

  // Ensure user has access to this organization if they are OrAdmin
  if (req.user.role === 'ORG_ADMIN' && req.user.organizationID.toString() !== organizationID) {
    res.status(500).json({
      "code": "1",
      "message": "Not authorized to add branches to this organization"
    });
    return;
  }

  const branch = await Branch.create({
    branchID,
    organizationID,
    type,
    name,
    boards,
    address,
    mobileNo,
    emailID,
    createdBy: req.user._id
  });

  res.status(201).json({
    code: "0",
    message: "Branch created successfully",
    data: branch
  });
});

// @desc    List all branches under the user's Org
// @route   GET /api/org/branches
// @access  Private (OrgAdmin or Higher)
const getOrgBranches = asyncHandler(async (req, res) => {
  let filter = { isDeleted: false };

  if (req.user.role === 'ORG_ADMIN') {
    filter.organizationID = req.user.organizationID;
  }

  const branches = await Branch.find(filter).populate('organizationID', 'name');
  res.status(200).json({
    code: "0",
    message: "success",
    data: branches
  });
});

// @desc    Update a branch
// @route   PUT /api/org/branches/:id
// @access  Private (OrgAdmin or Higher)
const updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { branchID, type, name, boards, address, mobileNo, emailID, organizationID } = req.body;

  // Find the branch
  const branch = await Branch.findById(id);
  
  if (!branch) {
    res.status(500).json({
      "code": "1",
      "message": "Branch not found"
    });
    return;
  }

  // Ensure user has access to this branch
  if (req.user.role === 'ORG_ADMIN') {
    if (req.user.organizationID.toString() !== branch.organizationID.toString()) {
      res.status(500).json({
        "code": "1",
        "message": "Not authorized to update branches of this organization"
      });
      return;
    }
  }

  // If organizationID is being updated, verify permissions
  if (organizationID && req.user.role === 'ORG_ADMIN') {
    if (req.user.organizationID.toString() !== organizationID) {
      res.status(403).json({
        "code": "1",
        "message": "Cannot transfer branch to another organization"
      });
      return;
    }
  }

  // Update fields
  const updatedBranch = await Branch.findByIdAndUpdate(
    id,
    {
      ...(branchID && { branchID }),
      ...(type && { type }),
      ...(name && { name }),
      ...(boards && { boards }),
      ...(address && { address }),
      ...(mobileNo && { mobileNo }),
      ...(emailID && { emailID }),
      ...(organizationID && { organizationID }),
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    code: "0",
    message: "Branch updated successfully",
    data: updatedBranch
  });
});

// @desc    Hard delete a branch (Permanent delete)
// @route   DELETE /api/org/branches/:id
// @access  Private (OrgAdmin or Higher)
const deleteBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the branch
  const branch = await Branch.findById(id);
  
  if (!branch) {
    res.status(500).json({
      "code": "1",
      "message": "Branch not found"
    });
    return;
  }

  // Ensure user has access to this branch
  if (req.user.role === 'ORG_ADMIN') {
    if (req.user.organizationID.toString() !== branch.organizationID.toString()) {
      res.status(500).json({
        "code": "1",
        "message": "Not authorized to delete branches of this organization"
      });
      return;
    }
  }

  // Permanently delete from database
  await Branch.findByIdAndDelete(id);

  res.status(200).json({
    code: "0",
    message: "Branch deleted successfully"
  });
});

// @desc    Get top-level stats for a branch
// @route   GET /api/branch/:id/analytics
// @access  Private (OrgAdmin or BranchAdmin)
const getBranchAnalytics = asyncHandler(async (req, res) => {
  const branchID = req.params.id;

  // Validation: Check if user has access to this branch
  if (req.user.role === 'BRANCH_ADMIN' && req.user.branchID.toString() !== branchID) {
    return res.status(500).json({
      "code": "1",
      "message": "Access denied to this branch analytics"
    });
  }

  // Aggregate Stats: Stream Distribution
  const streamStats = await Student.aggregate([
    { $match: { branchID: new mongoose.Types.ObjectId(branchID), isDeleted: false } },
    { $group: { _id: "$stream", count: { $sum: 1 } } }
  ]);

  // Aggregate Stats: Board Distribution
  const boardStats = await Student.aggregate([
    { $match: { branchID: new mongoose.Types.ObjectId(branchID), isDeleted: false } },
    { $group: { _id: "$board", count: { $sum: 1 } } }
  ]);

  const totalStudents = await Student.countDocuments({ branchID: branchID, isDeleted: false });

  res.status(200).json({
    branchID: branchID,
    totalStudents,
    streamStats,
    boardStats
  });
});
const createOtp = asyncHandler(async (req, res) => {
  try {
    const { emailID, mobileNo} = req.body;

  if (!emailID || !mobileNo) {
    return res.status(500).json({
    "code": "1",
    "message": "error"
  });
  
  }

  // Generate a 4-digit OTP (Hardcoded to 1234 for testing)
  const generatedOtp = "1234";


  // Temporarily store the registration payload inside the OTP record
  await OTP.create({
    otp: generatedOtp,
    emailID,
    mobileNo,
  });

  // Mock sending OTP through notification service
  // await notificationService.sendOTP(emailID, generatedOtp); 

 return res.status(200).json({
    "code": "0",
    "message": "success"
});
  } catch (error) {
      console.log(error)
    return res.status(500).json({
      "code": "1",
      "message": "error"
    });
  }
});

const verifyOtp = async (otp, emailID, mobileNo) => {
  
console.log(otp, emailID, mobileNo);
  if (!otp || (!emailID && !mobileNo)) {
    return false
  }

  // const otpRef = await OTP.findOne({ emailID: emailID, otp: otp, mobileNo: mobileNo });
  const otpRef = await OTP.findOne({
    $or: [
      { emailID: emailID, otp: otp },
      { mobileNo: mobileNo, otp: otp }
    ]
  });
console.log(otpRef)
  if (!otpRef) {
    return false
  }
 return true
  // CHECK IF USER OR ORG ALREADY EXISTS TO PREVENT 
};

module.exports = {
  createOrganization,
  getAllOrganizations,
  createBranch,
  getOrgBranches,
  getBranchAnalytics,
  createOtp,
  updateBranch,
  deleteBranch
};
