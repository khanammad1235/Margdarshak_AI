const Conversation = require("../models/Conversation");
const Student = require("../models/Student");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { options } = require("../routes/apiRoutes");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const embeddingModel = genAI.getGenerativeModel({
    model: "text-embedding-004",
});
module.exports.handleChat = async (req, res) => {
    try {
        const { studentId, message = "" } = req.body;

        if (!studentId) {
            return res.status(500).json({
                code: "1",
                message: "Student ID is required",
            });
        }

        if (message == "") {
            return res.status(500).json({
                code: "1",
                message: "Message is required",
            })
        }
        const student = await Student.findOne({ _id: studentId, isDeleted: false });
        if (!student) {
            return res.status(500).json({
                code: "1",
                message: "Student not found",
            });
        }
        // console.log(studentRef)
        // 1. STATE CHECK: Is the student currently in the middle of onboarding?
        // If they have started (count > 0) but aren't finished, bypass the classifier.
        if (student.answers_count > 0 && !student.onboarding_complete) {
            console.log("🛠️ Onboarding in progress... Bypassing Intent Classifier.");
            const nextQuestion = await handleOnboarding(student, message);
            console.log(nextQuestion)
            return res.json({ reply: nextQuestion.reply, options: nextQuestion.options });
        }

        // 2. NEUTRAL STATE: Run the Intent Classifier
        const intent = await classifyIntent(message, student);
        console.log(intent)
        // 3. TRIGGER ONBOARDING: If the query requires a profile and they haven't started.
        if (intent.requires_onboarding && !student.onboarding_complete) {
            const firstQuestion = await handleOnboarding(student, "START");
            const bridge = `I'd love to help with that! To give you a personalized recommendation, let's start with a quick 5-question discovery:\n\n**Question 1:** ${firstQuestion.reply}`;
            return res.json({ reply: bridge , options: firstQuestion.options });
        }

        // 4. NORMAL PATH: General counseling or search
        if (intent.category === "LOCAL_SEARCH") {
            // Run your search for intent.detected_city...
        }
        const { baseline, recent } = await getContextSlices(studentId, student.onboarding_complete);


        let contextDocs = "";
        // if (intent.category !== "GENERAL_ADVICE") {
        //     const city =
        //         intent.category === "LOCAL_SEARCH"
        //             ? intent.detected_city || student.address.city
        //             : null;
        //     contextDocs = JSON.stringify(await performVectorSearch(message, city));
        // }


        // const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const finalPrompt = `Role: Professional Counselor. Profile: ${JSON.stringify(
            student
        )}. Recent: ${recent}. Baseline: ${baseline}. Docs: ${contextDocs}`;
        const result = await model.generateContent([finalPrompt, message]);
        responseText = result.response.text();

        // if (!student.onboarding_complete) {
        //     responseText = await handleOnboarding(student, message);
        // } else {
        //     intent = await classifyIntent(message);
        //     const { baseline, recent } = await getContextSlices(studentId);
        //     // console.log(intent, baseline, recent)
        //     let contextDocs = "";
        //     // if (intent.category !== "GENERAL_ADVICE") {
        //     //     const city = intent.category === "LOCAL_SEARCH" ? (intent.detected_city || student.address.city) : null;
        //     //     contextDocs = JSON.stringify(await performVectorSearch(message, city));
        //     // }

        //     //const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        //     const finalPrompt = `Role: Professional Counselor. Profile: ${JSON.stringify(student)}. Recent: ${recent}. Baseline: ${baseline}. Docs: ${contextDocs}`;
        //     const result = await model.generateContent([finalPrompt, message]);
        //     responseText = result.response.text();
        // }





        await Conversation.insertOne({ studentID: studentId, text: message, sender: "USER", timestamp: new Date() });
        await Conversation.insertOne({ studentID: studentId, text: responseText, sender: "AI", timestamp: new Date() });

        return res.status(200).json({
            code: "0",
            message: "Message sent successfully",
            responseText,
            intent,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            code: "1",
            message: "Server error",
            error: error.message,
        });
    }
};

// async function handleOnboarding(student, userMessage) {

//     // 1. Fetch History to maintain context and avoid repetition
//     const history = await Conversation.find({ studentID: student.studentID })
//         .sort({ timestamp: -1 })
//         .limit(6);

//     const chatSummary = history.reverse().map(m => `${m.sender}: ${m.queryText}`).join("\n");

//     // 2. The Orchestration Prompt

//     const onboardingPrompt = `
//     {
//         "role": "Margdarshak AI",
//         "context": {
//             "student_name": "${student.name}",
// "grade_level": "${student.standard || '8th Grade'}",
//             "progress_count": ${student.answers_count},
//             "history_summary": "${chatSummary}"
//         },
//         "task": "Generate a RIASEC scenario appropriate for a ${student.standard || '8th Grade'} student. Evaluate if the student answered the current scenario and provide the next one.", 
//         "mapping": [
//             "1: START -> Generate Scenario 1 (R vs A)",
//             "2: Acknowledged R vs A -> Generate Scenario 2 (I vs S)",
//             "3: Acknowledged I vs S -> Generate Scenario 3 (E vs C)",
//             "4: Acknowledged E vs C -> Generate Scenario 4 (R vs I)",
//             "5: Acknowledged R vs I -> Generate Scenario 5 (S vs E)",
//             "6: Acknowledged S vs E -> End Onboarding"
//         ],
//         "instructions": [
// "Vocabulary Check: Use simple, relatable language for a ${student.standard || '8th Grade'} student. Avoid corporate jargon.",
//             "If queryText is 'START' and progress is 0, generate the first scenario.",
//             "Otherwise, evaluate if '${userMessage}' validly chooses an option from the previous scenario.",
//             "If valid, acknowledge and present the next unique, immersive scenario (Themes: Video Games , School Clubs , Sports or Hobbies. ).",
//             "If invalid, the 'reply' should nudge them back to the choice and 'isValid' must be false.",
//             "If progress is 5 and user answers validly, set 'isComplete' to true."
//         ],
//         "response_format": {
//             "reply": "Conversational text",
//             "isValid": "boolean",
//             "isComplete": "boolean"
//         },
//         Do NOT return plain text.
// Do NOT use markdown.
// Do NOT use \`\`\`.
//     }`;

