const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

  name: { type: String, required: true },
  emailID: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true }, // Hashed password
  
  // ROLE DEFINITION
  role: { 
    type: String, 
    required: true, 
    enum: ['SYSTEM_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELOR', 'STUDENT'],
    default: 'STUDENT'
  },

  // ACCESS SCOPE (The "Where")
  // For System Admin: Both are null (Global access)
  // For Org Admin: organizationID is set, branchID is null
  // For Branch Admin/Counselor: Both are set
  organizationID: { type: String},
  organizationType: { type: String}, // Optional field to specify organization type
  branchID: { type: String},
  mobileNo: { type: Number, required: true },
  isDeleted: { type: Boolean, default: false },
  creationOn: { type: Date, default: Date.now },
  createdBy: { type: String, required: true },
  updatedOn: { type: Date, default: Date.now },
  updatedBy: String
});

// Indexing for fast login and permission checks
userSchema.index({ emailID: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);
