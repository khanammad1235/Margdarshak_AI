const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({dest: 'uploads/'});
const { loginUser, registerUser, getUser,updateUser,deleteUser} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { createOrganization, getAllOrganizations, createBranch, getOrgBranches,updateBranch,deleteBranch, getBranchAnalytics } = require('../controllers/adminController');
const { bulkUploadStudents, bulkUploadMarks , studentsList,updateStudent,deleteStudent,StudentProfile, updateStudentMarks, searchStudents, exportStudentsToExcel, addStudent, studentLogin, verifyStudentOtp } = require('../controllers/studentController');
// const { startChat, sendMessage, endChat, getChatHistory } = require('../controllers/chatController');
const { createOtp } = require('../controllers/otpController');
// const { handleChat } = require('../controllers/counsellorChatController');
const { protectStudent } = require('../middleware/studentMiddleware');
const {handleChat} = require('../controllers/newCounsellorChatController');

// // 1. Auth & Admin Routes (System and User Mgmt)
router.post('/auth/login', loginUser);
// router.get('/admin/orgs', protect, authorize('SYSTEM_ADMIN'), getAllOrganizations);
// router.post('/admin/orgs', createOrganization);
router.post('/admin/users',protect, authorize('ORG_ADMIN', 'SYSTEM_ADMIN') ,   registerUser);
router.get('/admin/users', protect,authorize('ORG_ADMIN', 'SYSTEM_ADMIN') ,   getUser);
router.put('/admin/users/:id', protect, authorize('ORG_ADMIN', 'SYSTEM_ADMIN'), updateUser);
router.delete('/admin/users/:id', protect, authorize('ORG_ADMIN', 'SYSTEM_ADMIN'), deleteUser);



// // 2. Organization & Branch Routes (Multi-tenant)
router.post('/org/branches', protect,  createBranch);
router.get('/org/branches', protect, authorize('ORG_ADMIN', 'SYSTEM_ADMIN'), getOrgBranches);
router.put('/org/branches/:id', protect, authorize('ORG_ADMIN', 'SYSTEM_ADMIN'), updateBranch);
router.delete('/org/branches/:id', protect, authorize('ORG_ADMIN', 'SYSTEM_ADMIN'), deleteBranch);
// router.get('/branch/:id/analytics', protect, authorize('ORG_ADMIN', 'BRANCH_ADMIN', 'SYSTEM_ADMIN'), getBranchAnalytics);

// // // 3. Student Management Routes (Academic & Profile)
// router.get('/students/search', protect, authorize('COUNSELOR', 'BRANCH_ADMIN', 'SYSTEM_ADMIN'), searchStudents);
// router.get('/students/export', protect, authorize('BRANCH_ADMIN', 'ORG_ADMIN', 'SYSTEM_ADMIN'), exportStudentsToExcel);
router.post('/students/bulk-upload',protect,authorize('BRANCH_ADMIN', 'SYSTEM_ADMIN',"ORG_ADMIN"),upload.single('file'),bulkUploadStudents);
router.post('/students/bulk-upload-marks',protect,authorize('BRANCH_ADMIN', 'SYSTEM_ADMIN',"ORG_ADMIN"),bulkUploadMarks);
router.post('/students', protect, authorize('COUNSELOR', 'BRANCH_ADMIN', 'SYSTEM_ADMIN','ORG_ADMIN'), addStudent);
router.get('/students', protect, authorize('BRANCH_ADMIN', 'COUNSELOR', 'SYSTEM_ADMIN','ORG_ADMIN'), studentsList);
router.put('/students/:id', protect, authorize('BRANCH_ADMIN', 'COUNSELOR', 'SYSTEM_ADMIN','ORG_ADMIN'), updateStudent);
router.delete('/students/:id', protect, authorize('BRANCH_ADMIN', 'COUNSELOR', 'SYSTEM_ADMIN','ORG_ADMIN'), deleteStudent);
router.post('/students/login', studentLogin);
router.post('/students/verify-otp', verifyStudentOtp);
// router.get('/students/:id/profile', protect, getStudentProfile);
// router.patch('/students/:id/marks', protect, authorize('BRANCH_ADMIN', 'COUNSELOR', 'SYSTEM_ADMIN'), updateStudentMarks);

// // 4. AI Counselor & Chat Routes (The Brain)
// router.get('/chat/history/:studentId', protect, getChatHistory);
// router.post('/chat/start', protect, authorize('STUDENT'), startChat);
// router.post('/chat/message', protect, authorize('STUDENT'), sendMessage);
// router.post('/chat/end', protect, endChat);
 // Note: AI internal trigger logic, potentially protected differently in production
 router.post('/chat', handleChat);
// router.get('/chat/bootstrap/:grNo', counselorController.bootstrapChat);


 router.post('/signup/create', createOtp); 
 router.post('/signup/verify', createOrganization); 



 
module.exports = router;
