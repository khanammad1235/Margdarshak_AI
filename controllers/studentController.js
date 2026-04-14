const asyncHandler = require('express-async-handler');
const Student = require('../models/Student');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const fs = require('fs');
const csv = require('csv-parser');
const { default: axios } = require('axios');
const jwt = require('jsonwebtoken');
const { verify } = require('crypto');
const OTP = require('../models/otp');


// @desc    Bulk Upload Students (with automatic user creation)
// @route   POST /api/students/bulk-upload
// @access  Private (BranchAdmin or Higher)
const bulkUploadStudents = asyncHandler(async (req, res) => {
  try {
    let students = [];
    const branchID = req.body.branchID;
    const organizationID = req.user.organizationID;
console.log(" branchID", branchID)
    
console.log(req.body.students)
    // ✅ If JSON data sent
    if (req.body.students) {
      students = req.body.students; 
    }

    if (!students || students.length === 0) {
      return res.status(400).json({
        code: "1",
        message: "No student data found"
      });
    }

    let successCount = 0;
    let failedRecords = [];
console.log(students.length)
    for (let i = 0; i < students.length; i++) {
      const row = students[i];

      try {
        const {
         grNo,name, mobileNo1, mobileNo2, mobileNo3, emailID1, emailID2, emailID3, standard, division, rollNo

        } = row;

        // ❌ Required fields
        if ( !grNo || !name || !standard || !division || !emailID1 || !mobileNo1 || !branchID || !rollNo ) {
          failedRecords.push({ row: i + 1, reason: "Missing required fields" });
          continue;
        }
let emailIDs =[emailID1, emailID2, emailID3].filter(email => email); // Filter out empty emails
let mobileNos = [mobileNo1, mobileNo2, mobileNo3].filter(no => no);
      

        // ❌ Duplicate user
        if (emailIDs.length > 0) {
    const existingStudent = await Student.findOne({ emailIDs: { $in: emailIDs.map(email => email.toLowerCase()) }, isDeleted: false, branchID, organizationID });
          if (existingStudent) {
            failedRecords.push({ row: i + 1, reason: "Student already exists" });
            continue;
          }
        }
console.log(emailIDs)
        const hashedPassword = await bcrypt.hash("student123", 10);
 
         const generatedUID = await generateUID();

    const student = await Student.create({
      grNo: grNo,
      name,
      standard,
      division,
      rollNo,
      emailIDs: emailIDs.map(email => email.toLowerCase()),
      mobileNos: mobileNos.map(no => no.toString()), // Don't convert numbers to lowercase
      branchID,
      organizationID: req.user.organizationID,
      createdBy: req.user._id,
      isDeleted: false,
    
    });
        // ✅ Create User
        // await User.create({
        //   name,
        //   emailID: emailID || `${studentID}@school.com`,
        //   password: hashedPassword,
        //   role: "STUDENT",
        //   organizationID: req.user.organizationID,
        //   mobileNo: mobileNo || 0,
        //   createdBy: req.user._id
        // });

        successCount++;
console.log(successCount)
      } catch (err) {
        console.log(err)
        failedRecords.push({
          row: i + 1,
          reason: err.message
        });
      }
    }

    return res.status(200).json({
      code: "0",
      message: "Bulk upload completed",
      total: students.length,
      success: successCount,
      failed: failedRecords.length,
      errors: failedRecords
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      code: "1",
      message: "Server error"
    });
  }
});

const bulkUploadMarks = asyncHandler(async (req, res) => {
  try {
    let marksData = [];
    console.log(req.body)
    let branchID = req.body.branchID;
    let organizationID = req.user.organizationID;
    if (req.body.marksData) {
      marksData = req.body.marksData;
    }
    console.log(req.body)
    if (!marksData || marksData.length === 0) {
      return res.status(500).json({
        code: "1",
        message: "No marks data found"
      });
    }
    console.log(branchID, organizationID);
    let failedRecords = [];
    let successCount = 0;
    for (let i = 0; i < marksData.length; i++) {
      const row = marksData[i];
       const { grNo, term, year,standard, marks } = row;
      if (!grNo || !term || !year || !marks || !standard ) {
        failedRecords.push({ row: i + 1, reason: "Missing required fields" });
        continue;
    }  
    const studentRef = await Student.findOne({ grNo, isDeleted: false, branchID, organizationID });
    if (!studentRef) {
      failedRecords.push({ row: i + 1, reason: "Student not found" });
      continue;
    }
    await Student.findByIdAndUpdate(studentRef._id, {
      $push: { academicRecords: { standard, term, year, marks } }
    });
    successCount++;
    // student.academicRecords.push({ standard,term, year, marks });
    }
    console.log(successCount,failedRecords)
       return res.status(200).json({
      code: "0",
      message: "Bulk upload completed",
      total: marksData.length,
      success: successCount,
      failed: failedRecords.length,
      errors: failedRecords
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      code: "1",
      message: "Server error"
    });
  }
});

