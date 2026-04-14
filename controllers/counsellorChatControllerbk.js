// controllers/counselor.controller.js
const Student = require("../models/Student");
const StudentChat = require("../models/studentChat");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash"
});

const ONBOARDING_QUESTIONS = [
  {
    question:
      "Would you rather work on a science project or organize a community event?",
    category: "Realistic"
  },
  {
    question:
      "Would you rather solve a physics puzzle or lead a school event?",
    category: "Investigative"
  },
  {
    question:
      "Would you rather design a poster or write a speech?",
    category: "Artistic"
  },
  {
    question:
      "Would you rather help a stressed friend or solve a coding problem?",
    category: "Social"
  },
  {
    question:
      "Would you rather manage a team or build a business idea?",
    category: "Enterprising"
  },
  {
    question:
      "Would you rather organize files or analyze a report?",
    category: "Conventional"
  }
];

exports.handleChat = async (req, res) => {
  try {
    const { grNo, message = "" } = req.body;

    if (!grNo) {
      return res.status(400).json({
        message: "grNo is required"
      });
    }

    const student = await Student.findOne({
      grNo,
      isDeleted: false
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found"
      });
    }

    // save user message
    if (message.trim()) {
      await saveMessage(grNo, "user", message);
    }

    let response;

    // =============================
    // 1) ONBOARDING FLOW
    // =============================
    if (!student.onboarding?.completed) {
      response = await handleOnboarding(student, message);
    } else {
      // =============================
      // 2) COUNSELING FLOW
      // =============================
      const intent = await classifyIntent(message);
      response = await routeIntent(student, message, intent);
    }

    // save ai reply
    await saveMessage(
      grNo,
      "assistant",
      response.reply,
      response.mode
    );

    return res.json(response);
  } catch (error) {
    console.error("handleChat error", error);
    return res.status(500).json({
      message: error.message
    });
  }
};

async function handleOnboarding(student, answer) {
  const step = student.onboarding?.currentStep || 1;

  // save previous answer
  if (answer && step > 1) {
    const previous = ONBOARDING_QUESTIONS[step - 2];

    student.onboarding.answers.push({
      question: previous.question,
      answer,
      category: previous.category,
      createdAt: new Date()
    });
  }

  // onboarding completed
  if (step > ONBOARDING_QUESTIONS.length) {
    student.onboarding.completed = true;
    student.onboarding.completedOn = new Date();

    updateRiasecScores(student);
    updateCareerRecommendations(student);

    await student.save();

    return {
      mode: "COUNSELING",
      reply:
        "Perfect 🎯 Your profile is ready now. Ask me anything about studies, careers, exams, or colleges."
    };
  }

  const nextQuestion = ONBOARDING_QUESTIONS[step - 1];
  student.onboarding.currentStep = step + 1;

  await student.save();

  return {
    mode: "ONBOARDING",
    currentStep: step,
    totalSteps: ONBOARDING_QUESTIONS.length,
    reply: nextQuestion.question,
    quickReplies: ["Option A", "Option B"]
  };
}

function updateRiasecScores(student) {
  const scores = {
    Realistic: 0,
    Investigative: 0,
    Artistic: 0,
    Social: 0,
    Enterprising: 0,
    Conventional: 0
  };

  for (const ans of student.onboarding.answers) {
    if (scores[ans.category] !== undefined) {
      scores[ans.category] += 20;
    }
  }

  student.counselorInsights =
    student.counselorInsights || {};

  student.counselorInsights.riasecScores = scores;

  student.counselorInsights.detectedInterests =
    Object.entries(scores)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
}

function updateCareerRecommendations(student) {
  const interests =
    student.counselorInsights?.detectedInterests || [];

  const recommendations = new Set();

  if (
    student.stream === "PCM" ||
    interests.includes("Investigative")
  ) {
    recommendations.add("Engineering");
    recommendations.add("AI / Data Science");
  }

  if (
    student.stream === "PCB" ||
    interests.includes("Social")
  ) {
    recommendations.add("Medical");
    recommendations.add("Psychology");
  }

  if (
    student.stream === "Commerce" ||
    interests.includes("Enterprising")
  ) {
    recommendations.add("CA");
    recommendations.add("Finance");
  }

  if (interests.includes("Artistic")) {
    recommendations.add("Design");
    recommendations.add("Media");
  }

  student.counselorInsights.careerRecommendations = [
    ...recommendations
  ];
}

async function classifyIntent(message) {
  const prompt = `
Classify this student query into:
GENERAL_ADVICE
LOCAL_SEARCH
GLOBAL_SEARCH

Return JSON only:
{"intent":"GENERAL_ADVICE"}

Query: ${message}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    return JSON.parse(text).intent;
  } catch {
    return "GENERAL_ADVICE";
  }
}

async function routeIntent(student, message, intent) {
  let context = "";

  if (
    intent === "LOCAL_SEARCH" ||
    intent === "GLOBAL_SEARCH"
  ) {
    // TODO: vector search later
    // context = await performVectorSearch(...)
    context = "";
  }

  const prompt = `
You are Margdarshak AI.

Student:
Name: ${student.name}
Standard: ${student.standard}
Board: ${student.board || ""}
Stream: ${student.stream || ""}
City: ${student.address?.city || ""}
RIASEC: ${JSON.stringify(
    student.counselorInsights?.riasecScores || {}
  )}
Interests: ${(
    student.counselorInsights?.detectedInterests || []
  ).join(", ")}
Recommended Careers: ${(
    student.counselorInsights?.careerRecommendations || []
  ).join(", ")}

Search Context:
${context}

Student Question:
${message}

Give practical and supportive advice.
`;

  const result = await model.generateContent(prompt);

  return {
    mode: intent,
    reply: result.response.text(),
    recommendations:
      student.counselorInsights?.careerRecommendations || []
  };
}

async function saveMessage(grNo, role, text, mode = "COUNSELING") {
  await StudentChat.updateOne(
    { grNo },
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
        lastMode: mode
      }
    },
    { upsert: true }
  );
}