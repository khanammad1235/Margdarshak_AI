const asyncHandler = require('express-async-handler');
const Student = require('../models/Student');
const Conversation = require('../models/Conversation');
const { v4: uuidv4 } = require('uuid');
const { getAIResponse, extractStudentInsights } = require('../services/aiService');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// @desc    Initialize a chat session
// @route   POST /api/chat/start
// @access  Private (Student Only)
const startChat = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ grNo : req.body.grNo, organizationID: req.user.organizationID,isDeleted: false  });
  
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found');
  }

  const sessionID = uuidv4();
  
  const conversation = await Conversation.create({
    studentID: student._id,
    branchID: student.branchID,
    sessionID: sessionID,
    organizationID: student.organizationID,
    messages: []
  });

  res.status(201).json({
    sessionID,
    studentProfile: {
      name: student.name,
      standard: student.standard,
      division: student.division,
      grNo: student.grNo,
      rollNo: student.rollNo,
      academicRecords: student.academicRecords
    }
  });
});

// @desc    Send a message and get AI response
// @route   POST /api/chat/message
// @access  Private (Student Only)
const sendMessage = asyncHandler(async (req, res) => {
  const { sessionID, message } = req.body;

  const conversation = await Conversation.findOne({ sessionID });
  if (!conversation) {
    res.status(404);
    throw new Error('Conversation session not found');
  }

  const student = await Student.findById(conversation.studentID);
  
  // Prepare Context
  const studentContext = `Name: ${student.name}, Marks: ${JSON.stringify(student.academicRecords)}`;

  // Call Service
  const responseText = await getAIResponse(studentContext, conversation.messages, message);

  // Update conversation record
  conversation.messages.push({ role: 'user', content: message });
  conversation.messages.push({ role: 'model', content: responseText });
  await conversation.save();

  res.status(200).json({
    reply: responseText,
    sessionID
  });
});

// @desc    End chat and generate insights
// @route   POST /api/chat/end
// @access  Internal/Student
const endChat = asyncHandler(async (req, res) => {
  const { sessionID } = req.body;
  
  const conversation = await Conversation.findOne({ sessionID });
  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  // Use Service for complex extraction
  const insights = await extractStudentInsights(conversation.messages);

  // Update conversation summary
  conversation.sessionSummary = {
    topic: insights.topic,
    studentMood: insights.studentMood,
    keyTakeaway: insights.keyTakeaway || "Analysis complete",
    suggestedNextStep: insights.suggestedNextStep
  };
  await conversation.save();

  // Update student profile
  const student = await Student.findById(conversation.studentID);
  student.counselorInsights.riasecScores = insights.riasecScores;
  student.counselorInsights.careerRecommendations = insights.careerRecommendations;
  student.counselorInsights.personalityTraits = insights.personalityTraits;
  await student.save();

  res.status(200).json({ message: "Chat ended and insights processed", insights });
});

// @desc    Fetch past conversation summaries
// @route   GET /api/chat/history/:studentId
// @access  Private (Counselor or Student/Self)
// const getChatHistory = asyncHandler(async (req, res) => {
//   const { studentId } = req.params;

//   // Check if student exists
//   const student = await Student.findOne({ studentID: studentId });
//   if (!student) {
//     res.status(404);
//     throw new Error('Student not found');
//   }

//   // Authorization check (Self or Counselor from same branch)
//   if (req.user.role === 'STUDENT' && req.user.userID !== studentId) {
//     res.status(401);
//     throw new Error('Not authorized to view other history');
//   }

//   const history = await Conversation.find({ 
//     studentID: student._id, 
//     isDeleted: false 
//   }).sort({ creationOn: -1 }).select('sessionID sessionSummary creationOn');

//   res.status(200).json(history);
// });

const lastConversation = asyncHandler(async (req, res) => {
  const { studentId } = req.params; // Changed from studentId to id to match route
console.log(studentId)
  // Check if student exists - fix the query
  const student = await Student.findById(studentId); // Make sure studentID field exists
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  const lastChat = await Conversation.find({ 
    studentID: studentId, 
  })

  if (!lastChat) {
    res.status(404);
    throw new Error('No conversations found for this student');
  }

  res.status(200).json(lastChat);
});

module.exports = {
  startChat,
  sendMessage,
  endChat,
  // getChatHistory,
  lastConversation
};
