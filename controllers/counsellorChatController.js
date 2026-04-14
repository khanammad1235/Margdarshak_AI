const Student = require("../models/Student");
const StudentChat = require("../models/studentChat");
const College = require("../models/College");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// RIASEC pairings for onboarding
const RIASEC_PAIRINGS = [
  { pair: "Realistic vs Artistic", categories: ["Realistic", "Artistic"] },
  { pair: "Investigative vs Social", categories: ["Investigative", "Social"] },
  { pair: "Enterprising vs Conventional", categories: ["Enterprising", "Conventional"] },
  { pair: "Realistic vs Investigative", categories: ["Realistic", "Investigative"] },
  { pair: "Social vs Enterprising", categories: ["Social", "Enterprising"] }
];

exports.handleChat = async (req, res) => {
  try {
    const { message = "" } = req.body;
    const studentID = req.student._id;
    
    console.log("Student ID:", studentID);
    console.log("Message:", message);

    if (!studentID) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required"
      });
    }

    const student = await Student.findOne({
      _id: studentID,
      isDeleted: false
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    // Save user message (skip empty/startup messages)
    if (message && message.trim() && message !== "START") {
      await saveMessage(student._id, student.organizationID, student.branchID, student.name, "user", message);
    }

    let response;

    // =============================
    // 1) ONBOARDING FLOW
    // =============================
    if (!student.onboarding?.completed) {
      response = await handleOnboarding(student, message);
      
      // After onboarding completion, calculate RIASEC scores
      if (response.mode === "COUNSELING" && response.onboardingCompleted) {
        await calculateFinalRiasecScores(student);
        await updateCareerRecommendations(student);
      }
    } else {
      // =============================
      // 2) COUNSELING FLOW
      // =============================
      // Initialize message counter if not exists
      if (!student.messageCounter) {
        student.messageCounter = 0;
      }
      student.messageCounter += 1;
      
      // Trigger RIASEC recalculation every 10 messages
      const shouldRecalculate = student.messageCounter >= 10;
      
      if (shouldRecalculate) {
        console.log("Recalculating RIASEC scores after 10 messages...");
        await calculateFinalRiasecScores(student);
        await updateCareerRecommendations(student);
        student.messageCounter = 0;
      }
      
      await student.save();
      
      // Get intent and route
      const intent = await classifyIntent(message);
      response = await routeIntent(student, message, intent);
    }

    // Save AI reply
    if (response.reply) {
      await saveMessage(student._id, student.organizationID, student.branchID, student.name, "assistant", response.reply, response.mode);
    }

    return res.json({
      success: true,
      ...response
    });
    
  } catch (error) {
    console.error("handleChat error", error);
    return res.status(500).json({
      success: false,
      message: error.message,
      reply: "I'm having trouble connecting. Please try again in a moment."
    });
  }
};

/**
 * Onboarding Handler with AI-generated questions
 */
/**
 * Onboarding Handler with AI-generated questions and proper answer storage
 */
