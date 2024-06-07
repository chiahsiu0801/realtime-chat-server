const mongoose = require('mongoose');

// Define the schema
const replySchema = new mongoose.Schema({
    repliedCommentId: {
        type: String,
        required: true,
    },
    replyUserId: {
        type: String,
        required: true,
    },
    reply: {
        type: String,
        required: false,
    },
}, {
  timestamps: true,
});

// Create the model
const Reply = mongoose.model('Reply', replySchema);

module.exports = Reply;
