const sendOTP = async (emailID, otp) => {
  // Mock sending email or SMS
  console.log(`\n================================`);
  console.log(`[Notification Service] Sending OTP`);
  console.log(`To: ${emailID}`);
  console.log(`OTP Code: ${otp}`);
  console.log(`================================\n`);
  
  // In a real application, you would integrate Twilio, Sendgrid, AWS SNS, etc. here.
  return Promise.resolve(true);
};

module.exports = {
  sendOTP
};
