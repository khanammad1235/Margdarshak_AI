const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const OTP = require('../models/otp');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { generateToken } = require('../utils/tokenUtils');
const notificationService = require('../services/notificationService');

// @desc    Send OTP to a user's email/mobile
// @route   POST /api/auth/send-otp
// @access  Public
const createOtp = asyncHandler(async (req, res) => {
  try {
    const { emailID, mobileNo} = req.body;
    console.log(req.body)

  if (!emailID && !mobileNo) {
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

// const verifyOtp = asyncHandler(async (req, res) => {
//   const { otp, emailID } = req.body;

//   if (!otp || !emailID) {
//     res.status(400);
//     throw new Error('OTP and Email ID are required');
//   }

//   const otpRef = await OTP.findOne({ emailID });

//   if (!otpRef || otpRef.otp.toString() !== otp.toString()) {
//     res.status(400);
//     throw new Error('Invalid verification code');
//   }

//   // CHECK IF USER OR ORG ALREADY EXISTS TO PREVENT DUPLICATES
//   const userExists = await User.findOne({ emailID: emailID.toLowerCase() });
//   if (userExists) {
//     res.status(400);
//     throw new Error('User already exists');
//   }

//   // Verification successful! We now CREATE the Organization and User admin.
//   const newOrgRef = "ORG_" + Math.floor(100 + Math.random() * 900);
  
//   // Hash the password
//   const salt = await bcrypt.genSalt(10);
//   const hashedPassword = await bcrypt.hash(otpRef.password || "defaultPass123", salt);

//   const org = await Organization.create({
//     orgID: newOrgRef,
//     name: otpRef.name || "Default Org Name",
//     address: {
//       lineAddress1: otpRef.address1 || 'Not Provided',
//       city: otpRef.city || 'Not Provided',
//       state: otpRef.state || 'Not Provided',
//       pincode: Number(otpRef.pinCode) || 0,
//       country: "India"
//     },
//     mobileNo: Number(otpRef.phnNO) || 0,
//     emailID: otpRef.emailID,
//     orgType: otpRef.orgType || "School",
//     numofbranches: 1, // fallback default
//     password: hashedPassword,
//     createdBy: "SELF_REGISTER"
//   });

//   const user = await User.create({
//     userID: "U_" + Math.floor(1000 + Math.random() * 9000),
//     name: otpRef.name || "Admin",
//     emailID: otpRef.emailID.toLowerCase(),
//     password: hashedPassword,
//     role: 'ORG_ADMIN',
//     organizationID: org._id,
//     mobileNo: Number(otpRef.phnNO) || 0,
//     createdBy: "SELF_REGISTER",
//   });

//   // Instead of deleting the OTP record, we mark it as verified
//   // so you can keep the record in MongoDB! It will auto-expire after 5 minutes.
//   otpRef.verified = true;
//   await otpRef.save();

//   const token = generateToken(user._id);

//   res.status(200).json({
//     message: 'Organization verified and registered successfully',
//     _id: org._id,
//     token: token
//   });
// });
const verifyOtp = async (otp, emailID, mobileNo) => {
  
console.log(otp, emailID, mobileNo);
  if (!otp || !emailID || !mobileNo) {
    return false
  }

  const otpRef = await OTP.findOne({ emailID: emailID, otp: otp, mobileNo: mobileNo });
console.log(otpRef)
  if (!otpRef) {
    return false
  }
 return true
  // CHECK IF USER OR ORG ALREADY EXISTS TO PREVENT 
};


const verifyOtpForStudent = asyncHandler(async (req, res) => {
  const { otp, loginID } = req.body;
  
  console.log("Verifying OTP for student:", { otp, loginID });
  
  if (!otp || !loginID) {
    return res.status(400).json({
      code: "1",
      message: "OTP and loginID are required"
    });
  }
  
  // Find the OTP record
  const otpRecord = await OTP.findOne({
    otp: otp,
    $or: [
      { emailID: loginID },
      { mobileNo: loginID }
    ]
  });
  
  if (!otpRecord) {
    return res.status(400).json({
      code: "1",
      message: "Invalid or expired OTP"
    });
  }
  
  // Delete the used OTP
  await OTP.deleteOne({ _id: otpRecord._id });
  
  return res.status(200).json({
    code: "0",
    message: "OTP verified successfully"
  });
});

// Update exports
module.exports = {
  createOtp,
  verifyOtp,
  verifyOtpForStudent  // Add this
};


module.exports = {
  createOtp,
  verifyOtp,
  verifyOtpForStudent
};