const addStudent = asyncHandler(async (req, res) => {
  try {
    const {grNo, name, standard, division, rollNo, emailIDs, mobileNos,academicRecords, branchID, address } = req.body;

    if (!grNo || !name || !standard || !division || !rollNo || emailIDs.length === 0 || mobileNos.length === 0 || !branchID || !address) {
      return res.status(400).json({
        code: "1",
        message: "Please add all required fields"
      });
    }

    const existingStudent = await Student.findOne({ grNo, isDeleted: false, branchID, organizationID: req.user.organizationID });
    if (existingStudent) {
      return res.status(400).json({
        code: "1",
        message: "Student with this grNo already exists"
      });
    }
  
    const student = await Student.create({
      grNo: grNo, // Auto-generated unique ID
      name,
      standard,
      division,
      rollNo,
      emailIDs: emailIDs.map(email => email.toLowerCase()),
      mobileNos: mobileNos.map(no => no.toString()), // Don't convert numbers to lowercase
      address: address || {},
      branchID,
      organizationID: req.user.organizationID,
      createdBy: req.user._id,
      isDeleted: false,
      academicRecords: academicRecords || []
    });

    return res.status(200).json({
      code: "0",
      message: "Student added successfully",
      data: student
    });
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      code: "1",
      message: "Server error",
      error: error.message
    });
  }
});
// @desc    Get all students in a branch
// @route   GET /api/students/branch/:branchID
// @access  Private (BranchAdmin or Higher)

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (OrgAdmin or higher)
const updateStudent = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      standard, 
      division, 
      rollNo, 
      emailIDs, 
      mobileNos, 
      academicRecords, 
      branchID ,
      address
    } = req.body;
    // Find the student by ID
    const student = await Student.findById(id);
    console.log("req.body", req.body);
    if (!student) {
      return res.status(404).json({
        code: "1",
        message: "Student not found"
      });
    }

    // Check if student is deleted
    if (student.isDeleted) {
      return res.status(400).json({
        code: "1",
        message: "Cannot update a deleted student"
      });
    }

    // // Authorization check
    // if (req.user.role === 'ORG_ADMIN' && 
    //     student.organizationID.toString() !== req.user.organizationID.toString()) {
    //   return res.status(403).json({
    //     code: "1",
    //     message: "Not authorized to update students from other organizations"
    //   });
    // }

    // Check if email IDs are being changed and if they already exist
    if (emailIDs && emailIDs.length > 0) {
      const normalizedNewEmails = emailIDs.map(email => email.toLowerCase());
      const existingStudent = await Student.findOne({
        _id: { $ne: id },
        emailIDs: { $in: normalizedNewEmails },
        isDeleted: false
      });
      
      if (existingStudent) {
        return res.status(400).json({
          code: "1",
          message: "Student with this email already exists"
        });
      }
    }

    // Prepare update data
    const updateData = {
      ...(name && { name }),
      ...(standard && { standard: Number(standard) }),
      ...(division && { division }),
      ...(rollNo && { rollNo }),
      ...(emailIDs && { emailIDs: emailIDs.map(email => email.toLowerCase()) }),
      ...(mobileNos && { mobileNos: mobileNos.map(no => no.toString()) }),
      ...(branchID && { branchID }),
      ...(academicRecords && { academicRecords }),
      ...(address && { address }),
      updatedBy: req.user._id
    };

    // Update student
    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      code: "0",
      message: "Student updated successfully",
      data: updatedStudent
    });
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      code: "1",
      message: "Server error",
      error: error.message
    });
  }
});
const generateStudentToken = (student) => {
  return jwt.sign(
    {
      id: student._id,
      grNo: student.grNo,
      role: 'student',
      standard: student.standard
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};
const studentLogin = asyncHandler(async (req, res) => {
  try {
    const loginID = req.body.loginID; // Can be email or mobile number
    console.log("loginID", loginID)
    const checkIfLoginIDExists = await Student.findOne({
  
      $or: [
        { emailIDs: { $in: [loginID] } },
        { mobileNos: { $in: [loginID] } }
      ],
      isDeleted: false
    });
if (!checkIfLoginIDExists) {
      return res.status(500).json({
        code: "1",
        message: "Student not found"
      });
    }
    const checkIfLoginIDIsEmail = checkIfLoginIDExists.emailIDs.includes(loginID);
    const checkIfLoginIDIsMobile = checkIfLoginIDExists.mobileNos.includes(loginID.toString());
    let payload = {};
    if(checkIfLoginIDIsEmail){
payload = { emailID: loginID.toLowerCase() }; 
    }else if(checkIfLoginIDIsMobile){
payload = { mobileNo: loginID.toString() };
    }
    console.log("payload", payload)
    // const sendOtp = await axios.post(`https://margdarshak-ai-sz4s.onrender.com/api/signup/create`,
      const sendOtp = await axios.post(`http://localhost:5001/api/signup/create`,
      payload 
    );
    
     const token = generateStudentToken(checkIfLoginIDExists);
return res.status(200).json({
  code: "0",
  message: "Student login successful",
  data: {
    student: checkIfLoginIDExists
  },
  token: token
})
  }
    catch (error) {
      console.error(error);
      return res.status(500).json({
        code: "1",
        message: "Server error",
        error: error.message
      });
    }
});

// @desc    Hard delete student (Permanent delete)
// @route   DELETE /api/students/:id
// @access  Private (OrgAdmin or higher)
const deleteStudent = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Find the student
    const student = await Student.findById(id);
    
    if (!student) {
      return res.status(404).json({
        code: "1",
        message: "Student not found"
      });
    }

    // Authorization check
    // if (req.user.role === 'ORG_ADMIN') {
    //   if (student.organizationID.toString() !== req.user.organizationID.toString()) {
    //     return res.status(403).json({
    //       code: "1",
    //       message: "Not authorized to delete students from other organizations"
    //     });
    //   }
    // }

    // Permanently delete student
    await Student.findByIdAndDelete(id);

    return res.status(200).json({
      code: "0",
      message: "Student deleted successfully"
    });
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      code: "1",
      message: "Server error",
      error: error.message
    });
  }
});

