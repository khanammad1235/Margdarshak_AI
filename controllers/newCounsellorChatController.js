const Conversation = require("../models/Conversation");
const Student = require("../models/Student");
const { GoogleGenerativeAI } = require("@google/generative-ai");

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

        const student = await Student.findOne({ _id: studentId, isDeleted: false });
        if (!student) {
            return res.status(500).json({
                code: "1",
                message: "Student not found",
            });
        }
        // console.log(studentRef)
        let responseText = "";
        let intent = { category: "GENERAL_ADVICE" };
        if (!student.onboarding_complete) {
            responseText = await handleOnboarding(student, message);
        } else {
            intent = await classifyIntent(message);
            const { baseline, recent } = await getContextSlices(studentId);
            // console.log(intent, baseline, recent)
            let contextDocs = "";
            // if (intent.category !== "GENERAL_ADVICE") {
            //     const city = intent.category === "LOCAL_SEARCH" ? (intent.detected_city || student.address.city) : null;
            //     contextDocs = JSON.stringify(await performVectorSearch(message, city));
            // }

            //const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const finalPrompt = `Role: Professional Counselor. Profile: ${JSON.stringify(student)}. Recent: ${recent}. Baseline: ${baseline}. Docs: ${contextDocs}`;
            const result = await model.generateContent([finalPrompt, message]);
            responseText = result.response.text();
        }





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

// async function handleOnboarding(student, userMessage = "") {
//     // STEP 1 → first empty message greeting
//     if (!userMessage || userMessage.trim() === "") {
//         return {
//             message: `Hello ${student.name} 👋  
// I'm Margdarshak AI, your professional career counselor.

// I'll help discover your personality using 5 quick scenarios.`,
//             options: ["START"],
//             valid: true,
//             onboarding_complete: false,
//         };
//     }

//     // STEP 2 → your original Gemini prompt
//     const onboardingPrompt = `
// ### ROLE
// You are "Margdarshak AI," a professional career counselor. Your goal is to establish a RIASEC baseline.
// Student Name: ${student.name}

// ### THE SCENARIOS (RIASEC MAPPING)
// 1. (R vs A): "Imagine you're at a tech fest. Would you rather be at the workshop building a hardware robot (Realistic) or at the design booth creating the 3D graphics and branding (Artistic)?"
// 2. (I vs S): "Your school is starting a health camp. Would you rather spend time in the lab analyzing blood samples under a microscope (Investigative) or be at the front desk talking to people and helping them feel comfortable (Social)?"
// 3. (E vs C): "In a group project, would you rather be the leader pitching the idea to the judges (Enterprising) or the one who organizes the timeline, budget, and final report (Conventional)?"
// 4. (R vs I): "You see a complex machine you've never seen before. Is your first instinct to take it apart to see the physical parts (Realistic) or to find the manual to understand the theory of how it works (Investigative)?"
// 5. (S vs E): "If you started a business, would your primary goal be to solve a major social problem in your community (Social) or to scale it into a national profit-making brand (Enterprising)?"

// ### LOGIC RULES
// - Current Progress: The student has answered ${student.answers_count || 0} out of 5 scenarios.
// - If answers_count is 0 and user said "START", GREET the student and present Scenario 1.
// - VALIDATION: If the student's reply ("${userMessage}") is irrelevant or doesn't choose between the options provided in the last scenario, do NOT move forward.
// - If the reply is valid, acknowledge it briefly and present the NEXT scenario.
// - If Scenario 5 is answered, say "ONBOARDING_COMPLETE" and give a 1-sentence summary of their personality.

// ### OUTPUT FORMAT
// Return ONLY valid JSON:
// {
//   "message": "response",
//   "options": ["option1", "option2"],
//   "valid": true,
//   "onboarding_complete": false
// }
// `;

//     const result = await model.generateContent(onboardingPrompt);

//     const rawReply = result.response.text();

//     const cleanedReply = rawReply
//         .replace(/```json/g, "")
//         .replace(/```/g, "")
//         .trim();

//     let reply;

//     try {
//         reply = JSON.parse(cleanedReply);
//     } catch (e) {
//         console.log("Parse error:", cleanedReply);

//         reply = {
//             message: "Please choose one of the given options.",
//             options: [],
//             valid: false,
//             onboarding_complete: false,
//         };
//     }

//     // increment only after valid answer
//     if (
//         reply.valid &&
//         userMessage.toUpperCase() !== "START" &&
//         !reply.onboarding_complete
//     ) {
//         await Student.updateOne(
//             { _id: student._id },
//             { $inc: { answers_count: 1 } },
//         );
//     }

//     // onboarding complete
//     if (reply.onboarding_complete) {
//         await Student.updateOne(
//             { _id: student._id },
//             { onboarding_complete: true },
//         );
//         await calculateFinalRIASEC(student._id, true);
//     }