//     const result = await model.generateContent(onboardingPrompt);
//     const data = JSON.parse(result.response.text());
//     // console.log(data)
//     // 3. Database State Management
//     if (data.isValid || userMessage === "START") {
//         // Atomic increment of the step
//         await Student.updateOne(
//             { _id: student._id },
//             { $inc: { answers_count: 1 } }
//         );
//     }

//     // 4. Completion Hook
//     if (data.isComplete || student.answers_count >= 6) {
//         await Student.updateOne(
//             { _id: student._id },
//             { $set: { onboarding_complete: true } }
//         );

//         // Trigger the profile generation (Non-blocking)
//         calculateFinalRIASEC(student._id, true).catch(console.error);

//         return `${data.reply} \n\n🎯 **Onboarding Complete!** I'm building your career dashboard now.`;
//     }

//     return data.reply;
// }
async function handleOnboarding(student, userMessage) {

    const history = await Conversation.find({ studentID: student.studentID })
        .sort({ timestamp: -1 })
        .limit(6);

    const chatSummary = history.reverse().map(m => `${m.sender}: ${m.queryText}`).join("\n");

    // 1. CONSTRUCT THE MASTER PROMPT
    const onboardingPrompt = `
{
  "role": "Margdarshak AI",
  "context": {
    "student_name": "${student.name}",
    "grade_level": "${student.standard || "8th Grade"}",
    "progress_count": ${student.answers_count || 0},
    "history_summary": "${chatSummary}"
  },
  "task": "Generate a RIASEC scenario appropriate for a ${student.standard || "8th Grade"} student. Evaluate if the student answered the current scenario and provide the next one.",
  "mapping": [
    "1: START -> Generate Scenario 1 (R vs A)",
    "2: Acknowledged R vs A -> Generate Scenario 2 (I vs S)",
    "3: Acknowledged I vs S -> Generate Scenario 3 (E vs C)",
    "4: Acknowledged E vs C -> Generate Scenario 4 (R vs I)",
    "5: Acknowledged R vs I -> Generate Scenario 5 (S vs E)",
    "6: Acknowledged S vs E -> End Onboarding"
  ],
  "instructions": [
    "Use simple, relatable language for a ${student.standard || "8th Grade"} student. Avoid corporate jargon.",
    "Current Progress: student has answered ${student.answers_count || 0} out of 5 scenarios.",
    "If answers_count is 0 and user said START, present Scenario 1.",
    "Otherwise evaluate whether '${userMessage}' validly chooses an option from previous scenario.",
    "If valid, acknowledge and present the next unique immersive scenario using themes like Video Games, School Clubs, Sports, or Hobbies.",
    "If invalid, reply should nudge them back and isValid must be false.",
    "If progress reaches 5 and user answers validly, set isComplete to true.",
    "Whenever generating a scenario question, always include exactly 2 short quick-reply options matching the scenario."
  ],
  "response_format": {
    "reply": "Conversational text",
    "isValid": true,
    "options": ["Option 1", "Option 2"],
    "isComplete": false
  },
     Do NOT return plain text.
     Do NOT use markdown.
     Do NOT use \`\`\`.
     
`;

    const result = await model.generateContent(onboardingPrompt);
    // const reply = result.response.text();
    const rawReply = result.response.text();

    const cleanedReply = rawReply
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    let reply = JSON.parse(cleanedReply);
    console.log(reply)
    if (reply.isValid || userMessage === "START") {
        // Atomic increment of the step
        await Student.updateOne(
            { _id: student._id },
            { $inc: { answers_count: 1 } }
        );
    }


    if (reply.isComplete || student.answers_count >= 6) {
        await Student.updateOne(
            { _id: student._id },
            { $set: { onboarding_complete: true } }
        );

        // Trigger the profile generation (Non-blocking)
        calculateFinalRIASEC(student._id, true).catch(console.error);

        return {
            reply: `${reply.reply} \n\n🎯 **Onboarding Complete!** I'm building your career dashboard now.`,
        }
    }

    return {
        reply: reply.reply,
        options: reply.options || []
    };
}






