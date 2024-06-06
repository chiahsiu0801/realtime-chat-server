import mongo, { ObjectId } from "mongodb";
import express from "express";
import session from "express-session";
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost/your-app-name');

const client = new mongo.MongoClient(process.env.DATABASE_URL, {
	useNewUrlParser: true,
	useUnifiedTopology: true
});

let db = null;

async function initDB() {
	await client.connect();
	console.log('資料庫連線成功');
	db = client.db('member-system');
}

initDB();

const app = express();

// const corsOptions = {
//   origin: [
// 		'https://chiahsiu0801.github.io',
// 	], // or an array of allowed origins
//   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
//   credentials: true, // include cookies
// 	allowedHeaders: 'Content-Type,Authorization'
// };

app.use(cors());

app.set("trust proxy", 1);

app.use(session({
	secret: 'anything',
	name: 'user',
	resave: true,
	saveUninitialized: true,
	cookie: {
    secure:false,
    httpOnly:true,
  }
}));

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: 'https://chiahsiu0801.github.io' } });

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

app.set('port', process.env.PORT || 5000);

httpServer.listen(app.get('port'), function () {
  var port = httpServer.address().port;
  console.log('Running on : ', port);
});

app.get('/member', async function(req, res) {
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
		const roomCollection = db.collection('room');
		const room = await roomCollection.findOne({ _id: new ObjectId(roomId) });
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

app.get('/error', function(req, res) {
	const msg = req.query.msg;

	res.render('error.ejs', {
		msg: msg
	});
});

app.post('/signup', async function(req, res) {
	const { username, email, password, imageUrl }	= req.body.data;

	const collection = db.collection('member');

	let result = await collection.findOne({
		email: email
	});

	if(result !== null) {
		console.log('Sign in failed');

		res.status(400);
		
		return res.send({
			message: 'The provided email has already been registered',
			success: false
		});
	}

	result = await collection.insertOne({
		name: username,
		email: email,
		password: password,
		imageUrl: imageUrl
	});

	let member = await collection.findOne({
		_id: result.insertedId
	})

	req.session.member = member;

	res.send({
		member: member.name,
		success: true
	})
});

app.post('/login', async function(req, res) {
  const { email, password } = req.body.data;

	const collection = db.collection('member');

	let result = await collection.findOne({
		$and: [
			{email: email},
			{password: password}
		]
	});

	if(result === null) {
		console.log('Login failed');

		res.status(400);

		return res.send({
			message: 'Incorrect email or password',
			success: false
		});
	}

	req.session.user = result;
	req.session.save()

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
	const collection = db.collection('comment');
	
	const insertedResult = await collection.insertOne({
		commentUserId: commentUserId,
		name: username,
		comment: comment,
		date: date,
		imageUrl: imageUrl,
		roomId: roomId,
	});

	const result = await collection.findOne({
		_id: insertedResult.insertedId,
	});

	res.send({
		success: true,
		newComment: result,
	})
});

app.get('/comment', async function(req, res) {
	const commentCollection = db.collection('comment');
	const memberCollection = db.collection('member');
	const replyCollection = db.collection('reply');
	const roomCollection = db.collection('room');

	const roomId = req.query.roomId;

	const room = await roomCollection.findOne({
		_id: new ObjectId(roomId),
	})

	const result = await commentCollection.find({
		roomId: roomId,
	}).toArray();
	const users = await memberCollection.find({}).toArray();
	let replyComments;

	for(let i = 0; i < result.length; i++) {
		const user = users.find((user) => user.name === result[i].name);
		
		result[i].imageUrl = user?.imageUrl;

		if(result[i].replyCommentIds) {
			replyComments = await replyCollection.find({ _id: { $in: result[i].replyCommentIds } }).toArray();
			
			result[i].replyComments = replyComments;
			delete result[i].replyCommentIds; 
		}
	}

	res.send({
		success: true,
		comments: result,
		roomName: room.roomName,
	})
});

app.get('/allmembers', async function(req, res) {
	const roomId = req.query.roomId;

	const roomCollection = db.collection('room');
	const memberCollection = db.collection('member');

	const room = await roomCollection.findOne({
		_id: new ObjectId(roomId),
	})

	const userIdList = room.userIdList || [];

	// Find all members whose IDs are in the userIdList
	const members = await memberCollection.find({
		_id: { $in: userIdList.map(id => new ObjectId(id)) },
	}).toArray();

	res.send({
		success: true,
		members: members
	})
});

app.post('/like', async function(req, res) {
	const { commentId, likedUser, isLike } = req.body;

	const commentCollection = db.collection('comment');

	let likedComment = await commentCollection.findOne({
		_id: new ObjectId(commentId)
	});

	if(!(likedComment.likedUser)) {
		likedComment.likedUser = [likedUser];
	} else if(isLike) {
		likedComment.likedUser.push(likedUser);
	} else if(!isLike) {
		likedComment.likedUser = likedComment.likedUser.filter(user => user !== likedUser);
	}

	await commentCollection.replaceOne({
		_id: new ObjectId(commentId)	
	}, likedComment);

	res.send({
		success: true
	});
});

app.post('/reply', async function(req, res) {
	const { repliedCommentId, reply, replyUserId } = req.body;

	const replyCollection = db.collection('reply');

	const replyComment = await replyCollection.insertOne({
		repliedCommentId: repliedCommentId,
		replyUserId: replyUserId,
		reply: reply,
	});

	const commentCollection = db.collection('comment');

	const updatedComment = await commentCollection.findOneAndUpdate({
		_id: new ObjectId(repliedCommentId)
	}, {
		$push: {
			replyCommentIds: replyComment.insertedId,
		}
	}, {
		returnDocument: 'after',
	});

	res.send({
		success: true,
		newReplyId: replyComment.insertedId,
		repliedCommentUserId: updatedComment.commentUserId,
	});
});

app.post('/createroom', async function(req, res) {
	const { userId, roomName } = req.body;

	const roomCollection = db.collection('room');

	const newRoom = await roomCollection.insertOne({
		userIdList: [userId],
		roomName: roomName,
	});

	res.send({
		success: true,
		newRoomId: newRoom.insertedId,
	});
});

app.post('/joinroom', async function(req, res) {
	const { roomId, userId } = req.body;

	const roomCollection = db.collection('room');

	const result = await roomCollection.findOne({
		_id: new ObjectId(roomId),
	})

	if(result === null) {
		res.status(400);

		return res.send({
			message: 'Room is not exist!',
			success: false,
		});
	}

	await roomCollection.findOneAndUpdate({
		_id: new ObjectId(roomId)
	}, {
		$addToSet: {
			userIdList: userId,
		}
	});

	res.send({
		success: true,
	});
});

app.get('/room', async function(req, res) {
	const roomCollection = db.collection('room');

	const userId = req.query.userId;

	// Find rooms where the userId is in the userIdList array
	const result = await roomCollection.find({
		userIdList: { $in: [userId] }
	});

	const roomList = await result.toArray();

	res.send({
		success: true,
		roomList: roomList,
	})
});

const port = process.env.PORT || 3000;
app.listen(port, function() {
	console.log(`Express server started on port ${port}`);
});