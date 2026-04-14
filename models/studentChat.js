const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true
    },

    text: {
      type: String,
      required: true,
      trim: true
    },

    mode: {
      type: String,
      enum: [
        "ONBOARDING",
        "COUNSELING",
        "GENERAL_ADVICE",
        "LOCAL_SEARCH",
        "GLOBAL_SEARCH"
      ],
      default: "COUNSELING"
    },

    intent: {
      type: String,
      enum: [
        "GENERAL_ADVICE",
        "LOCAL_SEARCH",
        "GLOBAL_SEARCH"
      ],
      default: "GENERAL_ADVICE"
    },

    metadata: {
      step: Number,
      recommendations: [String],
      vectorContextUsed: {
        type: Boolean,
        default: false
      }
    },

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const studentChatSchema = new mongoose.Schema(
  {
    studentID: {
      type: String,
      required: true,
      index: true
    },

    organizationID: {
      type: String,
      index: true
    },

    branchID: {
      type: String,
      index: true
    },

    studentName: String,

    messages: {
      type: [messageSchema],
      default: []
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    lastMode: {
      type: String,
      default: "COUNSELING"
    },

    aiSummary: {
      type: String
    },

    riskFlags: {
      type: [String],
      default: []
    },

    isArchived: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: {
      createdAt: "creationOn",
      updatedAt: "updatedOn"
    }
  }
);

studentChatSchema.index({
  studentID: 1,
  lastMessageAt: -1
});

module.exports = mongoose.model("StudentChat", studentChatSchema);