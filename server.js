import mongo, { ObjectId } from "mongodb";
import express from "express";
import session from "express-session";

import mongoose from 'mongoose';

require('dotenv').config();

mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost/your-app-name');

const uri = 'mongodb+srv://root:root123@mycluster.qpzojmy.mongodb.net/?retryWrites=true&w=majority';
const client = new mongo.MongoClient(uri, {
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

app.use(session({
	secret: 'anything',
	name: 'user',
	resave: true,
	saveUninitialized: false
}));
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));
app.use(express.json());


app.get('/member', async function(req, res) {
	if(!req.session.member) {
		res.status(401);

		console.log('Without session id');

		return res.send({
			message: 'Without session id'
		});
	}

	const member = req.session.member;

	// const collection = db.collection('member');
	// let result = await collection.find({});
	console.log(member);
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

	console.log(imageUrl);

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

	req.session.member = result;

	console.log('Login success');

	res.send({
		member: result.name,
		success: true
	});
});

app.get('/signout', function(req, res) {
	req.session.member = null;

	res.send({
		success: true
	});	
});

app.post('/comment', async function(req, res) {
	const { username, comment, date } = req.body;

	console.log(username, comment, date);
	const collection = db.collection('comment');
	
	await collection.insertOne({
		name: username,
		comment: comment,
		date: date
	});

	res.send({
		success: true
	})
});

app.get('/comment', async function(req, res) {
	const commentCollection = db.collection('comment');
	const memberCollection = db.collection('member');
	const replyCollection = db.collection('reply');

	const result = await commentCollection.find({}).toArray();
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
		comments: result
	})
});

app.get('/allmembers', async function(req, res) {
	const memberCollection = db.collection('member');

	const members = await memberCollection.find({}).toArray();

	res.send({
		success: true,
		members: members
	})
});

app.post('/like', async function(req, res) {
	const { commentId, likedUser } = req.body;

	const commentCollection = db.collection('comment');

	let likedComment = await commentCollection.findOne({
		_id: new ObjectId(commentId)
	});

	if(!(likedComment.likedUser)) {
		likedComment.likedUser = [likedUser];
	} else if(!likedComment.likedUser.includes(likedUser)) {
		likedComment.likedUser.push(likedUser);
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

	console.log('repliedCommentId: ', repliedCommentId);
	console.log('reply: ', reply);
	console.log('replyUserId: ', replyUserId);

	const replyCollection = db.collection('reply');

	const replyComment = await replyCollection.insertOne({
		replyUserId: replyUserId,
		reply: reply,
	});	

	console.log(replyComment.insertedId);

	const commentCollection = db.collection('comment');

	await commentCollection.findOneAndUpdate({
		_id: new ObjectId(repliedCommentId)
	}, {
		$push: {
			replyCommentIds: replyComment.insertedId
		}
	});	

	res.send({
		success: true
	});
});

const port = process.env.PORT || 3000;
app.listen(port, function() {
	console.log(`Express server started on port ${port}`);
});