const studentsList = asyncHandler(async (req, res) => {
  try { 
    let filter = { isDeleted: false , organizationID: req.user.organizationID};
    // if (req.user.role !== 'SYSTEM_ADMIN' && req.user.role !== 'ORG_ADMIN') {
    //   filter.branchID = req.user.branchID;
    // }
    const students = await Student.find(filter)
    res.status(200).json({
      code: "0",
      message: "Students fetched successfully",
      data: students
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ code: "1", message: "Server error" });
  }
});

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (OrgAdmin or higher)
// const updateStudent = asyncHandler(async (req, res) => {
//   const { id } = req.params;
//   const { studentID, name, standard, board, stream, marks, emailid, mobileno } = req.body;

//   // Find the student
//   const student = await Student.findById(id);
  
//   if (!student) {
//     res.status(404).json({
//       "code": "1",
//       "message": "Student not found"
//     });
//     return;
//   }

//   // Check if student is deleted
//   if (student.isDeleted) {
//     res.status(400).json({
//       "code": "1",
//       "message": "Cannot update a deleted student"
//     });
//     return;
//   }

//   // Authorization checks
//   if (req.user.role === 'ORG_ADMIN') {
//     // ORG_ADMIN can only update students within their organization
//     if (student.organizationID.toString() !== req.user.organizationID.toString()) {
//       res.status(403).json({
//         "code": "1",
//         "message": "Not authorized to update students from other organizations"
//       });
//       return;
//     }
//   }

//   // Check if email is being changed and if it already exists
//   if (emailid && emailid.toLowerCase() !== student.emailid.toLowerCase()) {
//     const existingStudent = await Student.findOne({ 
//       emailid: emailid.toLowerCase(),
//       isDeleted: false 
//     });
//     if (existingStudent) {
//       res.status(400).json({
//         "code": "1",
//         "message": "Email already exists"
//       });
//       return;
//     }
//   }