async function handleOnboarding(student, answer) {
  let currentStep = student.onboarding?.currentStep || 1;
  const totalSteps = 5;

  console.log(`Onboarding - Step ${currentStep}/${totalSteps}, Answer: "${answer}"`);

  // Initialize onboarding if not started
  if (!student.onboarding || (currentStep === 1 && (!answer || answer === "" || answer === "START"))) {
    if (!student.onboarding) {
      student.onboarding = {
        completed: false,
        currentStep: 1,
        totalSteps: totalSteps,
        answers: []
      };
      await student.save();
    }
    
    // Generate first question
    const firstQuestion = await generateRIASECQuestion(student, 1, totalSteps);
    
    // Store the current question in the session (optional, for tracking)
    student.onboarding.currentQuestion = firstQuestion;
    await student.save();
    
    return {
      mode: "ONBOARDING",
      currentStep: 1,
      totalSteps: totalSteps,
      reply: `Welcome ${student.name}! I'm Margdarshak AI. Let me understand your interests better.\n\n**Question 1 of ${totalSteps}:**\n${firstQuestion.question}\n\nPlease choose:\n• ${firstQuestion.optionA}\n• ${firstQuestion.optionB}`,
      quickReplies: ["First option", "Second option"],
      question: firstQuestion
    };
  }

  // ============================================
  // SAVE THE STUDENT'S ANSWER TO THE DATABASE
  // ============================================
  if (answer && answer.trim() && answer !== "START") {
    // Get the current question that was asked
    const currentQuestionObj = student.onboarding.currentQuestion || await getCurrentQuestion(student, currentStep - 1);
    
    if (currentQuestionObj) {
      console.log(`Saving answer for step ${currentStep - 1}: ${answer}`);
      console.log(`Question: ${currentQuestionObj.question}`);
      
      // Classify the answer using AI
      let classification = { 
        chosenCategory: currentQuestionObj.categories[0], 
        rationale: "Default",
        confidence: "low"
      };
      
      try {
        classification = await classifyOnboardingAnswer(
          answer, 
          currentQuestionObj.question, 
          currentQuestionObj.categories
        );
        console.log(`Classification result: ${classification.chosenCategory} (${classification.confidence})`);
      } catch (error) {
        console.error("Classification error:", error);
      }
      
      // PUSH ANSWER TO STUDENT'S ONBOARDING.ANSWERS ARRAY
      student.onboarding.answers.push({
        question: currentQuestionObj.question,
        answer: answer,
        category: classification.chosenCategory,
        confidence: classification.confidence,
        rationale: classification.rationale,
        step: currentStep - 1,
        riasecPair: currentQuestionObj.riasecPair,
        createdAt: new Date()
      });
      
      // Also update the answers_count for tracking
      student.onboarding.answersCount = (student.onboarding.answersCount || 0) + 1;
      
      await student.save();
      console.log(`Answer saved successfully. Total answers: ${student.onboarding.answers.length}`);
    } else {
      console.warn(`No current question found for step ${currentStep - 1}`);
    }
  }

  // Check if onboarding is complete
  if (currentStep > totalSteps) {
    console.log("Onboarding completed!");
    student.onboarding.completed = true;
    student.onboarding.completedOn = new Date();
    await student.save();

    // Calculate RIASEC scores based on saved answers
    const scores = await calculateFinalRiasecScores(student);
    await updateCareerRecommendations(student);
    
    const topCategories = getTopCategories(student.onboarding.answers);
    
    return {
      mode: "COUNSELING",
      onboardingCompleted: true,
      reply: `🎯 Perfect! Based on our conversation, I can see you're strongly inclined towards **${topCategories.join(", ")}** traits.\n\nI've analyzed your responses and created your personalized career profile. Now you can ask me anything about:\n• Career paths matching your interests\n• College recommendations\n• Study strategies\n• Exam preparation\n\nWhat would you like to explore first?`,
      riasecScores: scores
    };
  }

  // Generate next question
  const nextQuestion = await generateRIASECQuestion(student, currentStep, totalSteps);
  
  // Store current question for next iteration
  student.onboarding.currentQuestion = nextQuestion;
  student.onboarding.currentStep = currentStep + 1;
  await student.save();
  
  console.log(`Generated question ${currentStep} of ${totalSteps}`);

  return {
    mode: "ONBOARDING",
    currentStep: currentStep,
    totalSteps: totalSteps,
    reply: `**Question ${currentStep} of ${totalSteps}:**\n${nextQuestion.question}\n\nPlease choose:\n• ${nextQuestion.optionA}\n• ${nextQuestion.optionB}`,
    quickReplies: ["First option", "Second option"],
    question: nextQuestion
  };
}

/**
 * Helper function to get current question based on step
 */
async function getCurrentQuestion(student, step) {
  // If we have stored questions in onboarding, retrieve them
  if (student.onboarding.questions && student.onboarding.questions[step - 1]) {
    return student.onboarding.questions[step - 1];
  }
  
  // Otherwise generate fallback question
  const pairing = RIASEC_PAIRINGS[step - 1];
  return getFallbackQuestion(step, pairing);
}

/**
 * Get top categories from onboarding answers
 */
