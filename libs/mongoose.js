var mongoose    = require('mongoose');
var log         = require('./log')(module);

var config      = require('./config');

mongoose.connect(config.get('mongoose:uri'));


//mongoose.connect('mongodb://localhost/test1');
var db = mongoose.connection;

db.on('error', function (err) {
    log.error('connection error:', err.message);
});
db.once('open', function callback () {
    log.info("Connected to DB!");
});




var Schema = mongoose.Schema;

// Schemas
var Images = new Schema({
    kind: {
        type: String,
        enum: ['thumbnail', 'detail'],
        required: true
    },
    url: { type: String, required: true }
});

var Article = new Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    images: [Images],
    modified: { type: Date, default: Date.now }
});

// validation
Article.path('title').validate(function (v) {
    return v.length > 5 && v.length < 70;
});

var ArticleModel = mongoose.model('Article', Article);

module.exports.ArticleModel = ArticleModel;

var Avatars = new Schema({
url: { type: String, required: false },
changed_at: {type: Date, default: Date.now}
});

var UserLinks = new Schema({
user_id: {type:Schema.Types.ObjectId, required: true},
first_name: {type: String, required: false},
last_name: {type:  String, required: false},
placed_at: {type: Date, default: Date.now}
});

var TagName = new Schema({
tag_id: {type:Schema.Types.ObjectId, required: true},
tag_name: {type:String, required: true}
});

var TagNames = new Schema({
tag_name: [TagName]
});

var Groups = new Schema({
group_id: {type:Schema.Types.ObjectId, required: true},
user_id: {type:Schema.Types.ObjectId, required: true},
server_group: {type:String, default: "0"},
group_name: {type:String, required: true},
group_desc: {type:String, required: false},
members: [UserLinks]
});

var GroupLinks= new Schema({
group_name: {type:String, required: true},
id: {type:Schema.Types.ObjectId, required: true},
});


var Templates = new Schema({
template_id: {type:Schema.Types.ObjectId, required: true},
user_id: {type:Schema.Types.ObjectId, required: true},
template_name: {type:String, required: true},
template_desc: {type:String, required: false},
private: {type:Boolean, required: false},
groups: [GroupLinks],
authors: [UserLinks],
comment: {type:String, required: false},
tags: [TagName]
});

var Favorites = new Schema({
messageId: {type:Schema.Types.ObjectId, required: true},
author: {type:String, required: true},
comment: {type:String, required: true},
tags: [TagName]
});


var Users = new Schema({
	author_id: {type: Schema.Types.ObjectId, required: false},
    email: { type: String, required: false},
	phone_num: { type: String, required: false},
	password: { type: String, required: false},
	first_name: { type: String, required: false},
	last_name: { type: String, required: false},
	username: { type: String, required: false},
	about: { type: String, required: false},
	avatarFull: [Avatars],
	avatar: { type: Number, default: 0},
	avatar_changed: {type: String, required: false},
	friendship_requests: [UserLinks],
	blackList: [UserLinks],
	followingLinks: [UserLinks],
	friends: [UserLinks],
	tags: [TagName],
	authorTags: [TagName],
	favorites: [Favorites],
	followers: { type: Number, default: 0},
	followings: { type: Number, default: 0}
});


var Author = new Schema({
	Id: { type: Schema.Types.ObjectId, required: true},
	first_name: { type: String, required: false},
	last_name: { type: String, required: false},
});

var File = new Schema ({
	url: { type: String, required: true},
	filename: { type: String, required: false},
});

var Geo = new Schema ({
	lon: { type: String, required: true},
	att: { type: String, required: true},
});

var Messages = new Schema({
    message_id: {type:Schema.Types.ObjectId, required: true},
	original_msg_id: { type: String, required: false},
	author_id: { type: String, required: false},
	author_name: { type: String, required: false},
	file_name: { type: String, required: false},
	video_file_name: { type: String, required: false},
	photo_file_name: { type: String, required: false}, 	
	geo: [Geo],
	placed_at: {type: Date, default: Date.now},
	date: {type:String, required: false},
	date_time: {type:Number, required: false},
	author_comment: { type: String, required: false},
	waitreply: {type:Boolean, required: false},
	delivery_date: {type:Date, required: false},
	parent_id: {type:Schema.Types.ObjectId, required: false},
	prevMessageId: {type:Schema.Types.ObjectId, required: false},
	tags: [TagName],
	authorTags: [TagName],
	recipients: [UserLinks],
	groups: [GroupLinks],
	groupsuser: [UserLinks],
	public_message: {type:Boolean, required: false},
	view_at: {type:Date},
	replies: [Favorites],
	reply_count: {type:Number, default:Date.now},
});

var Tokens = new Schema({
	userId: {type:Schema.Types.ObjectId, required: true},
	token: { type: String, required: true},
	secret: { type: String, required: true},
	placed_at: {type:Date, default:Date.now}
});

var Registration = new Schema({
	email: { type: String, required: false},
	phonenum: { type: String, required: false},
	code: { type: String, required: true},
	placed_at: {type:Date, default:Date.now}
});

var RegistrationModel = mongoose.model('Registration', Registration);
var TokensModel = mongoose.model('Tokens', Tokens);
var MessagesModel = mongoose.model('Messages', Messages);
var UsersModel = mongoose.model('Users', Users);
var GroupsModel = mongoose.model('Groups', Groups);
var TemplatesModel = mongoose.model('Templates', Templates);
var TagNamesModel = mongoose.model('TagNames', TagNames);


module.exports.RegistrationModel = RegistrationModel;
module.exports.TokensModel = TokensModel;
module.exports.MessagesModel = MessagesModel;
module.exports.UsersModel = UsersModel;
module.exports.GroupsModel = GroupsModel;
module.exports.TemplatesModel = TemplatesModel;
module.exports.TagNamesModel = TemplatesModel;