//   // Check if studentID is being changed and if it already exists
//   if (studentID && studentID !== student.studentID) {
//     const existingStudent = await Student.findOne({ 
//       studentID: studentID,
//       isDeleted: false 
//     });
//     if (existingStudent) {
//       res.status(400).json({
//         "code": "1",
//         "message": "Student ID already exists"
//       });
//       return;
//     }
//   }

//   // Prepare update data
//   const updateData = {
//     ...(studentID && { studentID }),
//     ...(name && { name }),
//     ...(standard && { standard: Number(standard) }),
//     ...(board && { board }),
//     ...(stream && { stream }),
//     ...(emailid && { emailid: emailid.toLowerCase() }),
//     ...(mobileno && { mobileno }),
//     updatedBy: req.user._id,
//     updatedAt: Date.now()
//   };

//   // Handle marks update
//   if (marks) {
//     updateData.academicRecords = [Number(marks)];
//   }

//   const updatedStudent = await Student.findByIdAndUpdate(id, updateData, { new: true });

//   res.status(200).json({
//     code: "0",
//     message: "Student updated successfully",
//     data: updatedStudent
//   });
// });

// const deleteStudent = asyncHandler(async (req, res) => {
//   const { id } = req.params;

//   // Find the student
//   const student = await Student.findById(id);
  
//   if (!student) {
//     res.status(404).json({
//       "code": "1",
//       "message": "Student not found"
//     });
//     return;
//   }

//   // Authorization checks
//   if (req.user.role === 'ORG_ADMIN') {
//     // ORG_ADMIN can only delete students within their organization
//     if (student.organizationID.toString() !== req.user.organizationID.toString()) {
//       res.status(403).json({
//         "code": "1",
//         "message": "Not authorized to delete students from other organizations"
//       });
//       return;
//     }
//   }

//   // Also delete associated user account if exists
//   if (student.emailid) {
//     await User.findOneAndDelete({ emailID: student.emailid });
//   }

//   // Permanently delete student
//   await Student.findByIdAndDelete(id);

//   res.status(200).json({
//     code: "0",
//     message: "Student deleted successfully"
//   });
// });


// @desc    Fetch student profile (marks, board, address)
// @route   GET /api/students/:id/profile
// @access  Private (Counselor or Student/Self)
const getStudentProfile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ studentID: req.params.id }).populate('branchID', 'name');

  if (!student) {
    res.status(404);
    throw new Error('Student profile not found');
  }

  // Privacy: Student cannot see other students/ Counselor must be at same branch
  if (req.user.role === 'STUDENT' && req.user.userID !== req.params.id) {
    res.status(401);
    throw new Error('Not authorized to view other student profiles');
  }

  if (req.user.role === 'COUNSELOR' && student.branchID._id.toString() !== req.user.branchID.toString()) {
    res.status(401);
    throw new Error('Not authorized to view student from a different branch');
  }

  res.status(200).json(student);
});

// @desc    Update marks for a specific term
// @route   PATCH /api/students/:id/marks
// @access  Private (BranchAdmin or Counselor)
const updateStudentMarks = asyncHandler(async (req, res) => {
  const { term, year, marks } = req.body;
  
  if (!term || !year || !marks) {
    res.status(400);
    throw new Error('Please add all marks fields');
  }

  const student = await Student.findOne({ studentID: req.params.id });

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Add a new term or update if existing logic can be added here
  student.academicRecords.push({ term, year, marks });
  student.updatedBy = req.user.userID;
  await student.save();

  res.status(200).json({ message: "Marks updated successfully", studentID: req.params.id });
});

// @desc    Search students by name or roll no within a Branch
// @route   GET /api/students/search
// @access  Private (Counselor or Higher)
const searchStudents = asyncHandler(async (req, res) => {
  const { query } = req.query;
  
  let filter = {
    isDeleted: false,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { studentID: { $regex: query, $options: 'i' } }
    ]
  };

  // Scoped search logic
  if (req.user.role !== 'SYSTEM_ADMIN') {
    filter.branchID = req.user.branchID;
  }

  const students = await Student.find(filter).limit(20).select('name studentID standard stream');
  res.status(200).json(students);
});