//     return reply;
// }
async function handleOnboarding(student, userMessage) {
   
    // 1. Fetch History to maintain context and avoid repetition
    const history = await Conversation.find({ studentID: student.studentID })
        .sort({ timestamp: -1 })
        .limit(6);
    
    const chatSummary = history.reverse().map(m => `${m.sender}: ${m.queryText}`).join("\n");

    // 2. The Orchestration Prompt

    const onboardingPrompt = `
    {
        "role": "Margdarshak AI",
        "context": {
            "student_name": "${student.name}",
"grade_level": "${student.standard || '8th Grade'}",
            "progress_count": ${student.answers_count},
            "history_summary": "${chatSummary}"
        },
        "task": "Generate a RIASEC scenario appropriate for a ${student.standard || '8th Grade'} student. Evaluate if the student answered the current scenario and provide the next one.", 
        "mapping": [
            "1: START -> Generate Scenario 1 (R vs A)",
            "2: Acknowledged R vs A -> Generate Scenario 2 (I vs S)",
            "3: Acknowledged I vs S -> Generate Scenario 3 (E vs C)",
            "4: Acknowledged E vs C -> Generate Scenario 4 (R vs I)",
            "5: Acknowledged R vs I -> Generate Scenario 5 (S vs E)",
            "6: Acknowledged S vs E -> End Onboarding"
        ],
        "instructions": [
"Vocabulary Check: Use simple, relatable language for a ${student.standard || '8th Grade'} student. Avoid corporate jargon.",
            "If queryText is 'START' and progress is 0, generate the first scenario.",
            "Otherwise, evaluate if '${userMessage}' validly chooses an option from the previous scenario.",
            "If valid, acknowledge and present the next unique, immersive scenario (Themes: Video Games , School Clubs , Sports or Hobbies. ).",
            "If invalid, the 'reply' should nudge them back to the choice and 'isValid' must be false.",
            "If progress is 5 and user answers validly, set 'isComplete' to true."
        ],
        "response_format": {
            "reply": "Conversational text",
            "isValid": "boolean",
            "isComplete": "boolean"
        },
        Do NOT return plain text.
Do NOT use markdown.
Do NOT use \`\`\`.
    }`;

    const result = await model.generateContent(onboardingPrompt);
    const data = JSON.parse(result.response.text());
    // console.log(data)
    // 3. Database State Management
    if (data.isValid || userMessage === "START") {
        // Atomic increment of the step
        await Student.updateOne(
            { _id: student._id }, 
            { $inc: { answers_count: 1 } }
        );
    }

    // 4. Completion Hook
    if (data.isComplete || student.answers_count >= 6) {
        await Student.updateOne(
            { _id: student._id }, 
            { $set: { onboarding_complete: true } }
        );
        
        // Trigger the profile generation (Non-blocking)
        calculateFinalRIASEC(student._id, true).catch(console.error);
        
        return `${data.reply} \n\n🎯 **Onboarding Complete!** I'm building your career dashboard now.`;
    }

    return data.reply;
}






async function calculateFinalRIASEC(studentID, isInitial = false) {
    const student = await Student.findOne({ _id: studentID });
    const { baseline, recent } = await getContextSlices(studentID, isInitial);
    // console.log(student)
    const prompt = `Analyze career evolution for ${student.name}.
    BASELINE: ${baseline}
    RECENT: ${recent}
    Weight recent trends 70%. Identify shifts.
    Return JSON: { "scores": {R,I,A,S,E,C}, "rationale": "string" }`;

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


async function classifyIntent(userMessage) {
    const prompt = `
Analyze the following student query for a career counseling app.

QUERY: "${userMessage}"

Classify the query into EXACTLY one of the following categories:

1. LOCAL_SEARCH:
Use this if the student is looking for colleges, schools, or institutions in a specific city, state, or mentions "near me", "my area", or "nearby".

2. GLOBAL_SEARCH:
Use this if the student is asking about colleges, universities, or entrance exams at a national level
(e.g., "Top IITs", "Best Medical colleges in India")
WITHOUT mentioning a specific city.

3. GENERAL_ADVICE:
Use this if the student is asking about career trends, "what is" questions, emerging sectors, advice on which profession to choose, or feelings about their future.

Return ONLY valid JSON:
{
  "category": "NAME",
  "detected_city": "NAME_OR_NULL"
}
`;

    const result = await model.generateContent(prompt);
    const rawReply = result.response.text();

    const cleanedReply = rawReply
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    try {
        return JSON.parse(cleanedReply);
    } catch (error) {
        console.log("Intent Parse Error:", cleanedReply);

        return {
            category: "GENERAL_ADVICE",
            detected_city: null
        };
    }
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
