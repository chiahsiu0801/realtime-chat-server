const mongoose = require('mongoose');

// Define the schema
const roomSchema = new mongoose.Schema({
    userIdList: [{
        type: String,
        required: true,
    }],
    roomName: {
        type: String,
        required: true,
    },
});

// Create the model
const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