// @desc    Export student data into excel file
// @route   GET /api/students/export
// @access  Private (BranchAdmin or Higher)
const exportStudentsToExcel = asyncHandler(async (req, res) => {
  let filter = { isDeleted: false };
  
  if (req.user.role !== 'SYSTEM_ADMIN' && req.user.role !== 'ORG_ADMIN') {
    filter.branchID = req.user.branchID;
  }

  const students = await Student.find(filter).populate('branchID', 'name');

  if (!students || students.length === 0) {
    res.status(400);
    throw new Error('No student data found to export');
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');

  // Define columns
  worksheet.columns = [
    { header: 'Student ID', key: 'studentID', width: 15 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Standard', key: 'standard', width: 10 },
    { header: 'Board', key: 'board', width: 10 },
    { header: 'Stream', key: 'stream', width: 15 },
    { header: 'Branch', key: 'branch', width: 25 },
    { header: 'Email ID', key: 'emailID', width: 25 },
    { header: 'Mobile No', key: 'mobileNo', width: 20 },
    { header: 'RIASEC: Realistic', key: 'realistic', width: 20 },
    { header: 'RIASEC: Investigative', key: 'investigative', width: 20 },
    { header: 'RIASEC: Artistic', key: 'artistic', width: 20 },
    { header: 'RIASEC: Social', key: 'social', width: 20 },
    { header: 'RIASEC: Enterprising', key: 'enterprising', width: 20 },
    { header: 'RIASEC: Conventional', key: 'conventional', width: 20 }
  ];

  // Add rows
  students.forEach((student) => {
    const scores = student.counselorInsights?.riasecScores || new Map();
    worksheet.addRow({
      studentID: student.studentID,
      name: student.name,
      standard: student.standard,
      board: student.board,
      stream: student.stream,
      branch: student.branchID?.name || 'N/A',
      emailID: student.emailID,
      mobileNo: student.mobileNo,
      realistic: scores.get('Realistic') || 0,
      investigative: scores.get('Investigative') || 0,
      artistic: scores.get('Artistic') || 0,
      social: scores.get('Social') || 0,
      enterprising: scores.get('Enterprising') || 0,
      conventional: scores.get('Conventional') || 0
    });
  });

  // Styling
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFCCCCFF' }
  };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=' + 'Students_Export.xlsx'
  );

  await workbook.xlsx.write(res);
  res.end();
});

// @desc    Verify OTP for student login
// @route   POST /api/students/verify-otp
// @access  Public
// Add this function to studentController.js (if not already there)
const verifyStudentOtp = asyncHandler(async (req, res) => {
  const { otp, loginID } = req.body;
  
  console.log("Verifying OTP:", { otp, emailID });
  
  if (!otp || !emailID) {
    return res.status(400).json({
      code: "1",
      message: "OTP and loginID are required"
    });
  }
  
  const OTP = require('../models/otp');
  
  const otpRecord = await OTP.findOne({
    otp: otp,
    $or: [
      { emailID: emailID },
    ]
  });
  
  if (!otpRecord) {
    return res.status(400).json({
      code: "1",
      message: "Invalid or expired OTP"
    });
  }
  
  await OTP.deleteOne({ _id: otpRecord._id });
  
  const student = await Student.findOne({
    $or: [
      { emailIDs: { $in: [loginID] } },
    ],
    isDeleted: false
  });
  
  if (!student) {
    return res.status(500).json({
      code: "1",
      message: "Student not found"
    });
  }
  
  const token = generateStudentToken(student);
  
  return res.status(200).json({
    code: "0",
    message: "OTP verified successfully",
    token: token,
    data: {
      student: {
        id: student._id,
        name: student.name,
        grNo: student.grNo,
        emailIDs: student.emailIDs,
        mobileNos: student.mobileNos,
        standard: student.standard,
        division: student.division
      }
    }
  });
});


module.exports = {
  bulkUploadStudents,
  studentsList,
  updateStudent,
  deleteStudent,
  getStudentProfile,
  updateStudentMarks,
  searchStudents,
  exportStudentsToExcel,
  addStudent,
  updateStudent,
  deleteStudent,
  studentLogin,
  bulkUploadMarks,
  verifyStudentOtp
};