async function calculateFinalRIASEC(studentID, isInitial = false) {
    const student = await Student.findOne({ _id: studentID });
    const { baseline, recent } = await getContextSlices(studentID, isInitial);
    // console.log(student)
    const prompt = `Analyze career evolution for ${student.name}.
    BASELINE: ${baseline}
    RECENT: ${recent}
    Weight recent trends 70%. Identify shifts.
    Return JSON: { "scores": {R,I,A,S,E,C}, "rationale": "string" }
     Do NOT return plain text.
     Do NOT use markdown.
     Do NOT use \`\`\`.
    `;

    const result = await model.generateContent(prompt);
    const rawReply = result.response.text();

    const cleanedReply = rawReply
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    let data = JSON.parse(cleanedReply);

    // Audit Trail Update
    await Student.updateOne({ _id: studentID }, {
        $set: { riasec_scores: data.scores, message_counter: 0 },
        $push: {
            riasec_history: {
                $each: [{ scores: data.scores, rationale: data.rationale, change_type: isInitial ? "INITIAL" : "PROGRESSIVE" }],
                $slice: -20
            }
        }
    });
}


// async function classifyIntent(userMessage) {
//     const prompt = `
// Analyze the following student query for a career counseling app.

// QUERY: "${userMessage}"

// Classify the query into EXACTLY one of the following categories:

// 1. LOCAL_SEARCH:
// Use this if the student is looking for colleges, schools, or institutions in a specific city, state, or mentions "near me", "my area", or "nearby".

// 2. GLOBAL_SEARCH:
// Use this if the student is asking about colleges, universities, or entrance exams at a national level
// (e.g., "Top IITs", "Best Medical colleges in India")
// WITHOUT mentioning a specific city.

// 3. GENERAL_ADVICE:
// Use this if the student is asking about career trends, "what is" questions, emerging sectors, advice on which profession to choose, or feelings about their future.

// Return ONLY valid JSON:
// {
//   "category": "NAME",
//   "detected_city": "NAME_OR_NULL"
// }
// `;

// const result = await model.generateContent(prompt);
// const rawReply = result.response.text();

// const cleanedReply = rawReply
//     .replace(/```json/g, "")
//     .replace(/```/g, "")
//     .trim();

// try {
//     return JSON.parse(cleanedReply);
// } catch (error) {
//     console.log("Intent Parse Error:", cleanedReply);

//     return {
//         category: "GENERAL_ADVICE",
//         detected_city: null
//     };
// }
// }


async function classifyIntent(userMessage, student) {

    const prompt = `
    [CONTEXT]
    Student Name: ${student.name}
    Stored City: ${student.address.city}
    Onboarding Status: ${student.onboarding_complete ? "Complete" : "Pending"}

    [TASK]
    Analyze the student query: "${userMessage}"
    
    [CATEGORIES]
    1. RECOMMENDATION_REQUEST: Personalized advice, "what should I do?", "best career for me". (Requires profile).
    2. LOCAL_SEARCH: Searching for institutions in a specific city or "near me"/"nearby".
    3. GLOBAL_SEARCH: National exams (IIT, JEE, NEET) or "Top 10 in India" without a specific city.
    4. GENERAL_ADVICE: "What is AI?", "How is life at IIT Bombay?", or greetings.

    [CITY DETECTION RULES]
    - If student mentions a specific city (e.g., "Pune"), return that city.
    - If student says "near me" or "nearby", return "${student.address.city}".
    - Otherwise, return null.

    [OUTPUT FORMAT]
    Return JSON only: 
    { 
      "category": "NAME", 
      "detected_city": "NAME_OR_NULL",
      "requires_onboarding": boolean 
    }`;

    const result = await model.generateContent(prompt);
    const rawReply = result.response.text();

    const cleanedReply = rawReply
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
    return JSON.parse(cleanedReply);
}
async function getContextSlices(studentID, isOnboarding) {
    if (isOnboarding) {
        // Fetch everything - it's a short list (max 10-15 messages)
        const fullHistory = await Conversation.find({ studentID }).sort({ timestamp: 1 })

        return { baseline: JSON.stringify(fullHistory), recent: "[]" };
    } else {
        // Switch to Sliding Window for 2-year scalability
        const baseline = await Conversation.find({ studentID }).sort({ timestamp: 1 }).limit(10)
        const recent = await Conversation.find({ studentID }).sort({ timestamp: -1 }).limit(20)

        return {
            baseline: JSON.stringify(baseline),
            recent: JSON.stringify(recent.reverse())
        };
    }
}