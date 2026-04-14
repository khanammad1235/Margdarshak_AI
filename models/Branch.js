const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  branchID: { type: String, required: true, unique: true },
  organizationID: { type: String, required: true },
  type: { type: String, required: true }, // e.g., 'High School', 'Junior College'
  name: { type: String, required: true },
  boards: [{ type: String, enum: ['CBSE', 'ICSE', 'IB', 'State Board', 'IGCSE'] }], // Boards offered
  address: {
    lineAddress1: { type: String, required: true },
    lineAddress2: String,
    landmark: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: Number, required: true },
    country: { type: String, required: true }
  },
  mobileNo: { type: Number, required: true },
  emailID: { type: String, required: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: String, required: true },
  updatedBy: String
}, { timestamps: { createdAt: 'creationOn', updatedAt: 'updatedOn' } });

module.exports = mongoose.model('Branch', branchSchema);
