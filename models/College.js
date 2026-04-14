// models/College.js
const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, default: "India" },
  type: { type: String, enum: ["Government", "Private", "Deemed", "Central"], required: true },
  courses: [{
    name: String,
    duration: String,
    eligibility: String,
    fees: Number
  }],
  brochure_embedding: { type: [Number] }, // Vector embedding for search
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('College', collegeSchema);