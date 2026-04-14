const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. Get Chat Response with Context Injection
const getAIResponse = async (studentContext, pastMessages, currentMessage) => {
  const model = genAI.getGenerativeModel({ model: "models/gemini-3-flash-preview" });

  const systemInstruction = `
    You are Margdarshak AI, an intelligent career counselor for high school students.
    
    Student Context: ${studentContext}
    
    Verified Knowledge (RAG): For Architecture, Math is mandatory. For Liberal Arts, 80%+ aggregate is common.
    
    Goal: Help students choose academic streams and colleges based on their marks, RISEC personality (analyze from chat), and board-specific rules.
    Tone: Empathetic, professional, and data-driven.
  `;

  const history = pastMessages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  const chat = model.startChat({
    history: history,
    systemInstruction: systemInstruction
  });

  const result = await chat.sendMessage(currentMessage);
  return result.response.text();
};

// 2. Extract Insights (Topic, Mood, RIASEC, Recommendations)
const extractStudentInsights = async (transcript) => {
  const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-pro" });
  
  const prompt = `
    Analyze the following chat transcript and extract student insights:
    ${JSON.stringify(transcript)}
    
    Provide a JSON response with:
    1. topic of conversation
    2. studentMood
    3. suggestedNextStep
    4. riasecScores (Realistic, Investigative, Artistic, Social, Enterprising, Conventional) on scale 0-100
    5. careerRecommendations (Array of strings)
    6. personalityTraits (Array of strings)
  `;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text().replace(/```json|```/g, ''));
};

module.exports = {
  getAIResponse,
  extractStudentInsights
};