function getTopCategories(answers) {
  const categoryCount = {};
  answers.forEach(answer => {
    const cat = answer.category;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  
  const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 2).map(([cat]) => cat);
}

/**
 * Save message to chat history
 */
async function saveMessage(studentID, organizationID, branchID, studentName, role, text, mode = "COUNSELING") {
  try {
    const updateData = {
      $push: {
        messages: {
          role,
          text,
          mode,
          intent: role === "user" ? await getIntentFromText(text) : "GENERAL_ADVICE",
          metadata: {
            step: mode === "ONBOARDING" ? 1 : null,
            recommendations: [],
            vectorContextUsed: false
          },
          createdAt: new Date()
        }
      },
      $set: {
        lastMessageAt: new Date(),
        lastMode: mode,
        organizationID: organizationID,
        branchID: branchID,
        studentName: studentName
      }
    };
    
    await StudentChat.updateOne(
      { studentID: studentID },
      updateData,
      { upsert: true }
    );
    
    console.log(`Message saved: ${role} - ${text.substring(0, 50)}...`);
  } catch (error) {
    console.error("Save message error:", error);
  }
}

/**
 * Helper to get intent from text
 */
async function getIntentFromText(text) {
  // Simple intent detection (can be enhanced)
  const lowerText = text.toLowerCase();
  if (lowerText.includes("college") || lowerText.includes("university") || lowerText.includes("institution")) {
    if (lowerText.includes("near") || lowerText.includes("city") || lowerText.includes("local")) {
      return "LOCAL_SEARCH";
    }
    return "GLOBAL_SEARCH";
  }
  return "GENERAL_ADVICE";
}

/**
 * Generate RIASEC question using AI
 */
async function generateRIASECQuestion(student, currentStep, totalSteps) {
  const riasecModel = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const currentPairing = RIASEC_PAIRINGS[currentStep - 1];
  
  const previousAnswers = student.onboarding?.answers || [];
  const previousCategories = previousAnswers.map(a => a.category);
  
  const prompt = `You are a career assessment expert. Generate a unique, creative RIASEC question for an Indian student.

STUDENT CONTEXT:
- Name: ${student.name}
- Standard: ${student.standard || "Not specified"}
- Stream: ${student.stream || "Not specified"}
- Board: ${student.board || "Not specified"}
- Previous choices: ${previousCategories.join(", ") || "None yet"}

QUESTION TYPE: ${currentPairing.pair}
Categories: ${currentPairing.categories[0]} vs ${currentPairing.categories[1]}

REQUIREMENTS:
1. Create a realistic, engaging scenario relevant to Indian students
2. The question should clearly present a choice between the two categories
3. Make it culturally appropriate (Indian schools, festivals, careers, etc.)
4. Don't reuse the same scenarios - be creative each time
5. Keep the question concise (1-2 sentences)

Return a JSON object in this exact format:
{
  "question": "Your creative question text here",
  "categories": ["${currentPairing.categories[0]}", "${currentPairing.categories[1]}"],
  "optionA": "Description of first option (${currentPairing.categories[0]})",
  "optionB": "Description of second option (${currentPairing.categories[1]})",
  "riasecPair": "${currentPairing.pair}"
}`;

  const result = await riasecModel.generateContent(prompt);
  const text = result.response.text();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("JSON parse error:", e);
    }
  }
  
  // Fallback questions
  return getFallbackQuestion(currentStep, currentPairing);
}

/**
 * Fallback questions
 */
function getFallbackQuestion(step, pairing) {
  const fallbackQuestions = {
    1: {
      question: "Imagine you're at a tech fest. Would you rather be at the workshop building a hardware robot or at the design booth creating the 3D graphics and branding?",
      categories: ["Realistic", "Artistic"],
      optionA: "Building hardware robot (Realistic)",
      optionB: "Creating 3D graphics and branding (Artistic)",
      riasecPair: "Realistic vs Artistic"
    },
    2: {
      question: "Your school is starting a health camp. Would you rather spend time in the lab analyzing blood samples under a microscope or be at the front desk talking to people?",
      categories: ["Investigative", "Social"],
      optionA: "Analyzing blood samples in lab (Investigative)",
      optionB: "Talking to people at front desk (Social)",
      riasecPair: "Investigative vs Social"
    },
    3: {
      question: "In a group project, would you rather be the leader pitching the idea or the one who organizes the timeline and budget?",
      categories: ["Enterprising", "Conventional"],
      optionA: "Leader pitching ideas (Enterprising)",
      optionB: "Organizer handling details (Conventional)",
      riasecPair: "Enterprising vs Conventional"
    },
    4: {
      question: "You see a complex machine you've never seen before. Is your first instinct to take it apart or to find the manual?",
      categories: ["Realistic", "Investigative"],
      optionA: "Take it apart (Realistic)",
      optionB: "Read the manual (Investigative)",
      riasecPair: "Realistic vs Investigative"
    },
    5: {
      question: "If you started a business, would your primary goal be to solve social problems or to build a profitable brand?",
      categories: ["Social", "Enterprising"],
      optionA: "Solve social problems (Social)",
      optionB: "Build profitable brand (Enterprising)",
      riasecPair: "Social vs Enterprising"
    }
  };
  
  return fallbackQuestions[step];
}

