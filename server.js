const { ObjectId } = require("mongodb");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const Comment = require("./models/commentModel.js");
const Member = require("./models/memberModel.js");
const Reply = require("./models/replyModel.js");
const Room = require("./models/roomModel.js");

const port = process.env.PORT || 5000;

dotenv.config();

const app = express();
const httpServer = createServer(app);
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.set("trust proxy", 1);

const corsOptions = {
  origin: [
		'http://localhost:5173',
		'https://chiahsiu0801.github.io'
	], // or an array of allowed origins
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // include cookies
	allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use((req, res, next) => {
  console.log('Request received:');
  console.log('Origin:', req.headers.origin);
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  next();
});

app.use(cors(corsOptions));


// const MemoryStore = require('memorystore')(session)

// app.use(session({
// 	name: 'user',
// 	saveUninitialized: true,
// 	cookie: { maxAge: 86400000 },
// 	store: new MemoryStore({
// 		checkPeriod: 86400000 // prune expired entries every 24h
// 	}),
// 	resave: false,
// 	secret: 'Anything'
// }))

app.use(session({
	secret: 'anything',
	name: 'user',
	resave: false,
	saveUninitialized: true,
	cookie: {
		secure: process.env.NODE_ENV === 'production', // Only use secure cookies in production
		httpOnly: true,
		sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Adjust sameSite based on environment
	}
}));

const io = new Server(httpServer, { cors: {
	origin: "http://localhost:5173",
	methods: ["GET", "POST"],
	credentials: true
}});

io.on('connection', (socket) => {
	socket.on('join_room', (data) => {
		const roomId = data.roomId;
		const userData = data.userData;

		// Store the user data in the socket instance
		socket.userData = userData;
		socket.roomId = roomId;
		socket.join(roomId);

		// Get the list of clients in the room
		const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);

		// Map client sockets to user data
		const usersInRoom = clients.map(clientId => {
			const clientSocket = io.sockets.sockets.get(clientId);
			return clientSocket.userData; // Assuming userData is stored in socket
		});

		// Notify all clients in the room about the new user
		io.to(roomId).emit('update_users_in_room', usersInRoom);

		// Notify others in the room that a new user has joined
		socket.to(roomId).emit('receive_join_room', userData);
	})

	socket.on('send_comment', (comment) => {
		socket.to(comment.roomId).emit('receive_comment', comment);
	})

	socket.on('send_reply', (reply) => {
		socket.to(reply.roomId).emit('receive_reply', reply);
	})

	socket.on('send_like', (likeData) => {
		socket.to(likeData.roomId).emit('receive_like', likeData);
	})

	socket.on('leave_room', (data) => {
    const roomId = data.roomId;
    const userData = data.userData;
    socket.leave(roomId);

    // Get the updated list of clients in the room
    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);

    // Map client sockets to user data
    const usersInRoom = clients.map(clientId => {
      const clientSocket = io.sockets.sockets.get(clientId);
      return clientSocket.userData;
    });

    // Notify all clients in the room about the updated user list
    io.to(roomId).emit('update_users_in_room', usersInRoom);
  });

	// getApiAndEmit(socket);
  socket.on('disconnect', () => {
    if (socket.roomId) {
      // Get the updated list of clients in the room
      const clients = Array.from(io.sockets.adapter.rooms.get(socket.roomId) || []);

      // Map client sockets to user data
      const usersInRoom = clients.map(clientId => {
        const clientSocket = io.sockets.sockets.get(clientId);
        return clientSocket.userData;
      });

      // Notify all clients in the room about the updated user list
      io.to(socket.roomId).emit('update_users_in_room', usersInRoom);
    }
  });
});

// app.set('port', process.env.PORT || 5000);

httpServer.listen(port, function () {
  // var port = httpServer.address().port;
  console.log('Running on : ', port);
});

app.get('/member', async function(req, res) {
	console.log('session.user in member: ', req.session.user);

	if(!req.session.user) {
		res.status(401);

		console.log('Without session id');

		return res.send({
			message: 'Without session id'
		});
	}
	const member = req.session.user;
	const roomId = req.query.roomId;

	if(roomId) {
		const room = await Room.findById(roomId);
		if (!room) {
			return res.status(404).send({ message: 'Room not found' });
		}

		const userIdList = room.userIdList;

		if(!userIdList.includes(member._id)) {
			res.status(401);

			return res.send({
				message: 'Permission to join the room is denied'
			})
		}
	}

	res.send({member: member});	
});

app.post('/signup', async function(req, res) {
	const { username, email, password, imageUrl }	= req.body.data;

	let member = await Member.findOne({ email: email });

	if(member !== null) {
		console.log('Sign in failed');

		res.status(400);
		
		return res.send({
			message: 'The provided email has already been registered',
			success: false
		});
	}

	member = new Member({
		name: username,
		email: email,
		password: password,
		imageUrl: imageUrl
	});

	await member.save();

	req.session.user = member;

	res.send({
		member: member.name,
		success: true
	})
});

