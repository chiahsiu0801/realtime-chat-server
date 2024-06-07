const mongoose = require("mongoose");

// Define the schema
const commentSchema = new mongoose.Schema({
    commentUserId: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    comment: {
        type: String,
        required: false,
    },
    date: {
        type: String,
        required: true,
        default: Date.now
    },
    imageUrl: {
        type: String,
        required: false,
    },
    roomId: {
        type: String,
        required: true,
    },
    replyCommentIds: [{
        type: mongoose.Schema.Types.ObjectId,
    }],
    likedUser: {
        type: [String],
    },
}, {
  timestamps: true,
});

// Create the model
const Comment = mongoose.model("Comment", commentSchema);

module.exports = Comment;
