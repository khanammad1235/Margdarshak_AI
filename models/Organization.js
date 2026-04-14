const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  orgID: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  address: {
    lineAddress1: { type: String},
    lineAddress2: String,
    landmark: String,
    city: { type: String },
    state: { type: String },
    pincode: { type: Number },
    country: { type: String }
  },
  mobileNo: { type: Number, required: true },
  emailID: { type: String, required: true },
  orgType: { type: String, required: true },
  numOfBranches: { type: Number, required: true },
  password: { type: String, required: true },
  isDeleted: { type: Boolean, default: false },
  createdBy: { type: String, required: true },
  updatedBy: String
}, { timestamps: { createdAt: 'creationOn', updatedAt: 'updatedOn' } });

module.exports = mongoose.model('Organization', organizationSchema);
