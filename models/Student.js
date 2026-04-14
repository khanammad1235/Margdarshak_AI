const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Basic Information
  // studentID: { type: String, unique: true }, // Auto-generated or custom ID
  grNo: { type: String, required: true }, // Unique identifier given during school enrolment (remains same throughout)
  name: { type: String, required: true },

  // Contact Information - Multiple emails and mobile numbers
  mobileNos: [{ type: String }], // Array of mobile numbers
  emailIDs: [{ type: String }], // Array of email IDs

  // Organization & Branch
  organizationID: { type: String, required: true },
  branchID: { type: String, required: true },

  // Academic Information
  rollNo: { type: String }, // Keeps changing every year
  standard: { type: Number, required: true, min: 9, max: 12 },
  division: { type: String }, // e.g., 'A', 'B', 'C'
  board: { type: String }, // The specific board the student follows
  stream: { type: String, default: 'General' }, // e.g., 'PCM', 'PCB', 'Commerce'
  // Academic Performance Data
  academicRecords: [{
    standard: { type: String }, // Which standard this record belongs to (e.g., "10", "11")
    term: { type: String }, // e.g., 'Finals', 'Mid-Term', 'Prelims'
    year: { type: String }, // e.g., '2025-26'
    marks: { type: mongoose.Schema.Types.Mixed } // e.g., { "Math": 95, "Science": 90, "English": 85 }
  }],
  address: {
    lineAddress1: { type: String },
    lineAddress2: String,
    landmark: String,
    city: { type: String },
    state: { type: String },
    pincode: { type: Number },
    country: { type: String }
  },
  onboarding_complete: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: String },
  updatedBy: { type: String },
  answers_count: { type: Number, default: 0 },
  message_counter: { type: Number, default: 0 },
  riasec_scores: { R: Number, I: Number, A: Number, S: Number, E: Number, C: Number },
  riasec_history: [{
    timestamp: { type: Date, default: Date.now },
    scores: Object,
    change_type: String,
    rationale: String
  }]


}, { timestamps: { createdAt: 'creationOn', updatedAt: 'updatedOn' } });

module.exports = mongoose.model('Student', studentSchema);