app.post('/login', async function(req, res) {
  const { email, password } = req.body.data;

	let result = await Member.findOne({ email: email, password: password });

	if(result === null) {
		console.log('Login failed');

		res.status(400);

		return res.send({
			message: 'Incorrect email or password',
			success: false
		});
	}

	console.log('result in login: ', result);

	req.session.user = result;
	req.session.save()

	console.log('session in login: ', req.session.user);

	console.log('Login success');

	res.send({
		member: result.name,
		success: true
	});
});

app.get('/signout', function(req, res) {
	req.session.user = null;

	res.send({
		success: true
	});	
});

app.post('/comment', async function(req, res) {
	const { commentUserId, username, comment, date, imageUrl, roomId } = req.body;

	const result = new Comment({
		commentUserId: commentUserId,
		name: username,
		comment: comment,
		date: date,
		imageUrl: imageUrl,
		roomId: roomId,
	});

	// Save the comment to the database
	await result.save();

	res.send({
		success: true,
		newComment: result,
	})
});

app.get('/comment', async function(req, res) {
	const roomId = req.query.roomId;
	const room = await Room.findById(roomId);

	const result = await Comment.find({ roomId: roomId });
	const users = await Member.find({});
	let replyComments;

	const resultComments = [];

	for(let i = 0; i < result.length; i++) {
		const comment = result[i].toObject();
		const user = users.find((user) => user._id.toString() === comment.commentUserId);
		
		comment.imageUrl = user?.imageUrl;

		console.log('result[i].replyCommentIds: ', comment.replyCommentIds);
		if(comment.replyCommentIds) {
			replyComments = await Reply.find({ _id: { $in: comment.replyCommentIds } });
			// Attach the replies to the comment
			comment.replyComments = replyComments;
			// Remove the replyCommentIds field from the comment
			comment.replyCommentIds = undefined;
		}

		resultComments.push(comment);
	}

	console.log('result: ', result);

	res.send({
		success: true,
		comments: resultComments,
		roomName: room.roomName,
	})
});

app.get('/allmembers', async function(req, res) {
	const roomId = req.query.roomId;

	// Find the room by ID
	const room = await Room.findById(roomId);

	if (!room) {
		return res.status(404).send({ message: 'Room not found', success: false });
	}

	const userIdList = room.userIdList || [];

	// Find all members whose IDs are in the userIdList
	const members = await Member.find({
		_id: { $in: userIdList.map(id => new ObjectId(id)) }
	});

	res.send({
		success: true,
		members: members
	})
});

app.post('/like', async function(req, res) {
	const { commentId, likedUser, isLike } = req.body;

	// Find the comment by ID
	let likedComment = await Comment.findById(commentId);

	if (!likedComment.likedUser) {
		likedComment.likedUser = [likedUser];
	} else if (isLike) {
		if (!likedComment.likedUser.includes(likedUser)) {
			likedComment.likedUser.push(likedUser);
		}
	} else {
		likedComment.likedUser = likedComment.likedUser.filter(user => user.toString() !== likedUser.toString());
	}

	// Save the updated comment
	await likedComment.save();

	res.send({
		success: true
	});
});

app.post('/reply', async function(req, res) {
	const { repliedCommentId, reply, replyUserId } = req.body;

	// Create a new reply
	const newReply = new Reply({
		repliedCommentId: repliedCommentId,
		replyUserId: replyUserId,
		reply: reply,
	});

	// Save the reply to the database
	const replyComment = await newReply.save();

	// Update the original comment with the new reply ID
	const updatedComment = await Comment.findByIdAndUpdate(
		repliedCommentId,
		{ $push: { replyCommentIds: replyComment._id } },
		{ new: true }
	);

	res.send({
		success: true,
		newReplyId: replyComment.insertedId,
		repliedCommentUserId: updatedComment.commentUserId,
	});
});

app.post('/createroom', async function(req, res) {
	const { userId, roomName } = req.body;

	const newRoom = new Room({
		userIdList: [userId],
		roomName: roomName,
	});

	// Save the room to the database
	const savedRoom = await newRoom.save();

	res.send({
		success: true,
		newRoomId: savedRoom._id,
	});
});

app.post('/joinroom', async function(req, res) {
	const { roomId, userId } = req.body;

	const result = await Room.findById(roomId);

	if(result === null) {
		res.status(400);

		return res.send({
			message: 'Room is not exist!',
			success: false,
		});
	}

	result.userIdList.addToSet(userId);

	// Save the updated room
	await result.save();

	res.send({
		success: true,
	});
});

app.get('/room', async function(req, res) {
	// const roomCollection = db.collection('room');

	const userId = req.query.userId;

	const roomList = await Room.find({
		userIdList: userId
	});

	res.send({
		success: true,
		roomList: roomList,
	})
});

mongoose.connect(process.env.DATABASE_URL)
	.then(() => {
		console.log('Connected to database!');
	})
	.catch(() => {
		console.log('Connection failed!');
	});
