const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  otp: { type: String, required: true },
  emailID: { type: String,   },
  mobileNo: { type: Number,  },
  creationOn: {
    type: Date,
    default: Date.now,
    expires: 300 // 5 minutes
  }

}, { timestamps: { createdAt: 'creationOn', updatedAt: 'updatedOn' }, strict: false });

module.exports = mongoose.model('OTP', otpSchema);