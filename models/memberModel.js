const mongoose = require("mongoose");

// Define the schema
const memberSchema = new mongoose.Schema({
  name: {
      type: String,
      required: true,
  },
  email: {
      type: String,
      required: true,
      unique: true,
      match: [/.+\@.+\..+/, 'Please fill a valid email address']
  },
  password: {
      type: String,
      required: true,
  },
  imageUrl: {
      type: String,
      required: false,
  },
}, {
  timestamps: true,
});

// Create the model
const Member = mongoose.model("Member", memberSchema);

module.exports = Member;