/**
 * Get top categories from onboarding answers
 */
function getTopCategories(answers) {
  const categoryCount = {};
  answers.forEach(answer => {
    const cat = answer.category;
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  
  const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 2).map(([cat]) => cat);
}

/**
 * Classify onboarding answer
 */
async function classifyOnboardingAnswer(answer, question, categories) {
  const classificationModel = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash"
  });

  const prompt = `Analyze the student's response.

QUESTION: "${question}"
STUDENT ANSWER: "${answer}"

Categories:
- First option: ${categories[0]}
- Second option: ${categories[1]}

Determine which category the student chose.

Return JSON: { "chosenCategory": "${categories[0]} or ${categories[1]}", "confidence": "high/medium/low", "rationale": "brief explanation" }`;

  const result = await classificationModel.generateContent(prompt);
  const text = result.response.text();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }
  
  // Fallback pattern matching
  const lowerAnswer = answer.toLowerCase();
  if (lowerAnswer.includes("first") || lowerAnswer.includes("option 1") || lowerAnswer === "a") {
    return { chosenCategory: categories[0], confidence: "medium", rationale: "Matched first option" };
  } else if (lowerAnswer.includes("second") || lowerAnswer.includes("option 2") || lowerAnswer === "b") {
    return { chosenCategory: categories[1], confidence: "medium", rationale: "Matched second option" };
  }
  
  return { chosenCategory: categories[0], confidence: "low", rationale: "Default to first option" };
}

/**
 * Calculate RIASEC Scores
 */
async function calculateFinalRiasecScores(student) {
  console.log("Calculating RIASEC scores for student:", student.name);
  
  const onboardingAnswers = student.onboarding?.answers || [];
  
  // Initialize scores
  const scores = {
    Realistic: 50,
    Investigative: 50,
    Artistic: 50,
    Social: 50,
    Enterprising: 50,
    Conventional: 50
  };
  
  // Calculate based on answers
  onboardingAnswers.forEach(answer => {
    const category = answer.category;
    if (scores[category] !== undefined) {
      scores[category] = Math.min(100, scores[category] + 10);
    }
  });
  
  // Apply bonuses for consistency
  const categoryCount = {};
  onboardingAnswers.forEach(answer => {
    categoryCount[answer.category] = (categoryCount[answer.category] || 0) + 1;
  });
  
  Object.entries(categoryCount).forEach(([category, count]) => {
    if (count >= 2) {
      scores[category] = Math.min(100, scores[category] + 10);
    }
  });
  
  // Update student
  if (!student.counselorInsights) {
    student.counselorInsights = {};
  }
  
  // Store as Map
  const scoresMap = new Map();
  Object.entries(scores).forEach(([key, value]) => {
    scoresMap.set(key, value);
  });
  
  student.counselorInsights.riasecScores = scoresMap;
  
  // Update detected interests
  const sortedScores = Object.entries(scores).sort(([,a], [,b]) => b - a);
  student.counselorInsights.detectedInterests = sortedScores.slice(0, 3).map(([key]) => key);
  
  await student.save();
  
  console.log("RIASEC scores calculated:", scores);
  
  return scores;
}

/**
 * Update Career Recommendations
 */
