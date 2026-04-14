const mongoose = require('mongoose');
const conversationSchema = new mongoose.Schema({
  studentID: { type: String, required: true },
  sender: String, // "USER" or "AI"
  text: String, // What the user sees (e.g., "Option 1")
  // queryText: String,   // What the AI gets (e.g., "Tell me about my career paths")
  timestamp: { type: Date, default: Date.now }
});

// Indexing for faster retrieval of a student's history
conversationSchema.index({ studentID: 1, creationOn: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