async function updateCareerRecommendations(student) {
  const scores = student.counselorInsights?.riasecScores;
  if (!scores) return;
  
  // Convert Map to object
  const scoresObj = {};
  scores.forEach((value, key) => {
    scoresObj[key] = value;
  });
  
  const recommendations = new Set();
  
  const careerMap = {
    Realistic: ["Engineering", "Architecture", "Civil Engineering", "Mechanical Engineering", "Agriculture"],
    Investigative: ["Data Science", "Research", "Medicine", "Biotechnology", "Pharmacy"],
    Artistic: ["Design", "Media", "Architecture", "Performing Arts", "Animation", "Fashion Design"],
    Social: ["Psychology", "Social Work", "Teaching", "Human Resources", "Counseling"],
    Enterprising: ["Business Administration", "Marketing", "Law", "Entrepreneurship", "Sales"],
    Conventional: ["Accounting", "Finance", "Banking", "Operations Management", "Administration"]
  };
  
  // Add from top 2 scores
  const sorted = Object.entries(scoresObj).sort(([,a], [,b]) => b - a);
  for (let i = 0; i < Math.min(2, sorted.length); i++) {
    const [interest, score] = sorted[i];
    if (score > 55) {
      const careers = careerMap[interest] || [];
      careers.forEach(career => recommendations.add(career));
    }
  }
  
  // Stream-specific recommendations
  if (student.stream === "PCM") {
    recommendations.add("Engineering");
    recommendations.add("Data Science");
  } else if (student.stream === "PCB") {
    recommendations.add("Medicine");
    recommendations.add("Biotechnology");
  } else if (student.stream === "Commerce") {
    recommendations.add("CA");
    recommendations.add("Finance");
  } else if (student.stream === "Arts") {
    recommendations.add("Design");
    recommendations.add("Psychology");
  }
  
  student.counselorInsights.careerRecommendations = [...recommendations].slice(0, 6);
  await student.save();
}

/**
 * Save message to chat history
 */
async function saveMessage(studentID, organizationID, branchID, studentName, role, text, mode = "COUNSELING") {
  try {
    await StudentChat.updateOne(
      { studentID: studentID },
      {
        $push: {
          messages: {
            role,
            text,
            mode,
            createdAt: new Date()
          }
        },
        $set: {
          lastMessageAt: new Date(),
          lastMode: mode,
          organizationID: organizationID,
          branchID: branchID,
          studentName: studentName
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error("Save message error:", error);
  }
}

/**
 * Classify intent
 */
async function classifyIntent(message) {
  const classificationModel = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash"
  });

  const prompt = `Classify: "${message}" into GENERAL_ADVICE, LOCAL_SEARCH, or GLOBAL_SEARCH. Return JSON: { "category": "CATEGORY" }`;

  const result = await classificationModel.generateContent(prompt);
  const text = result.response.text();
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return { intent: parsed.category, detectedCity: null };
    } catch (e) {}
  }
  
  return { intent: "GENERAL_ADVICE", detectedCity: null };
}

/**
 * Route intent
 */
async function routeIntent(student, message, intentData) {
  const { intent } = intentData;
  
  const scores = student.counselorInsights?.riasecScores;
  const scoresObj = {};
  if (scores) {
    scores.forEach((value, key) => {
      scoresObj[key] = value;
    });
  }
  
  const prompt = `You are Margdarshak AI, a career counselor.

STUDENT: ${student.name}
STANDARD: ${student.standard}
STREAM: ${student.stream}
RIASEC SCORES: ${JSON.stringify(scoresObj)}
INTERESTS: ${student.counselorInsights?.detectedInterests?.join(", ") || "Not yet"}
RECOMMENDATIONS: ${student.counselorInsights?.careerRecommendations?.join(", ") || "Not yet"}

STUDENT QUESTION: "${message}"
INTENT: ${intent}

Provide helpful, practical career advice. Be conversational and supportive. Answer in 2-3 short paragraphs.`;

  const result = await model.generateContent(prompt);
  
  return {
    mode: intent,
    reply: result.response.text(),
    recommendations: student.counselorInsights?.careerRecommendations || []
  };
}

/**
 * Get chat history
 */
async function getChatHistory(studentID) {
  try {
    const chat = await StudentChat.findOne({ studentID: studentID });
    if (!chat || !chat.messages || chat.messages.length === 0) {
      return "No previous conversation.";
    }
    
    const lastMessages = chat.messages.slice(-10);
    let history = "";
    for (const msg of lastMessages) {
      const role = msg.role === "user" ? "Student" : "Margdarshak AI";
      history += `${role}: ${msg.text}\n`;
    }
    
    return history;
  } catch (error) {
    console.error("Error getting chat history:", error);
    return "No previous conversation.";
  }
}