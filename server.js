var path            = require('path');
var express         = require('express');
var encryptor = require('file-encryptor');
 // модуль для парсинга пути
var morgan = require('morgan');
//var mongoose = require('mongoose');
var bodyParser = require('body-parser') ;
var async = require('async');
var nodemailer = require('nodemailer');  // отправка почты
var log             = require('./libs/log')(module);
var md5             = require('./libs/md5.js');
var config          = require('./libs/config');
//var request = require('request');
var http = require('http');
var busboy = require('connect-busboy'); //middleware for form/file upload
var path = require('path');     //used for file path
var fs = require('fs-extra');       //File System - for file manipulation
var pg = require('pg');
var net = require('net');
//var FormData = require('form-data');

var ffmpeg = require('liquid-ffmpeg');
var u = [];
var ntfy = [];
var request = require('request');
var in_request;
log.info('port='+config.get('port'));
var httpreq = require('httpreq');
var app = express();
var conString = config.get('postgresConnection');
var mainPath = config.get('mainPath')//'C:/Users/VGA/nodeapi/';
var publicDirectory = 'img';
    var storageFormat = '.wav';
    var recognizingFormat = '.wav';	
	var storageAudioBitrate = '160k';
	var storageAudioFrequency = 22050;
	var recognizingAudioBitrate = '16k';
	var recognizingAudioFrequency = 8000;
	var recognizingURL = 'https://dictation.nuancemobility.net/NMDPAsrCmdServlet/dictation';
	var recognizingAppId = 'NMDPTRIAL_vanfin120120219013811';
	var recognizingAppKey = '22936f2466829b67614bb0cc61b510f776dbadb59395facac8dce35e49d4f36c676290cee42b354577e511d89a22d010fd7dc69012c05ada9d3e39e6122c5279';
	var recognizingContentType = 'audio/x-wav;codec=pcm;bit=16;rate=8000';
	var proxySettings = 'http://vanfin:SomeInte09@cache.fors.ru:3128';
	var API_ACCESS_KEY = 'AIzaSyDq5rRcFz2SqhWH8ftBc8_aJpm2MHwC8do';
	var gcmURL = 'https://android.googleapis.com/gcm/send';
	
	var schedule = require('node-schedule');
//this starts initializes a connection pool
//it will keep idle connections open for a (configurable) 30 seconds
//and set a limit of 20 (also configurable)
app.use(busboy());

(function() {
    var childProcess = require("child_process");
    oldSpawn = childProcess.spawn;
    function mySpawn() {
        console.log('spawn called');
        console.log(arguments);
        var result = oldSpawn.apply(this, arguments);
        return result;
    }
    childProcess.spawn = mySpawn;
})();

if (config.get('host')=='10.2.3.118'){
			in_request = request.defaults({proxy: proxySettings});
		} else {
			in_request = request;
		};
		
//app.use(express.favicon()); // отдаем стандартную фавиконку, можем здесь же свою задать
//app.use(morgan('combined')) // выводим все запросы со статусами в консоль
app.use(bodyParser.json()); // стандартный модуль, для парсинга JSON в запросах
//app.use(express.methodOverride()); // поддержка put и delete
//app.use(app.router); // модуль для простого задания обработчиков путей
app.use(express.static(path.join(__dirname, "public"))); // запуск статического файлового сервера, который смотрит на папку public/ (в нашем случае отдает index.html)
log.info('conString='+conString);
pg_connect_get_users(conString);
//pg_connect_get_ntfy(conString);


app.get('/api', function (req, res) {
    res.send('API is running');
});

function pg_connect_get_users(cs){
pg.connect(cs, function(err, client, done) {
	if(err) {
		return console.error('error fetching client from pool - get users', err);
	}
	client.query('select wt.getvalidusers();', function(err, result) {
    //call `done()` to release the client back to the pool
		done();
		if(err) {
			return console.error('error running query - get users', err);
		}
		console.log(result.rows[0]);
		var x = result.rows[0].getvalidusers;
		if (x.success == 1) {
			for (var i=0;i<x.users.length;i++) {
				var user = x.users[i];
				u[user.token]={'id':user.id,'secret':user.secret};
				log.info('user.token='+user.token+' id='+user.id);
				log.info('u.secret1111='+u[user.token].secret);
			}
		} 
	});
});
}






function pg_connect_get_ntfy(cs){
pg.connect(cs, function(err, client, done) {
	if(err) {
		return console.error('error fetching client from pool - get users', err);
	}
	client.query('select wt.getfuturenotify();', function(err, result) {
    //call `done()` to release the client back to the pool
		done();
		if(err) {
			return console.error('error running query - get ntfy', err);
		}
		console.log(result.rows[0]);
		var x = result.rows[0].getfuturenotify;
		if (x.success == 1 && (x.messages)) {
			for (var i=0;i<x.messages.length;i++) {
				var message = x.messages[i];
				var date = new Date(message.date_year, message.date_month-1, message.date_day, message.date_hour, message.date_minute, 0);
				var now = new Date();
				log.info('date-now='+(date-now)/1000/60/60/24);
				ntfy['s'+message.message_id]= schedule.scheduleJob(date, function(){
					sendPushNotifications(message.IOSdevice_ids, message.device_ids, message.is_control, message.text);
				});
				log.info('notify='+message.message_id+' id='+message.message_id+',date='+date.toString());
			}
		} 
	});
});
}

function checkSignature2(paramarray, token, secret, signature, res){
    s = "";
	for (var k=0; k<paramarray.length; k++) {
		s = s + "&" + paramarray[k].name + "=" + paramarray[k].value;
	};
	var current_signature = md5.hex_md5("secret_key="+secret+"&token="+token+s);
	log.info('s='+s);
	//log.info('current_signature='+current_signature);
	//log.info('signature='+signature);
	if (current_signature!=signature) {
		return 0;
	} else {
		return 1;
	};
};




function pg_connect_with_signature(cs, proc, select_string, pa, token, signature, user_id, res) {
	var x = u[token];
	log.info('proc='+proc);
	log.info('select_string='+select_string);
	if (x != undefined) {
		log.info('x='+x.id);
		if (checkSignature2(pa, token, x.secret.trim(), signature, res)==1) {
			return pg_connect(cs, proc, select_string, res);
		} else {
			var y = { success : 0, error_text: "InvalidSignature" };
			return res.json(y).send;
		};
	} else {
	    pg.connect(cs, function(err, client, done) {
			if(err) {return console.error('error fetching client from pool', err);}
			client.query('select wt.gettoken2( \'' + token + '\');', function(err, result) {
    //call `done()` to release the client back to the pool
				done();
				if(err) {return console.error('error running query', err);}
				console.log(result.rows[0]);
				var x1 = result.rows[0].gettoken2;
				if (x1.success == 1) {
					u[x1.token]={'id':x1.user_id,'secret':x1.secret};
					var x = u[x1.token];
					if (x!=undefined) {
					if (checkSignature2(pa, token, x.secret.trim(), signature, res)==1) {
						return pg_connect(cs, proc, select_string, res);
					} else {
						var y = { success : 0, error_text: "InvalidSignature" };
						return res.json(y).send;
					};
					} else {
					    var y = { success : 0, error_text: "InvalidToken" };
						return res.json(y).send;
					}
				} else {
					var y = { success : 0, error_text: "InvalidToken" };
					return res.json(y).send;
				}
			});
		});
		
	}
}

function sendPushNotifications(ios_device_ids, device_ids, is_control, text) {
	log.info('Start push'+device_ids);
    if (is_control==1) {
		l_vibrate = 1;
		l_sound = 1;
		l_title = 'New task';
		l_message = 'New task';
	} else {
		l_vibrate = 0;
		l_sound = 0;
		l_title = 'New notice';
		l_message = 'New notice';
	};
	if (text){
		l_message = l_message + ': ' + text; 
	};
	
    var data = 	{ 'notification': {
			'message':l_message,
			'title':l_title,
			'vibrate':l_vibrate,
			'sound':l_sound
			},
			'registration_ids' : device_ids
		};
	
	    in_request({
			url: gcmURL, //URL to hit
			method: 'POST',
			headers: {
				'Authorization': 'key='+API_ACCESS_KEY,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data) //Set the body as a string
		}, function(error, response, body){
		   log.info('Get response');
		   if(error){log.info('error:'+error.message)};
		   log.info('response:'+response+':'+body);
		});
	
	
	


};

function checkHandlers(in_message_id, res) {
  var s = 'SELECT wt.handlerwork(\''+in_message_id+'\');';
  pg_connect (conString, 'handlerwork', s, res);
};



function pg_connect_with_signature_old(cs, proc, select_string, pa, token, signature, user_id, res) {
pg.connect(cs, function(err, client, done) {
  if(err) {
    return console.error('error fetching client from pool', err);
  }
  if (user_id!=null) { 
  client.query('select wt.gettoken(' + user_id + ',\'' + token + '\');', function(err, result) {
    //call `done()` to release the client back to the pool
    done();
    if(err) {
      return console.error('error running query', err);
    }
    console.log(result.rows[0]);
	var x = result.rows[0].gettoken;
	if (x.success == 1) {
		if (checkSignature2(pa, token, x.secret.trim(), signature, res)==1) {
			return pg_connect(cs, proc, select_string, res);
		} else {
			var y = { success : 0, error_text: "InvalidSignature" };
			return res.json(y).send;
		};
	} else {
		return res.json(x).send;
	}
  });
  } else {
  client.query('select wt.gettoken2( \'' + token + '\');', function(err, result) {
    //call `done()` to release the client back to the pool
    done();
    if(err) {
      return console.error('error running query', err);
    }
    console.log(result.rows[0]);
	var x = result.rows[0].gettoken2;
	if (x.success == 1) {
		if (checkSignature2(pa, token, x.secret.trim(), signature, res)==1) {
			return pg_connect(cs, proc, select_string, res);
		} else {
			var y = { success : 0, error_text: "InvalidSignature" };
			return res.json(y).send;
		};
	} else {
		return res.json(x).send;
	}
  });
  }
});
}



app.get('/wt/wt.gtw.postEmail', function(req, res){
 var in_email = req.query.in_email;

 var s = 'SELECT wt.postemail(\''+in_email+'\');';
 log.info(s);	
 pg_connect (conString, 'postEmail', s, res);
});

app.get('/wt/wt.gtw.postCode', function(req, res){
 var in_code = req.query.in_code;
 var in_email = req.query.in_email;
 var in_first_name = (req.query.in_first_name) ? req.query.in_first_name : '';
 var in_last_name = (req.query.in_last_name) ? req.query.in_last_name : '';
 var in_phone_number = (req.query.in_phone_number) ? req.query.in_phone_number : '';
 var in_username = req.query.in_username;
 
 var s = 'SELECT wt.postcode(\''+in_first_name+'\',\''+in_last_name+'\',\''+in_email+'\',\''+in_phone_number+'\',\''+in_username+'\',\''+in_code+'\');';
 log.info(s);	
 pg_connect (conString, 'postCode', s, res);
});

app.get('/wt/wt.gtw.changePassword', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_password = req.query.in_password;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[1] = {name: "in_user_id", value: in_user_id};
 pa[0] = {name: "in_password", value: in_password};
// in_signature = createSignature(pa, in_token, '4sJJoXxtkRmjVKnMtBUJ');
 var s = 'SELECT wt.changePassword('+in_user_id+',\''+in_password+'\');';
 pg_connect_with_signature(conString, 'changePassword', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.resetPassword', function(req, res){
 var in_email = req.query.in_email;
 var s = 'SELECT wt.resetPassword(\''+in_email+'\');';
 pg_connect (conString, 'resetPassword', s, res);
});

app.get('/rps2', function(req, res){
 var in_email = req.query.in_email;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_email", value: in_email};
// in_signature = createSignature(pa, in_token, 'MgEmef45qBlJmJOnshH3');
 var s = 'SELECT wt.resetPasswordStep2(\''+in_email+'\',\''+in_token+'\');';
 pg_connect_with_signature(conString, 'resetPassword2', s, pa, in_token, in_signature, null, res);
});

app.get('/wt/wt.gtw.searchPeople', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_query = req.query.in_query;
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) {pa[++k] = {name: "in_limit", value: in_limit}} else {in_limit = 20 };
 if (in_offset!=undefined) {pa[++k] = {name: "in_offset", value: in_offset}} else {in_offset = 0 };
 if (in_query!=undefined) {pa[++k] = {name: "in_query", value: in_query}} else {in_query = '' };
 if (in_user_id!=undefined) {pa[++k] = {name: "in_user_id", value: in_user_id}} else {in_user_id = 0 };
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.searchpeople('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'searchPeople', s, pa, in_token, in_signature, null, res);
});

app.get('/wt/wt.gtw.getPersonalInfo', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_logged_user = req.query.in_logged_user;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_logged_user", value: in_logged_user};
 pa[1] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getpersonalinfo('+in_user_id+','+in_logged_user+',\''+in_token+'\');';
 pg_connect_with_signature(conString, 'getPersonalInfo', s, pa, in_token, in_signature, null,  res);
});


app.get('/wt/wt.gtw.askFriendship', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_added_user_id = req.query.in_added_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_added_user_id", value: in_added_user_id};
 pa[1] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.askfriendship('+in_user_id+','+in_added_user_id+');';
 pg_connect_with_signature(conString, 'askFriendship', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.rejectFriendship', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_request_id = req.query.in_request_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_request_id", value: in_request_id};
 pa[1] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '4sJJoXxtkRmjVKnMtBUJ');
 var s = 'SELECT wt.rejectfriendship('+in_user_id+','+in_request_id+');';
 pg_connect_with_signature(conString, 'rejectFriendship', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.postFriendship', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_request_id = req.query.in_request_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_request_id", value: in_request_id};
 pa[1] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '4sJJoXxtkRmjVKnMtBUJ');
 var s = 'SELECT wt.postfriendship('+in_user_id+','+in_request_id+');';
 pg_connect_with_signature(conString, 'postFriendship', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.postfollowings', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_author_id = req.query.in_author_id;
 var in_follow_id = (req.query.in_follow_id) ? req.query.in_follow_id : 0;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 if (in_follow_id==0){
 pa[0] = {name: "in_author_id", value: in_author_id};
 pa[1] = {name: "in_user_id", value: in_user_id};
 //in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postfollowings('+in_user_id+','+in_author_id+');';
 } else {
 pa[0] = {name: "in_author_id", value: in_author_id};
 pa[1] = {name: "in_follow_id", value: in_follow_id};
 pa[2] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postfollowings('+in_user_id+','+in_author_id+','+in_follow_id+');';
 }
 pg_connect_with_signature(conString, 'postFollowings', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getFollowers', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_limit", value: in_limit};
 pa[1] = {name: "in_offset", value: in_offset};
 pa[2] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getfollowers('+in_user_id+','+in_limit+','+in_offset+',\''+in_token+'\');';
 pg_connect_with_signature(conString, 'getFollowers', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getFollowings', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_limit", value: in_limit};
 pa[1] = {name: "in_offset", value: in_offset};
 pa[2] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getfollowings('+in_user_id+','+in_limit+','+in_offset+',\''+in_token+'\');';
 pg_connect_with_signature(conString, 'getFollowings', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getFriends', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_limit", value: in_limit};
 pa[1] = {name: "in_offset", value: in_offset};
 pa[2] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getfriends('+in_user_id+','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getFriends', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getFriendshipask', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_limit", value: in_limit};
 pa[1] = {name: "in_offset", value: in_offset};
 pa[2] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getfriendshipask('+in_user_id+','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getFriendshipask', s, pa, in_token, in_signature, in_user_id, res);
});


app.get('/wt/wt.gtw.postGroups', function(req, res){
 var in_group_desc = req.query.in_group_desc;
 var in_group_id = req.query.in_group_id;
 var in_group_name = req.query.in_group_name;
 var in_group_server = req.query.in_group_server;
 var in_member = req.query.in_member;
 var in_todo = req.query.in_todo;
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_group_desc!=undefined) {pa[++k] = {name: "in_group_desc", value: in_group_desc}} else {in_group_desc = ''};
 if (in_group_id!=undefined) {pa[++k] = {name: "in_group_id", value: in_group_id}} else {in_group_id = 0 };
 if (in_group_name!=undefined) {pa[++k] = {name: "in_group_name", value: in_group_name}} else {in_group_name = ''};
 pa[++k] = {name: "in_group_server", value: in_group_server};
 if (in_member!=undefined) {pa[++k] = {name: "in_member", value: in_member}} else {in_member = '' };
 pa[++k] = {name: "in_todo", value: in_todo};
 pa[++k] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postgroups('+in_user_id+','+in_group_id+',\''+in_group_name+'\',\''+in_group_desc+'\',\''+in_member+'\','+in_group_server+',\''+in_todo+'\');';
 pg_connect_with_signature(conString, 'postGroups', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getGroups', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getgroups('+in_user_id+');';
 pg_connect_with_signature(conString, 'getGroups', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.changeAdminServerGroup', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_group_id = req.query.in_group_id;
 var in_new_admin_id = req.query.in_new_admin_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_group_id", value: in_group_id};
 pa[1] = {name: "in_new_admin_id", value: in_new_admin_id};
 pa[2] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.changeadminservergroup('+in_user_id+','+in_group_id+','+in_new_admin_id+');';
 pg_connect_with_signature(conString, 'changeAdminservergroup', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.postTemplates', function(req, res){
 var in_acl = req.query.in_acl;
 var in_default_template = req.query.in_default_template; 
 var in_followers = req.query.in_followers;
 var in_private = req.query.in_private;  
 var in_tags = req.query.in_tags;
 var in_template_desc = req.query.in_template_desc;
 var in_template_id = req.query.in_template_id;
 var in_template_name = req.query.in_template_name;
 var in_todo = req.query.in_todo;
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_acl!=undefined) {pa[++k] = {name: "in_acl", value: in_acl} } else { in_acl='' };
 pa[++k] = {name: "in_default_template", value: in_default_template};
 if (in_followers!=undefined) {pa[++k] = {name: "in_followers", value: in_followers}} else {in_followers='' };
 pa[++k] = {name: "in_private", value: in_private};
 if (in_tags!=undefined) {pa[++k] = {name: "in_tags", value: in_tags} } else {in_tags='' };
 if (in_template_desc!=undefined) {pa[++k] = {name: "in_template_desc", value: in_template_desc} } else { in_template_desc='' };
 if (in_template_id!=undefined) {pa[++k] = {name: "in_template_id", value: in_template_id} } else {in_template_id=0};
 if (in_template_name!=undefined) {pa[++k] = {name: "in_template_name", value: in_template_name} } else {in_template_name='' };
 pa[++k] = {name: "in_todo", value: in_todo};
 pa[++k] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.posttemplates('+in_user_id+','+in_template_id+',\''+in_template_name+'\',\''+in_template_desc+'\',\''+in_tags+'\',\''+in_acl+'\',\''+in_followers+'\',\''+in_todo+'\','+in_default_template+','+in_private+');';
 pg_connect_with_signature(conString, 'postTemplates', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getTemplates', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.gettemplates('+in_user_id+');';
 pg_connect_with_signature(conString, 'getTemplates', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.authenticate', function(req, res){
 var in_email = req.query.in_email;
 var in_password = req.query.in_password;

 log.info(in_password);
 var s = 'SELECT wt.authenticate(\''+in_email+'\',\''+in_password+'\');';
 pg_connect (conString, 'authenticate', s, res);
});

app.get('/wt/wt.gtw.registerNotification', function(req, res){
 var token = req.query.token;
 var in_device_id = req.query.in_device_id;
 var in_IOS = req.query.in_IOS;
 if (in_IOS==undefined){in_IOS = 0}; 
 //log.info(in_password);
 var s = 'SELECT wt.registernotification(\''+token+'\',\''+in_device_id+'\','+in_IOS+');';
 log.info('s='+s);
 pg_connect (conString, 'registernotification', s, res);
});

app.get('/wt/wt.gtw.mymessages', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_limit = req.query.in_limit;
 var in_query = req.query.in_query;
 var in_offset = req.query.in_offset;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 pa[++k] = {name: "in_limit", value: in_limit};
 pa[++k] = {name: "in_offset", value: in_offset};
 if (in_query!=undefined){pa[++k] = {name: "in_query", value: in_query}} else {in_query = ''};
 pa[++k] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.mymessages('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'mymessages', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.mydraftmessages', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_limit = req.query.in_limit;
 var in_query = req.query.in_query;
 var in_offset = req.query.in_offset;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 pa[++k] = {name: "in_limit", value: in_limit};
 pa[++k] = {name: "in_offset", value: in_offset};
 if (in_query!=undefined){pa[++k] = {name: "in_query", value: in_query}} else {in_query = ''};
 pa[++k] = {name: "in_user_id", value: in_user_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.mydraftmessages('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'myDraftmessages', s, pa, in_token, in_signature, in_user_id, res);
});


app.get('/wt/wt.gtw.messagecontent', function(req, res){
 var in_message_id = req.query.in_message_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_message_id", value: in_message_id};
 //pa[1] = {name: "in_token", value: in_token};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.messagecontent('+in_message_id+',\''+in_token+'\');';
 pg_connect_with_signature(conString, 'messageContent', s, pa, in_token, in_signature, null, res);
});

app.get('/wt/wt.gtw.get_avatar', function(req, res){
 var in_author_id = req.query.in_author_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 pa[0] = {name: "in_author_id", value: in_author_id};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.get_avatar('+in_author_id+');';
 pg_connect_with_signature(conString, 'getAvatar', s, pa, in_token, in_signature, null, res);
});

						  
app.get('/wt/wt.gtw.postmessages', function(req, res){
 log.info('query='+req.query.toString());
 var in_acl = req.query.in_acl;
 var in_author_comment = req.query.in_author_comment;
 var in_completed_method = req.query.in_completed_method;
 var in_delete_on_completed = req.query.in_delete_on_completed; 
 var in_delivery_date = req.query.in_delivery_date;
 var in_direct_msg = req.query.in_direct_msg;
 var in_due_date = req.query.in_due_date;
 var in_end_date = req.query.in_end_date;
 var in_file = req.query.in_file;
 log.info('in_file='+req.query.in_file);
 
 var in_file_mimetype = req.query.in_file_mimetype;
 var in_file_name = req.query.in_file_name;
 var in_length = req.query.in_length;
 var in_parent_id = req.query.in_parent_id;
 var in_prev_mess_id = req.query.in_prev_mess_id;       
 var in_signature = req.query.in_signature;
 var in_tags = req.query.in_tags;
 var in_token = req.query.in_token; 
 var in_user_id = req.query.in_user_id;
 var in_wait_reply = req.query.in_wait_reply;
 var in_version = req.query.in_version; 
 var in_lang = req.query.in_lang;
 var in_draft = req.query.in_draft;
 var in_control = req.query.in_control;
 
 var pa = new Array();
 if (in_version=='v2'){
	var k = -1;
	if (in_acl!=undefined) { pa[++k] = {name: "in_acl", value: in_acl} } else {in_acl=''};
	if (in_author_comment!=undefined) { pa[++k] = {name: "in_author_comment", value: in_author_comment} } else {in_author_comment=''};
	if (in_completed_method!=undefined) { pa[++k] = {name: "in_completed_method", value: in_completed_method} } else {in_completed_method=0};
	if (in_control!=undefined) { pa[++k] = {name: "in_control", value: in_control} } else {in_control=0};
	if (in_delete_on_completed!=undefined) { pa[++k] = {name: "in_delete_on_completed", value: in_delete_on_completed} } else {in_delete_on_completed=0};	
	if (in_delivery_date!=undefined) { pa[++k] = {name: "in_delivery_date", value: in_delivery_date} } else {in_delivery_date=''};
	if (in_direct_msg!=undefined) { pa[++k] = {name: "in_direct_msg", value: in_direct_msg} } else {in_direct_msg=''};
	if (in_due_date!=undefined) { pa[++k] = {name: "in_due_date", value: in_due_date} } else {in_due_date=''};
	if (in_end_date!=undefined) { pa[++k] = {name: "in_end_date", value: in_end_date} } else {in_end_date=''};
	if (in_file!=undefined) { pa[++k] = {name: "in_file", value: in_file} } else {in_file=''};
	log.info('pa0='+pa[0].name+':'+pa[0].value);
	if (in_file_mimetype!=undefined) { pa[++k] = {name: "in_file_mimetype", value: in_file_mimetype} } else {in_file_mimetype=''};
	if (in_file_name!=undefined) { pa[++k] = {name: "in_file_name", value: in_file_name} } else {in_file_name=''};
	if (in_length!=undefined) { pa[++k] = {name: "in_length", value: in_length} } else {in_length=''};
	if (in_parent_id!=undefined) { pa[++k] = {name: "in_parent_id", value: in_parent_id} } else {in_parent_id=0};
	if (in_prev_mess_id!=undefined) { pa[++k] = {name: "in_prev_mess_id", value: in_prev_mess_id} } else {in_prev_mess_id=0};
	if (in_tags!=undefined) { pa[++k] = {name: "in_tags", value: in_tags} } else {in_tags=''};
	if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=''};
	if (in_wait_reply!=undefined) { pa[++k] = {name: "in_wait_reply", value: in_wait_reply} } else {in_wait_reply=0};
//	in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
	if (in_file.indexOf('.wav')==-1) {
		in_file_after = in_file + storageFormat;
		sourceFile = mainPath+publicDirectory+'/'+in_file;
		destFile = mainPath+publicDirectory+'/'+in_file_after;
		encFile = mainPath+publicDirectory+'/'+in_file_after+'.dec';
		tempFile = mainPath+in_file_after;
		var proc = new ffmpeg({ source: sourceFile })
		.withAudioBitrate(storageAudioBitrate)
		.withAudioFrequency(storageAudioFrequency)
		.addOption('-hide_banner', '-y')
		.saveToFile(in_file_after, 
		function(stdout, stderr) {
			fs.unlinkSync(sourceFile);
			var source = fs.createReadStream(tempFile);
			var dest = fs.createWriteStream(destFile);
			source.pipe(dest);
			source.on('end', function() {
				fs.unlinkSync(tempFile);
				var in_key = md5.hex_md5(in_token+in_file_after); 	
				encryptor.encryptFile(destFile, encFile, in_key, function(err) {
				if (!err) {
					fs.unlinkSync(destFile);
				};
					var s = 'SELECT wt.postmessages(0,'+in_user_id+',\''+in_file_after+'\',\''+in_author_comment+'\',\''+in_tags+'\',\''
				+in_acl+'\',\''+in_direct_msg+'\','+in_parent_id+','+in_wait_reply+',\''+in_delivery_date+'\','+in_prev_mess_id+',\''
				+in_end_date+'\',\''+in_length+'\',\'\',0,\''+in_due_date+'\',\''+in_key+'\','+in_completed_method+','+in_delete_on_completed+','+in_control+');';
					pg_connect_with_signature(conString, 'postMessagesv2', s, pa, in_token, in_signature, null, res);
  // Encryption complete.
                
				});
				
				
			});
			source.on('error', function(err) { /* error */
				log.info(err);
			});
		})
	} else {
		in_file_after = in_file;
		destFile = mainPath+publicDirectory+'/'+in_file_after;
		encFile = mainPath+publicDirectory+'/'+in_file_after+'.dec';
				var in_key = md5.hex_md5(in_token+in_file_after); 	
				in_key='';
				encryptor.encryptFile(destFile, encFile, in_key, function(err) {
				if (!err) {
				//	fs.unlinkSync(destFile);
				};
				var s = 'SELECT wt.postmessages(0,'+in_user_id+',\''+in_file_after+'\',\''+in_author_comment+'\',\''+in_tags+'\',\''+in_acl+'\',\''+in_direct_msg+
				'\','+in_parent_id+','+in_wait_reply+',\''+in_delivery_date+'\','+in_prev_mess_id+',\''+in_end_date+'\',\''+
				in_length+'\',\'\',0,\''+in_due_date+'\',\''+in_key+'\','+in_completed_method+','+in_delete_on_completed+','+in_control+');';
				pg_connect_with_signature(conString, 'postMessagesv2', s, pa, in_token, in_signature, null, res);
					
  // Encryption complete.
                
				});
		
	}
	
	/*post_data = in_file + 'START11223344' + in_file_after;
	log.info(post_data);
	var client = net.connect({port: 9092 , host:'localhost'},function() { //'connect' listener
		console.log('connected to server!');
		client.write(post_data);
	});
	client.on('data', function(data) {
		log.info(data.toString());
		client.end();
	});
	client.on('end', function() {
	    var s = 'SELECT wt.postmessages(0,'+in_user_id+',\''+in_file_after+'\',\''+in_author_comment+'\',\''+in_tags+'\',\''+in_acl+'\',\''+in_direct_msg+'\','+in_parent_id+','+in_wait_reply+',\''+in_delivery_date+'\','+in_prev_mess_id+',\''+in_end_date+'\',\''+in_length+'\',\'\',0,\''+in_due_date+'\');';
	    pg_connect_with_signature(conString, 'postMessagesv2', s, pa, in_token, in_signature, null, res);
		log.info('disconnected from server');
		
	});
	
	*/

 };
 if (in_version=='v3'){
	var k = -1;
	if (in_acl!=undefined) { pa[++k] = {name: "in_acl", value: in_acl} } else {in_acl=''};
	if (in_author_comment!=undefined) { pa[++k] = {name: "in_author_comment", value: in_author_comment} } else {in_author_comment=''};
	if (in_completed_method!=undefined) { pa[++k] = {name: "in_completed_method", value: in_completed_method} } else {in_completed_method=0};
	if (in_control!=undefined) { pa[++k] = {name: "in_control", value: in_control} } else {in_control=0};
	if (in_delete_on_completed!=undefined) { pa[++k] = {name: "in_delete_on_completed", value: in_delete_on_completed} } else {in_delete_on_completed=0};	
	if (in_delivery_date!=undefined) { pa[++k] = {name: "in_delivery_date", value: in_delivery_date} } else {in_delivery_date=''};
	if (in_direct_msg!=undefined) { pa[++k] = {name: "in_direct_msg", value: in_direct_msg} } else {in_direct_msg=''};
	if (in_draft!=undefined) { pa[++k] = {name: "in_draft", value: in_draft} } else {in_draft=0};	
	if (in_due_date!=undefined) { pa[++k] = {name: "in_due_date", value: in_due_date} } else {in_due_date=''};
	if (in_end_date!=undefined) { pa[++k] = {name: "in_end_date", value: in_end_date} } else {in_end_date=''};
	if (in_file!=undefined) { pa[++k] = {name: "in_file", value: in_file} } else {in_file=''};
	if (in_file_mimetype!=undefined) { pa[++k] = {name: "in_file_mimetype", value: in_file_mimetype} } else {in_file_mimetype=''};
	if (in_file_name!=undefined) { pa[++k] = {name: "in_file_name", value: in_file_name} } else {in_file_name=''};
	if (in_lang!=undefined) { pa[++k] = {name: "in_lang", value: in_lang} } else {in_lang=''};
	if (in_length!=undefined) { pa[++k] = {name: "in_length", value: in_length} } else {in_length=''};
	if (in_parent_id!=undefined) { pa[++k] = {name: "in_parent_id", value: in_parent_id} } else {in_parent_id=0};
	if (in_prev_mess_id!=undefined) { pa[++k] = {name: "in_prev_mess_id", value: in_prev_mess_id} } else {in_prev_mess_id=0};
	if (in_tags!=undefined) { pa[++k] = {name: "in_tags", value: in_tags} } else {in_tags=''};
	if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=''};
	if (in_wait_reply!=undefined) { pa[++k] = {name: "in_wait_reply", value: in_wait_reply} } else {in_wait_reply=0};
	
//	in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');

var s = 'SELECT wt.postmessages(0,'+in_user_id+',\''+in_file_after+'\',\''+in_author_comment+'\',\''
					+in_tags+'\',\''+in_acl+'\',\''+in_direct_msg+'\','+in_parent_id+','+in_wait_reply+',\''+in_delivery_date
					+'\','+in_prev_mess_id+',\''+in_end_date+'\',\''+in_length+'\',\'##RESULT##\','+in_draft+',\''
					+in_due_date+'\',\'##INKEY##\','+in_completed_method+','+in_delete_on_completed+','+in_control+');';
	/*if (config.get('host')=='10.2.3.118'){
		var in_request = request.defaults({proxy: proxySettings});
	} else {
		var in_request = request;
	};				
*/
	

	
	
	
	
	
	if (in_file.indexOf('.wav')==-1) {
    


	
	in_file_after = in_file + storageFormat;
	in_file_wav = in_file_after + recognizingFormat;
	sourceFile = mainPath+publicDirectory+'/'+in_file;
	destFile = mainPath+publicDirectory+'/'+in_file_after;
	tempFile = mainPath+in_file_after;
	tempFileWav = mainPath+in_file_wav;
	encFile = mainPath+publicDirectory+'/'+in_file_after+'.dec';
	
	var proc = new ffmpeg({ source:  sourceFile}).withAudioBitrate(storageAudioBitrate)
	.withAudioFrequency(storageAudioFrequency).addOption('-hide_banner', '-y').saveToFile(in_file_after, 
	function(stdout, stderr) {
        fs.unlinkSync(sourceFile);
		var source = fs.createReadStream(tempFile);
		var dest = fs.createWriteStream(destFile);
		
		source.pipe(dest);
		source.on('end', function() {
		
		fs.unlinkSync(tempFile);

		recognize_on_creation(sourceFile, in_file_after, tempFile, destFile, in_file_wav, tempFileWav, encFile, in_lang, s, pa, in_token, in_signature, res);
		
		});
		source.on('error', function(err) { /* error */
			log.info(err);
		});
		
	})
	}
	else
	{
	
	
					
	
		in_file_after = in_file ;
	in_file_wav = in_file_after + recognizingFormat;
	sourceFile = mainPath+publicDirectory+'/'+in_file;
	destFile = mainPath+publicDirectory+'/'+in_file_after;
	tempFile = mainPath+in_file_after;
	tempFileWav = mainPath+in_file_wav;
	encFile = mainPath+publicDirectory+'/'+in_file_after+'.dec';
	
		recognize_on_creation(sourceFile, in_file_after, tempFile, destFile, in_file_wav, tempFileWav, encFile, in_lang, s, pa, in_token, in_signature, res);
		
/*	
			var result = '';
			l_lang = 'rus-RUS';
			if (in_lang.toUpperCase() == 'EN') {l_lang = 'eng-GBR'};
			if (in_lang.toUpperCase() == 'CN') {l_lang = 'yue-CHN'};
			if (in_lang.toUpperCase() == 'DE') {l_lang = 'deu-DEU'};
    		
			
			var proc = new ffmpeg({ source: destFile }).withAudioBitrate(recognizingAudioBitrate)
			.withAudioFrequency(recognizingAudioFrequency).withAudioChannels(1).addOption('-hide_banner', '-y').saveToFile(in_file_wav, 
			function(stdout, stderr) {
				in_request({
				url: recognizingURL, //URL to hit
				qs: {appId: recognizingAppId, appKey: recognizingAppKey}, //Query string data
				method: 'POST',
				headers: {
					'Content-Type': recognizingContentType,
					'Accept': 'text/plain',
					'Accept-Language': l_lang,
					'Accept-Topic': 'Dictation',
					'X-Dictation-NBestListSize': '1'
				},
				body: fs.readFileSync(tempFileWav) //Set the body as a string
			}, function(error, response, body){
				fs.unlinkSync(tempFileWav);
				if(error) {
					console.log(error);
					result=error;
				} else {
					console.log(response.statusCode, body);
					result = body;
					if (response.statusCode>399 && response.statusCode<500) {
						result = 'Request Error '+response.statusCode+': bad request';
					};
					if (response.statusCode>499) {
						result = 'Server Error:'+response.statusCode+' unable to process request';
					};
				}
				var in_key = md5.hex_md5(in_token+in_file_after); 	
				encryptor.encryptFile(destFile, encFile, in_key, function(err) {
					if (!err) {fs.unlinkSync(destFile);};
					s = s.replace('##RESULT##',result);
					s = s.replace('##INKEY##',in_key);
					pg_connect_with_signature(conString, 'postMessagesv3', s, pa, in_token, in_signature, null, res);
		
  // Encryption complete.
                
				});
			
		
				});
			})
*/
	}


 };
 });	
 
function recognize_on_creation(sourceFile, in_file_after, tempFile, destFile, in_file_wav, tempFileWav, encFile, in_lang, s, pa, in_token, in_signature, res){
	
	
			
			var result = '';
			l_lang = 'rus-RUS';
			if (in_lang.toUpperCase() == 'EN') {l_lang = 'eng-GBR'};
			if (in_lang.toUpperCase() == 'CN') {l_lang = 'yue-CHN'};
			if (in_lang.toUpperCase() == 'DE') {l_lang = 'deu-DEU'};
    		
			
			var proc = new ffmpeg({ source: destFile }).withAudioBitrate(recognizingAudioBitrate).withAudioFrequency(recognizingAudioFrequency)
			.withAudioChannels(1).addOption('-hide_banner', '-y').saveToFile(in_file_wav, 
			function(stdout, stderr) {
				in_request({
				url: recognizingURL, //URL to hit
				qs: {appId: recognizingAppId, appKey: recognizingAppKey}, //Query string data
				method: 'POST',
				headers: {
					'Content-Type': recognizingContentType,
					'Accept': 'text/plain',
					'Accept-Language': l_lang,
					'Accept-Topic': 'Dictation',
					'X-Dictation-NBestListSize': '1'
				},
				body: fs.readFileSync(tempFileWav) //Set the body as a string
			}, function(error, response, body){
				fs.unlinkSync(tempFileWav);
				if(error) {
					console.log(error);
					result=error;
				} else {
					console.log(response.statusCode, body);
					result = body;
					if (response.statusCode>399 && response.statusCode<500) {
						result = 'Request Error '+response.statusCode+': bad request';
					};
					if (response.statusCode>499) {
						result = 'Server Error:'+response.statusCode+' unable to process request';
					};
				}
				var in_key = md5.hex_md5(in_token+in_file_after); 	
				encryptor.encryptFile(destFile, encFile, in_key, function(err) {
				if (!err) {
				//	fs.unlinkSync(destFile);
				};
				s = s.replace('##RESULT##',result);
				s = s.replace('##INKEY##',in_key);
				pg_connect_with_signature(conString, 'postMessagesv3', s, pa, in_token, in_signature, null, res);
		
  // Encryption complete.
                
				});
				});
			})



			
		
	
} 


app.get('/wt/wt.gtw.postForwardedMessages', function(req, res){
 var in_acl = req.query.in_acl;
 var in_message_id = req.query.in_message_id;
 var in_author_comment = req.query.in_author_comment;
 var in_completed_method = req.query.in_completed_method;
 var in_control = req.query.in_control;
 var in_delete_on_completed = req.query.in_delete_on_completed; 
 var in_delivery_date = req.query.in_delivery_date;
 var in_direct_msg = req.query.in_direct_msg;
 var in_due_date = req.query.in_due_date;
 var in_end_date = req.query.in_end_date;
 var in_length = req.query.in_length;
 var in_parent_id = req.query.in_parent_id;
 var in_prev_mess_id = req.query.in_prev_mess_id;
 var in_signature = req.query.in_signature;
 var in_tags = req.query.in_tags;
 var in_token = req.query.in_token; 
 var in_text = req.query.in_text;  
 var in_user_id = req.query.in_user_id;
 var in_wait_reply = req.query.in_wait_reply;
 
 var pa = new Array();
	var k = -1;
	if (in_acl!=undefined) { pa[++k] = {name: "in_acl", value: in_acl} } else {in_acl=''};
	if (in_author_comment!=undefined) { pa[++k] = {name: "in_author_comment", value: in_author_comment} } else {in_author_comment=''};
	if (in_completed_method!=undefined) { pa[++k] = {name: "in_completed_method", value: in_completed_method} } else {in_completed_method=0};
	if (in_control!=undefined) { pa[++k] = {name: "in_control", value: in_control} } else {in_control=0};
	if (in_delete_on_completed!=undefined) { pa[++k] = {name: "in_delete_on_completed", value: in_delete_on_completed} } else {in_delete_on_completed=0};	
	if (in_delivery_date!=undefined) { pa[++k] = {name: "in_delivery_date", value: in_delivery_date} } else {in_delivery_date=''};
	if (in_direct_msg!=undefined) { pa[++k] = {name: "in_direct_msg", value: in_direct_msg} } else {in_direct_msg=''};
	if (in_due_date!=undefined) { pa[++k] = {name: "in_due_date", value: in_due_date} } else {in_due_date=''};
	if (in_end_date!=undefined) { pa[++k] = {name: "in_end_date", value: in_end_date} } else {in_end_date=''};
	if (in_length!=undefined) { pa[++k] = {name: "in_length", value: in_length} } else {in_length=''};
	if (in_message_id!=undefined) { pa[++k] = {name: "in_message_id", value: in_message_id} } else {in_message_id=''};
	if (in_parent_id!=undefined) { pa[++k] = {name: "in_parent_id", value: in_parent_id} } else {in_parent_id=0};
	if (in_prev_mess_id!=undefined) { pa[++k] = {name: "in_prev_mess_id", value: in_prev_mess_id} } else {in_prev_mess_id=0};
	if (in_tags!=undefined) { pa[++k] = {name: "in_tags", value: in_tags} } else {in_tags=''};
	if (in_text!=undefined) { pa[++k] = {name: "in_text", value: in_text} } else {in_text=''};
	if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=''};
	if (in_wait_reply!=undefined) { pa[++k] = {name: "in_wait_reply", value: in_wait_reply} } else {in_wait_reply=0};
//	in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
	var s = 'SELECT wt.postmessages('+in_message_id+','+in_user_id+',\'\',\''+in_author_comment+'\',\''+in_tags+'\',\''+in_acl+'\',\''+in_direct_msg+'\','+in_parent_id+','+in_wait_reply+',\''+in_delivery_date+'\','+in_prev_mess_id+',\''+in_end_date+'\',\''+in_length+'\',\''+in_text+'\',0,\''+in_due_date+'\',\'\','+in_completed_method+','+in_delete_on_completed+','+in_control+');';
	pg_connect_with_signature(conString, 'postForwardedMessages', s, pa, in_token, in_signature, null, res);
	
});


 
app.get('/wt/wt.gtw.postpersonalinfo', function(req, res){
 var in_about = req.query.in_about;
 var in_avatar = req.query.in_avatar;
 var in_email = req.query.in_email;
 var in_first_name = req.query.in_first_name;
 var in_last_name = req.query.in_last_name;
 var in_password = req.query.in_password;
 var in_phone_number = req.query.in_phone_number;
 var in_privacy = req.query.in_privacy;
 var in_status = req.query.in_status;
 var in_user_id = req.query.in_user_id;
 var in_username = req.query.in_username;

 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 
 var pa = new Array();
	var k = -1;
	if (in_about!=undefined) { pa[++k] = {name: "in_about", value: in_about} } else {in_about=''};
	if (in_avatar!=undefined) { pa[++k] = {name: "in_avatar", value: in_avatar} } else {in_avatar=''};
	if (in_email!=undefined) { pa[++k] = {name: "in_email", value: in_email} } else {in_email=''};
	if (in_first_name!=undefined) { pa[++k] = {name: "in_first_name", value: in_first_name} } else {in_first_name=''};
	if (in_last_name!=undefined) { pa[++k] = {name: "in_last_name", value: in_last_name} } else {in_last_name=''};
	if (in_password!=undefined) { pa[++k] = {name: "in_password", value: in_password} } else {in_password=''};
	if (in_phone_number!=undefined) { pa[++k] = {name: "in_phone_number", value: in_phone_number} } else {in_phone_number=''};
	if (in_privacy!=undefined) { pa[++k] = {name: "in_privacy", value: in_privacy} } else {in_privacy=0};
	if (in_status!=undefined) { pa[++k] = {name: "in_status", value: in_status} } else {in_status=''};
	if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=''};
	if (in_username!=undefined) { pa[++k] = {name: "in_username", value: in_username} } else {in_username=''};
//	in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
	var s = 'SELECT wt.postpersonalinfo('+in_user_id+',\''+in_first_name+'\',\''+in_last_name+'\',\''+in_email+'\',\''+in_phone_number+'\',\''+in_username+'\',\''+in_password+'\',\''+in_avatar+'\',\''+in_about+'\','+in_privacy+',\''+in_status+'\');';
	pg_connect_with_signature(conString, 'postPersonalinfo', s, pa, in_token, in_signature, null, res);
	
});

app.get('/wt/wt.gtw.postavatar', function(req, res){
 var in_avatar = req.query.in_avatar;
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
	var k = -1;
	if (in_avatar!=undefined) { pa[++k] = {name: "in_avatar", value: in_avatar} } else {in_avatar=''};
	if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=''};
//	in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
	var s = 'SELECT wt.postavatar(\''+in_avatar+'\','+in_user_id+');';
	pg_connect_with_signature(conString, 'postAvatar', s, pa, in_token, in_signature, null, res);

});

app.get('/wt/wt.gtw.getmessages', function(req, res){
 var in_author_id = req.query.in_author_id;
 var in_case = req.query.in_case;
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_order = req.query.in_order;
 var in_people = req.query.in_people;
 var in_user_id = req.query.in_user_id;
 var in_query = req.query.in_query;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_author_id!=undefined) { pa[++k] = {name: "in_author_id", value: in_author_id} } else {in_author_id=''};
 if (in_case!=undefined) { pa[++k] = {name: "in_case", value: in_case} } else {in_case=''};
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_order!=undefined) { pa[++k] = {name: "in_order", value: in_order} } else {in_order=''};
 if (in_people!=undefined) { pa[++k] = {name: "in_people", value: in_people} } else {in_people=''};
 if (in_query!=undefined) { pa[++k] = {name: "in_query", value: in_query} } else {in_query=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 if (in_case=='MSG'){
 
 var s = 'SELECT wt.getmessages('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getMessages', s, pa, in_token, in_signature, in_user_id, res);
 } else {
 var s = 'SELECT wt.getpublicmessages('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getPublicmessages', s, pa, in_token, in_signature, in_user_id, res);
 }
});

app.get('/wt/wt.gtw.getwaitingmessages', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_query = req.query.in_query;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_query!=undefined) { pa[++k] = {name: "in_query", value: in_query} } else {in_query=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.waitingmessages('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getWaitingmessages', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getwaitmemessages', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_query = req.query.in_query;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_query!=undefined) { pa[++k] = {name: "in_query", value: in_query} } else {in_query=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.waitmemessages('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getWaitmemessages', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getgroupsmessages', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_query = req.query.in_query;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_query!=undefined) { pa[++k] = {name: "in_query", value: in_query} } else {in_query=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getgroupsmessages('+in_user_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getGroupsmessages', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getgroupmessages', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_group_id = req.query.in_group_id; 
 var in_query = req.query.in_query;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_group_id!=undefined) { pa[++k] = {name: "in_group_id", value: in_group_id} } else {in_group_id=0};
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_query!=undefined) { pa[++k] = {name: "in_query", value: in_query} } else {in_query=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getgroupmessages('+in_user_id+','+in_group_id+',\''+in_query+'\','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getGroupmessages', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.postcomplete', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_compl_messages_id = req.query.in_compl_messages_id; 
 var in_uncompl_messages_id = req.query.in_uncompl_messages_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_compl_messages_id!=undefined) { pa[++k] = {name: "in_compl_messages_id", value: in_compl_messages_id} } else {in_compl_messages_id=0};
 if (in_uncompl_messages_id!=undefined) { pa[++k] = {name: "in_uncompl_messages_id", value: in_uncompl_messages_id} } else {in_uncompl_messages_id=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postcomplete('+in_user_id+','+in_compl_messages_id+','+in_uncompl_messages_id+');';
 pg_connect_with_signature(conString, 'postComplete', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.postfavorites', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_add_messages_id = req.query.in_add_messages_id; 
 var in_rem_messages_id = req.query.in_rem_messages_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_add_messages_id!=undefined) { pa[++k] = {name: "in_add_messages_id", value: in_add_messages_id} } else {in_add_messages_id=0};
 if (in_rem_messages_id!=undefined) { pa[++k] = {name: "in_rem_messages_id", value: in_rem_messages_id} } else {in_rem_messages_id=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postfavorites('+in_user_id+','+in_add_messages_id+','+in_rem_messages_id+');';
 pg_connect_with_signature(conString, 'postFavorites', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.messagetext', function(req, res){
 var in_message_id = req.query.in_message_id;
 var in_lang = req.query.in_lang; 
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_lang!=undefined) { pa[++k] = {name: "in_lang", value: in_lang} } else {in_lang='RU'};
 if (in_message_id!=undefined) { pa[++k] = {name: "in_message_id", value: in_message_id} } else {in_message_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.messagetext(\''+in_token+'\',\''+in_lang+'\','+in_message_id+');';
 pg_connect_with_signature(conString, 'messageText', s, pa, in_token, in_signature, null,  res);
});

app.get('/wt/wt.gtw.home', function(req, res){
	return res.send( 'OK' );
});

app.get('/wt/wt.gtw.getmessagereplies', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_message_id = req.query.in_message_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_message_id!=undefined) { pa[++k] = {name: "in_message_id", value: in_message_id} } else {in_message_id=0};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getmessagereplies('+in_user_id+','+in_message_id+','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getMessagereplies', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getfavorites', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getfavorites('+in_user_id+','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getFavorites', s, pa, in_token, in_signature, in_user_id, res);
});
 
app.get('/wt/wt.gtw.deletemessage', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_message_id = req.query.in_message_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_message_id!=undefined) { pa[++k] = {name: "in_message_id", value: in_message_id} } else {in_message_id=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.deletemessage('+in_user_id+','+in_message_id+');';
 pg_connect_with_signature(conString, 'deleteMessage', s, pa, in_token, in_signature, in_user_id, res);
});
 
app.get('/wt/wt.gtw.postblacklist', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_added_user_id = req.query.in_added_user_id;
 var in_blacklist_id = req.query.in_blacklist_id;
 var in_todo = req.query.in_todo;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_added_user_id!=undefined) { pa[++k] = {name: "in_added_user_id", value: in_added_user_id} } else {in_added_user_id=0};
 if (in_blacklist_id!=undefined) { pa[++k] = {name: "in_blacklist_id", value: in_blacklist_id} } else {in_blacklist_id=0};
 if (in_todo!=undefined) { pa[++k] = {name: "in_todo", value: in_todo} } else {in_todo=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postblacklist('+in_user_id+','+in_added_user_id+','+in_blacklist_id+',\''+in_todo+'\');';
 pg_connect_with_signature(conString, 'postBlacklist', s, pa, in_token, in_signature, in_user_id, res);
}); 
app.get('/download/:file(*)', function(req, res, next){
  var file = req.params.file; 
  var path = __dirname + '/img/' + file;
  log.debug('file='+file);
  res.download(path);
});	

app.get('/wt/wt.gtw.getblacklist', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getblacklist('+in_user_id+');';
 pg_connect_with_signature(conString, 'getBlacklist', s, pa, in_token, in_signature, in_user_id, res);
}); 

app.get('/wt/wt.gtw.emailmessages', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_message_id = req.query.in_message_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_message_id!=undefined) { pa[++k] = {name: "in_message_id", value: in_message_id} } else {in_message_id=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.emailmessage('+in_user_id+','+in_message_id+');';
 pg_connect_with_signature(conString, 'emailMessage', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.gettags', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.gettags('+in_user_id+');';
 pg_connect_with_signature(conString, 'getTags', s, pa, in_token, in_signature, in_user_id, res);
}); 

app.get('/wt/wt.gtw.postonechanneltags', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_tags = req.query.in_tags;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_tags!=undefined) { pa[++k] = {name: "in_tags", value: in_tags} } else {in_tags=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postonechanneltags('+in_user_id+',\''+in_tags+'\');';
 pg_connect_with_signature(conString, 'postOneChannelTags', s, pa, in_token, in_signature, in_user_id, res);
}); 


app.get('/wt/wt.gtw.getonechannelmessages2', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getonechannelmessages2('+in_user_id+','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getOnechannelmessages2', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.getauthortags', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getauthortags('+in_user_id+');';
 pg_connect_with_signature(conString, 'getAuthortags', s, pa, in_token, in_signature, in_user_id, res);
}); 

app.get('/wt/wt.gtw.getMessageInfo', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_message_id = req.query.in_message_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_message_id!=undefined) { pa[++k] = {name: "in_message_id", value: in_message_id} } else {in_message_id=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};

// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 log.info('SELECT wt.getmessageinfo('+in_user_id+','+in_message_id+');');
 var s = 'SELECT wt.getmessageinfo('+in_user_id+','+in_message_id+');';
 pg_connect_with_signature(conString, 'getMessageInfo', s, pa, in_token, in_signature, in_user_id, res);
}); 

app.get('/wt/wt.gtw.getauthortagmessages2', function(req, res){
 var in_limit = req.query.in_limit;
 var in_offset = req.query.in_offset;
 var in_user_id = req.query.in_user_id;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_limit!=undefined) { pa[++k] = {name: "in_limit", value: in_limit} } else {in_limit=20};
 if (in_offset!=undefined) { pa[++k] = {name: "in_offset", value: in_offset} } else {in_offset=0};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.getauthortagmessages2('+in_user_id+','+in_limit+','+in_offset+');';
 pg_connect_with_signature(conString, 'getAuthortagmessages2', s, pa, in_token, in_signature, in_user_id, res);
});

app.get('/wt/wt.gtw.postauthortags', function(req, res){
 var in_user_id = req.query.in_user_id;
 var in_tags = req.query.in_tags;
 var in_signature = req.query.in_signature;
 var in_token = req.query.in_token; 
 var pa = new Array();
 var k = -1;
 if (in_tags!=undefined) { pa[++k] = {name: "in_tags", value: in_tags} } else {in_tags=''};
 if (in_user_id!=undefined) { pa[++k] = {name: "in_user_id", value: in_user_id} } else {in_user_id=0};
// in_signature = createSignature(pa, in_token, '8tUeJ7fNgKDjwdoXmA8i');
 var s = 'SELECT wt.postauthortags('+in_user_id+',\''+in_tags+'\');';
 pg_connect_with_signature(conString, 'postAuthortags', s, pa, in_token, in_signature, in_user_id, res);
}); 

 

app.get('/download/:file(*)', function(req, res, next){
  var file = req.params.file; 
  var path = __dirname + '/img/' + file;
  log.debug('file='+file);
  res.download(path);
});	

function sendMail(to, subject, body){
    var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'vanfin1',
        pass: 'SomeInte01'
    }
    });
// NB! No need to recreate the transporter object. You can use
// the same transporter object for all e-mails

// setup e-mail data with unicode symbols
	var mailOptions = {
		from: 'vanfin <vanfin1@gmail.com>', // sender address
		to: to, // list of receivers
		subject: subject, // Subject line
		text: body // plaintext body
	};

// send mail with defined transport object
	transporter.sendMail(mailOptions, function(error, info){
    if(error){
            log.error('Internal error(%d): %s',res.statusCode,err.message);
//            return res.send({ error: 'Server error' });
    }else{
		log.info('Message sent');
//        return res.send( 'Message sent' );
    }
});

}
//[{'filename': file,'contents':data}]

function sendMailInner(transporter, to, subject, body, attachments, path, key){
		var mailOptions = {
						from: 'vanfin <vanfin1@gmail.com>', // sender address
						to: to, // list of receivers
						subject: subject, // Subject line
						text: body, // plaintext body
						attachments : attachments
					};
// send mail with defined transport object
					transporter.sendMail(mailOptions, function(error, info){
						if(error){
							log.error('Internal error(%d): %s',res.statusCode,err.message);
//            return res.send({ error: 'Server error' });
						}else{
							log.info('Message sent');
//        return res.send( 'Message sent' );
						}
						if (key) {
							try {
							fs.unlinkSync(path)
							} catch (e) {
								log.info('error del file:'+path);
							};
						};
						return;
					})
}

function sendMailWithAttachments(to, subject, body, key, file){
    var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'vanfin1',
        pass: 'SomeInte01'
    }
    });
		var path = __dirname + '/img/' + file;
		if (file!=undefined){
			if (key!=null){
				encryptor.decryptFile(path+'.dec', path, key, function(err) {
					fs.readFile(path, function (err, data) {
// setup e-mail data with unicode symbols
						var attachments = [{'filename': file,'content':data}];
						sendMailInner(transporter, to, subject, body, attachments, path, key);			
					});
				})	
			} else {
				fs.readFile(path, function (err, data) {
					var attachments = [{'filename': file,'content':data}];
					sendMailInner(transporter, to, subject, body, attachments, path, key);	
				});
			}
		}
// NB! No need to recreate the transporter object. You can use
// the same transporter object for all e-mails
}

function sendMailWith2Attachments(to, subject, body, key, file, attach2, attach2name){
    var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'vanfin1',
        pass: 'SomeInte01'
    }
    });
	log.info('Message prepear sent');
		var path = __dirname + '/img/' + file;
		if (file!=undefined){
			if (key!=null){
				encryptor.decryptFile(path+'.dec', path, key, function(err) {
					fs.readFile(path, function (err, data) {
// setup e-mail data with unicode symbols
						//log.info('data='+data);
						//log.info('attach2='+attach2);
						
						attachments = [{'filename': file,'content':data}, {'filename': attach2name,'content':attach2}];
						sendMailInner(transporter, to, subject, body, attachments, path, key);			
					});
				})	
			} else {
				fs.readFile(path, function (err, data) {
					attachments = [{'filename': file,'content':data}, {'filename': attach2name,'content':attach2}];
					sendMailInner(transporter, to, subject, body, attachments, path, key);	
				});
			}
		}
// NB! No need to recreate the transporter object. You can use
// the same transporter object for all e-mails
}



function checkSignature(paramarray, token, secret, signature, res){
		for (var k=0; k<paramarray.length; k++) {
			s = s + "&" + paramarray[k].name + "=" + paramarray[k].value;
		};
		var current_signature = md5("secret_key="+secret+"&token="+token+s);
		if (current_signature!=signature) return handleOurErr("InvalidSignature", res);
	};	



app.get('/sendTCPrequest', function(req, res1){
// Set the headers
	post_data = 'nubm.amrSTART11223344000nubm.mp3';
	var client = net.connect({port: 9092 , host:'10.2.3.118'},function() { //'connect' listener
		console.log('connected to server!');
		client.write(post_data);
	});
	client.on('data', function(data) {
		log.info(data.toString());
		client.end();
	});
	client.on('end', function() {
		log.info('disconnected from server');
		return res1.send('Sended2!');
	});
});

function getAPI(host, path, port, proc, paramarray){
	s = "";
	for (var k=0; k<paramarray.length; k++) {
		s = s + ((k == 0) ? '' : '&') + paramarray[k].name + "=" + paramarray[k].value;
	};
	var options = {
		host: host,
		port: port,
		path: path + proc + '=' + s
	};
	async.waterfall([
	function(callback){
		http.get(options, function(res) {
			log.info('Got response: ' + res.statusCode);
			res.on('data', function(chunk) {
				log.info('BODY: ' + chunk);
				callback(null,chunk);	
			});
		}).on('error', function(e) {
			log.info('Got error: ' + e.message);
			callback(e,null);
		});
	}
	],function (err, result){
	if (err) {
	    log.info('err: ' + err.message);
		return err;
	} else {
	    log.info('success: ' + result);
		return result; 
	}
	//return '1';
});
	
}

app.get('/sendTestRequestProc', function(req, res1){
	var pa = new Array();
	pa[0] = {name:"in_email", value: "vanfin@fors.ru"};
	var result = getAPI('japet-avg','/wt/wt.gtw.',80,'postEmail',pa);
	log.info('result after API: ' + result);
	if (result.message) {
		return res1.send('Error'+result.message)
	} else {
		return res1.send('Success'+result)
	}
});

app.get('/sendTestRequest', function(req, res1){
var result;
test_email = '?in_email=vanfin@fors.ru'
var options = {
  host: 'index.html',
  port: 80,
  path: '/wt/wt.gtw.postEmail' + test_email
};
log.info(options.path);


var result1;

async.waterfall([
	function(callback){
	
	http.get(options, function(res) {
       log.info('Got response: ' + res.statusCode);

       res.on('data', function(chunk) {
         log.info('BODY: ' + chunk);
		 callback(null,chunk);	
       });
    }).on('error', function(e) {
       log.info('Got error: ' + e.message);
	   callback(e);
    });
  }, 
  function(r, callback) {
     log.info('Second function: ' + r);  
	 callback(null, r);	
  }
],function (err, result){
    log.info('Final: ' + result); 
	result1 = result;
	if (err) {
		log.info('Got error: ' + err.message);
		return res1.send('End error');
	} else {
	    log.info('Before end: ' + result1);
		return res1.send(result1); 
	}
});

 	

});




app.get('/delFile', function(req, res1){
	var filePath = "C:/Users/VGA/nodeapi/img/1.txt" ; 
	fs.unlinkSync(filePath);
	res1.send('deleted');
});

//ffmpeg.exe -hide_banner -i %1 -ar 22050 -ab 160k -y %2

app.get('/convertFile', function(req, res1){


	var proc = new ffmpeg({ source: 'C:/Users/VGA/nodeapi/img/3qfa.amr' })
  .withAudioBitrate('160k')
  .withAudioFrequency(22050)
  .addOption('-hide_banner', '-y')
  .saveToFile('C:/Users/VGA/nodeapi/img/3qfa.mp3', function(stdout, stderr) {

  });
});




function recognize(file_in, lang, res) {
	var result;
	var file_out = file_in + '.wav';
	var proc = new ffmpeg({ source: mainPath+'img/'+file_in })
		.withAudioBitrate('16k')
		.withAudioFrequency(8000)
		.withAudioChannels(1)
		.addOption('-hide_banner', '-y')
		.saveToFile(file_out, function(stdout, stderr) {
			request({
		url: 'https://dictation.nuancemobility.net/NMDPAsrCmdServlet/dictation', //URL to hit
		qs: {appId: 'NMDPTRIAL_vanfin120120219013811', appKey: '22936f2466829b67614bb0cc61b510f776dbadb59395facac8dce35e49d4f36c676290cee42b354577e511d89a22d010fd7dc69012c05ada9d3e39e6122c5279'}, //Query string data
		method: 'POST',
		headers: {
        'Content-Type': 'audio/x-wav;codec=pcm;bit=16;rate=8000',
		'Accept': 'text/plain',
		'Accept-Language': lang,
		'Accept-Topic': 'Dictation',
		'X-Dictation-NBestListSize': '1'
		},
		body: fs.readFileSync(mainPath+file_out) //Set the body as a string
	}, function(error, response, body){
    if(error) {
        console.log(error);
		return res.send(error);
    } else {
        console.log(response.statusCode, body);
		fs.unlinkSync(mainPath+file_out);
		if (body.indexOf('AUDIO INFO')>0) {
			result = 'Nothing to recognize';
		} else {
			result = body;
		};
		return res.send(result);
    }
	});
})

}

app.get('/nuanceFile', function(req, res1){
	var in_file = req.query.file;
    return recognize(in_file,'deu-DEU', res1);
})	
	
  





app.route('/upload')
    .post(function (req, res, next)  {

        var fstream;
	var fn;
        req.pipe(req.busboy);
        /*req.busboy.on('field', function (fieldname, val) {
	        fn=val;	
		log.info('Field['+fieldname+']='+val);
	});*/
        req.busboy.on('file', function (fieldname, file, filename) {
            log.info("Uploading: " + filename);
            newfilename = filename;
            //Path where image will be uploaded
            fstream = fs.createWriteStream(__dirname + '/img/' + newfilename);
            file.pipe(fstream);
            fstream.on('close', function () {    
                log.info("Upload Finished of " + newfilename);
                if (fn==1) {
		return res.send('OK'+'type'+newfilename);
                } else {             
                return res.send('OK');
                };          
            });
        });
    });

app.route('/dict').post(function(req, res, next){
	log.info('here');
	res.send('OK');
});	
	
app.route('/wt/wt.document_api.upload')
    .post(function (req, res, next)  {

        var fstream;
	var fn;
        req.pipe(req.busboy);
        /*req.busboy.on('field', function (fieldname, val) {
	        fn=val;	
		log.info('Field['+fieldname+']='+val);
	});*/
        req.busboy.on('file', function (fieldname, file, filename) {
            log.info("Uploading: " + filename);
            newfilename = filename;
            //Path where image will be uploaded
            fstream = fs.createWriteStream(__dirname + '/img/' + newfilename);
            file.pipe(fstream);
            fstream.on('close', function () {    
                log.info("Upload Finished of " + newfilename);
                if (fn==1) {
		return res.send('OK'+'type'+newfilename);
                } else {             
                return res.send('OK');
                };          
            });
        });
    });	
	
function recognize(x, in_path, in_request, res) {
	var result = '';
	l_lang = 'rus-RUS';
	if (x.lang.toUpperCase() == 'EN') {l_lang = 'eng-GBR'};
	if (x.lang.toUpperCase() == 'CN') {l_lang = 'yue-CHN'};
	if (x.lang.toUpperCase() == 'DE') {l_lang = 'deu-DEU'};
			
	in_file_wav = x.file + recognizingFormat;
	tempFileWav = mainPath+in_file_wav;
			
	var proc = new ffmpeg({ source: in_path }).withAudioBitrate(recognizingAudioBitrate)
	.withAudioFrequency(recognizingAudioFrequency).withAudioChannels(1).addOption('-hide_banner', '-y').saveToFile(in_file_wav, 
	function(stdout, stderr) {
		
		in_request({
			url: recognizingURL, //URL to hit
			qs: {appId: recognizingAppId, appKey: recognizingAppKey}, //Query string data
			method: 'POST',
			headers: {
				'Content-Type': recognizingContentType,
				'Accept': 'text/plain',
				'Accept-Language': l_lang,
				'Accept-Topic': 'Dictation',
				'X-Dictation-NBestListSize': '1'
			},
			body: fs.readFileSync(tempFileWav) //Set the body as a string
		}, function(error, response, body){
			fs.unlinkSync(tempFileWav);
			if(error) {
				console.log(error);
				result=error;
			} else {
				console.log(response.statusCode, body);
				result = body;
				if (response.statusCode>399 && response.statusCode<500) {
					result = 'Request Error '+response.statusCode+': bad request';
				};
				if (response.statusCode>499) {
					result = 'Server Error:'+response.statusCode+' unable to process request';
				};
			}
			console.log('modifyY');
			if (x.key!=null) {fs.unlinkSync(in_path)};
			return sendTripleJSON(res, x.success, result, result)
			});
		})
	
}
	
	
function doneFileDownload(filePath, res, key, com, doc){
	log.info('doneFileDownload');
	
	log.info('x.key='+key);
	log.info('filePath='+filePath);
	
    	var filestream = fs.createReadStream(filePath);
		filestream.pipe(res);
		if (key!=null){fs.unlinkSync(filePath);}
		if ((com==1) && (doc==1)){
			fs.unlinkSync(filePath+'.dec');
		};
		return;
};

function sendSimpleJSON(res, success_digit, e_text){
	var y = { 	
		success:success_digit, 
		error_text: e_text
	};
	return res.json(y).send;
};	

function sendTripleJSON(res, success_digit, e_text, m_text){
	var y = { 	
		success:success_digit, 
		error_text: e_text,
		message_text: m_text
	};
	return res.json(y).send;
};	

function result_process(proc, result, res){
if (proc!='mymessages' && proc!='getAvatar' && proc!='getFriends'){
console.log('x='+JSON.stringify(result));
}
if (proc=='postEmail'){
	x = result.postemail;
	if (x.success==1){
// send mail
		sendMail(x.email, x.mail_subject, x.mail_text); 
// repack json 
    }; 
	var y = { 	
		success:x.success, 
		error_text: x.error_text,
		channel_type: x.channel_type
	};
	return res.json(y).send;
};
if (proc=='postCode') {
	x = result.postcode;
	if (x.success==1){
	/*for (k=1;k<u.length;k++){
		if (u[k].id==x.author[0].author_id){
			u[k].slice(1);
			break;
		};
	};*/
	u[x.token]={'id':x.author[0].author_id,'secret':x.secret};
	for (k=1;k<u.length;k++){
		var user = u[i];
		log.info('u.id='+user.id);
	};
	}
	return res.send(x);
}; 
if (proc=='getPersonalInfo') {
	x = result.getpersonalinfo;
	return res.send(x);
}; 
if (proc=='changePassword') {
	x = result.changepassword;
	return res.send(x);
};
if (proc=='resetPassword') {
	x = result.resetpassword;
	if (x.success==1){
// send mail
		sendMail(x.email, x.mail_subject, x.mail_text); 
// repack json 
		/*for (k=1;k<u.length;k++){
			if (u[k].id==x.author_id){
				u[k].slice(1);
				break;
			};
		};*/
		u[x.token]={'id':x.author_id,'secret':x.secret};
		for (k=1;k<u.length;k++){
			var user = u[i];
			log.info('u.id='+user.id);
		};
    }; 
	var y = { 	
		success:x.success, 
		error_text: x.error_text
	};
	return res.json(y).send;
};
if (proc=='resetPassword2') {
	x = result.resetpasswordstep2;
	if (x.success==1){
// send mail
		sendMail(x.email, x.mail_subject, x.mail_text); 
// repack json 
    }; 
	var y = { 	
		success:x.success, 
		error_text: x.error_text
	};
	return res.send('<h2>WorldTalk password successfully changed</h2><p>A letter containing new password has been sent to email address ' +x.email+ '.</p>');
};
if (proc=='searchPeople') {
	x = result.searchpeople;
	var y = { 	
		success:x.success, 
		error_text: x.error_text,
		authors: x.authors
	};
	return res.json(y).send;
};
if (proc=='askFriendship') {
	x = result.askfriendship;
	return res.send(x);
};
if (proc=='rejectFriendship') {
	x = result.rejectfriendship;
	return res.send(x);
};
if (proc=='postFriendship') {
	x = result.postfriendship;
	return res.send(x);
};
if (proc=='postFollowings') {
	x = result.postfollowings;
	return res.send(x);
};
if (proc=='getFollowers') {
	x = result.getfollowers;
	return res.send(x);
};
if (proc=='getFollowings') {
	x = result.getfollowings;
	return res.send(x);
};
if (proc=='getFriends') {
	x = result.getfriends;
	return res.send(x);
};
if (proc=='getFriendshipask') {
	x = result.getfriendshipask;
	return res.send(x);
};
if (proc=='postGroups') {
	x = result.postgroups;
	return res.send(x);
};
if (proc=='getGroups') {
	x = result.getgroups;
	return res.send(x);
};
if (proc=='changeAdminservergroup') {
	x = result.changeadminservergroup;
	return res.send(x);
};
if (proc=='postTemplates') {
	x = result.posttemplates;
	return res.send(x);
};
if (proc=='getTemplates') {
	x = result.gettemplates;
	return res.send(x);
};
if (proc=='authenticate') {
	x = result.authenticate;
	if (x.success==1){
	/*for (k=1;k<u.length;k++){
		if (u[k].id==x.author[0].author_id){
			u[k].slice(1);
			break;
		};
	};
	*/
	u[x.token]={'id':x.author[0].author_id,'secret':x.secret};
	for (k=1;k<u.length;k++){
		var user = u[i];
		log.info('u.id='+user.id);
	};
	}
	
	return res.send(x);
};
if (proc=='registernotification') {
	x = result.registernotification;
	return res.send(x);
};

if (proc=='mymessages') {
	x = result.mymessages;
	return res.send(x);
};
if (proc=='myDraftmessages') {
	x = result.mydraftmessages;
	return res.send(x);
};

if (proc=='messageContent') {
	x = result.messagecontent;
	if (x.success==1) {
		
		var file = x.parent_file; 
		filePath = __dirname + '/img/' + file;
		log.info('file='+filePath);
		if (filePath!=undefined){
			if (x.key!=null){
				encryptor.decryptFile(filePath+'.dec', filePath, x.key, function(err){
					if (err) { return sendSimpleJSON(res, 0, 'EncryptionError');} 
					else { return doneFileDownload(filePath, res, x.key, x.com, x.doc);}
				});
			} else {
				return doneFileDownload(filePath, res, x.key, x.com, x.doc);
			}
		}
	} else { return sendSimpleJSON(res, x.success, x.error_text) }
};
/*
if (proc=='messageContent') {
	x = result.messagecontent;
	if (x.success==1) {
		
		var file = x.parent_file; 
		var path = __dirname + '/img/' + file;
		log.info('file='+path);
		if (path!=undefined){
			if (x.key!=null){
				encryptor.decryptFile(path+'.dec', path, x.key, function(err) {
					var filestream = fs.createReadStream(path);
					filestream.pipe(res);
					fs.unlinkSync(path);
					if ((x.com==1) && (x.doc==1)){
						fs.unlinkSync(path+'.dec');
					};
					return;
				});
			} else {
				var filestream = fs.createReadStream(path);
				filestream.pipe(res);
				if ((x.com==1) && (x.doc==1)){
					fs.unlinkSync(path);
				};
				return;
			}
		}
	} else {
		var y = { 	
			success:x.success, 
			error_text: x.error_text
		};
		return res.json(y).send;
	}
};
*/

if (proc=='getAvatar') {
	x = result.get_avatar;
	if (x.success==1) {
		var file = x.file; 
		var path = __dirname + '/img/' + file;
		log.info('file='+file);
		return res.download(path);
	} else { return sendSimpleJSON(res, x.success, x.error_text)}
};
if (proc=='postMessagesv2') {
	x = result.postmessages;
	if (x.success==1){
	if (x.com!=undefined) {
		if ((x.com==1) && (x.doc==1)){
			fs.unlinkSync(mainPath+publicDirectory+'/'+x.parent_file);
		};
		
	};
	
	if (x.delay==0) {
		sendPushNotifications(x.IOSdevices, x.devices, x.control, x.comment);
	} else {
	    var c = x;
		var date = new Date(x.date_year, x.date_month-1, x.date_day, x.date_hour, x.date_minute, 0);
		log.info('Start push with delay1 on date='+date);
		ntfy['s'+x.new_message_id] = schedule.scheduleJob(date, function(){
			//log.info('Start push with delay2');
			sendPushNotifications(c.IOSdevices, c.devices, c.control, c.comment);
		});
	}
	checkHandlers(x.new_message_id, res);
	};
	return res.send(x);
};
if (proc=='postMessagesv3') {
	x = result.postmessages;
	if (x.success==1){
	if (x.com!=undefined) {
		if ((x.com==1) && (x.doc==1)){
			fs.unlinkSync(mainPath+publicDirectory+'/'+x.parent_file);
		};
	};
	
	if (x.delay==0) {
		sendPushNotifications(x.IOSdevices, x.devices, x.control, x.comment);
	} else {
	    var c = x;
		var date = new Date(x.date_year, x.date_month-1, x.date_day, x.date_hour, x.date_minute, 0);
		log.info('Start push with delay1 on date='+date);
		ntfy['s'+x.new_message_id] = schedule.scheduleJob(date, function(){
			//log.info('Start push with delay2');
			sendPushNotifications(c.IOSdevices, c.devices, c.control, c.comment);
		});	
	}
	checkHandlers(x.new_message_id, res);
	};
	return res.send(x);
};
if (proc=='postForwardedMessages') {
	x = result.postmessages;
	// copy filestream
	if (x.success==1){
	var source = fs.createReadStream(mainPath+publicDirectory+'/'+x.source_file);
	var dest = fs.createWriteStream(mainPath+publicDirectory+'/'+x.dest_file);
	source.pipe(dest);
	source.on('error', function(err) { /* error */
		log.info(err);
	});
	
	if (x.delay==0) {
		sendPushNotifications(x.IOSdevices, x.devices, x.control, x.comment);
	} else {
	    var c = x
		var date = new Date(x.date_year, x.date_month-1, x.date_day, x.date_hour, x.date_minute, 0);
		log.info('Start push with delay1 on date='+date);
		log.info('x.devices='+x.devices);
		ntfy['s'+x.new_message_id] = schedule.scheduleJob(date, function(){
			//log.info('Start push with delay2');
			sendPushNotifications(c.IOSdevices, c.devices, c.control, c.comment);
		});
	}
	checkHandlers(x.new_message_id, res);
	};
	return res.send(x);
};
if (proc=='postPersonalinfo') {
	x = result.postpersonalinfo;
	return res.send(x);
};
if (proc=='postAvatar') {
	x = result.postavatar;
	return res.send(x);
};
if (proc=='getMessages') {
	x = result.getmessages;
	return res.send(x);
};
if (proc=='getPublicmessages') {
	x = result.getpublicmessages;
	return res.send(x);
};
if (proc=='getWaitingmessages') {
	x = result.waitingmessages;
	return res.send(x);
};
if (proc=='getWaitmemessages') {
	x = result.waitmemessages;
	return res.send(x);
};
if (proc=='getMessageInfo') {
	x = result.getmessageinfo;
	return res.send(x);
};
if (proc=='getGroupsmessages') {
	x = result.getgroupsmessages;
	log.info('return group messages');
	return res.send(x);
};
if (proc=='getGroupmessages') {
	x = result.getgroupmessages;
	return res.send(x);
};
if (proc=='postFavorites'){
	x = result.postfavorites;
	return res.send(x);
};
if (proc=='postComplete'){
	x = result.postcomplete;
	if (x.com!=undefined) {
		if ((x.com==1) && (x.doc==1)){
			fs.unlinkSync(mainPath+publicDirectory+'/'+parent_file);
		};
	};
	return res.send(x);
};




if (proc=='messageText'){
	x = result.messagetext;
	log.info('messagetext='+JSON.stringify(x));
	log.info('x.message_text.length='+x.message_text.length);
	if (x.success==1){
		if (x.message_text.length==0) {
			var file = x.file; 
			var path = __dirname + '/img/' + file;
			log.info('file='+path);
			if (path!=undefined){
				if (config.get('host')=='10.2.3.118'){
					var request1 = request.defaults({proxy: proxySettings});
				} else {
					var request1 = request;
				}; 
				if (x.key!=null){
					encryptor.decryptFile(path+'.dec', path, x.key, function(err) {
						return recognize(x, path, request1, res);
					});
				} else {
				    return recognize(x, path, request1, res);
					/*var result = '';
	l_lang = 'rus-RUS';
	if (x.lang.toUpperCase() == 'EN') {l_lang = 'eng-GBR'};
	if (x.lang.toUpperCase() == 'CN') {l_lang = 'yue-CHN'};
	if (x.lang.toUpperCase() == 'DE') {l_lang = 'deu-DEU'};
			
	in_file_wav = x.file + recognizingFormat;
	tempFileWav = mainPath+in_file_wav;
			
	var proc = new ffmpeg({ source: path }).withAudioBitrate(recognizingAudioBitrate).withAudioFrequency(recognizingAudioFrequency).withAudioChannels(1).addOption('-hide_banner', '-y').saveToFile(in_file_wav, 
	function(stdout, stderr) {
		
		var request1 = request.defaults({proxy: proxySettings});
		request1({
			url: recognizingURL, //URL to hit
			qs: {appId: recognizingAppId, appKey: recognizingAppKey}, //Query string data
			method: 'POST',
			headers: {
				'Content-Type': recognizingContentType,
				'Accept': 'text/plain',
				'Accept-Language': l_lang,
				'Accept-Topic': 'Dictation',
				'X-Dictation-NBestListSize': '1'
			},
			body: fs.readFileSync(tempFileWav) //Set the body as a string
		}, function(error, response, body){
			fs.unlinkSync(tempFileWav);
			if(error) {
				console.log(error);
				result=error;
			} else {
				console.log(response.statusCode, body);
				result = body;
				if (response.statusCode>399 && response.statusCode<500) {
					result = 'Request Error '+response.statusCode+': bad request';
				};
				if (response.statusCode>499) {
					result = 'Server Error:'+response.statusCode+' unable to process request';
				};
			}
			console.log('modifyY');
			var y = { 	
				success:x.success, 
				error_text: result,
				message_text: result
			};
			log.info('messagey2='+JSON.stringify(y));
			fs.unlinkSync(path);
			return res.send(y);
			});
		})*/
				}
			} else { return sendTripleJSON(res, 0, 'NoData', '') }
		} else { return sendTripleJSON(res, x.success, x.error_text, x.message_text) }
	} else { return sendSimpleJSON(res, x.success, x.error_text) }
};
if (proc=='getMessagereplies'){
	x = result.getmessagereplies;
	return res.send(x);
};
if (proc=='getFavorites'){
	x = result.getfavorites;
	return res.send(x);
};
if (proc=='deleteMessage'){
	x = result.deletemessage;
	if (x.success==1){
		notify['s'+x.del_message_id].cancel();
	};
	return res.send(x);
};
if (proc=='postBlacklist'){
	x = result.postblacklist;
	return res.send(x);
};
if (proc=='getBlacklist'){
	x = result.getblacklist;
	return res.send(x);
};
if (proc=='emailMessage') {
	x = result.emailmessage;
	if (x.success==1){
// send mail
		//sendMail(x.email, x.mail_subject, x.mail_text); 
		sendMailWithAttachments(x.email, x.mail_subject, x.mail_text, x.key, x.path)
// repack json 
    }; 
	var y = { 	
		success:x.success, 
		error_text: x.error_text
	};
	return res.json(y).send;
};
if (proc=='getTags'){
	x = result.gettags;
	return res.send(x);
};
if (proc=='postOneChannelTags'){
	x = result.postonechanneltags;
	return res.send(x);
};
if (proc=='postAuthortags'){
	x = result.postauthortags;
	return res.send(x);
};
if (proc=='getOnechannelmessages2'){
	x = result.getonechannelmessages2;
	return res.send(x);
};
if (proc=='getAuthortags'){
	x = result.getauthortags;
	return res.send(x);
};
if (proc=='getAuthortagmessages2'){
	x = result.getauthortagmessages2;
	return res.send(x);
};



if (proc=='handlerwork'){
	x = result.handlerwork;
	if (x.result) {
		async.forEach(x.result, function (item, callback){ 
			console.log(item); // print the key
			if (item.method=='POST') {
				log.info('url='+item.url);
				var path = __dirname + '/img/' + item.file.path;
				if (path!=undefined){
					if (item.file.key!=null){
						encryptor.decryptFile(path+'.dec', path, item.file.key, function(err) {
							//fs.readFile(path, function (err, data) {
// setup e-mail data with unicode symbols
							sendAllDataToTTS(item.url, item.param_value, item.file.path, path, item.file.key);			
						//});
					})	
					} else {
						//fs.readFile(path, function (err, data) {
							sendAllDataToTTS(item.url, item.param_value, item.file.path, path, item.file.key);
						//});
					}
				}
			}
			if (item.method=='MAIL') {
				sendMailWith2Attachments(item.email, item.subject, item.body, item.file.key, item.file.path, item.data, 'event.ics')
			};
			callback(); // tell async that the iterator has completed

		}, function(err) {
			console.log('iterating done');
		}); 
	
	/*
		for (var i=0;i<x.result.length;i++){
			//y = x.result[i];
			if (x.result[i].method=='POST') {
				log.info('url='+x.result[i].url);
				var path = __dirname + '/img/' + x.result[i].file.path;
				if (path!=undefined){
					if (x.result[i].file.key!=null){
						encryptor.decryptFile(path+'.dec', path, x.result[i].file.key, function(err) {
							fs.readFile(path, function (err, data) {
// setup e-mail data with unicode symbols
							sendAllDataToTTS(x.result[i].url, x.result[i].param_value, x.result[i].file.path, path, data, x.result[i].file.key);			
						});
					})	
					} else {
						fs.readFile(path, function (err, data) {
							sendAllDataToTTS(x.result[i].url, x.result[i].param_value, x.result[i].file.path, path, data, x.result[i].file.key);
						});
					}
				}
			}
			if (x.result[i].method=='MAIL') {
				sendMailWith2Attachments(x.result[i].email, x.result[i].subject, x.result[i].body, x.result[i].file.key, x.result[i].file.path, x.result[i].data, 'event.ics')
			};
		}*/
	}
}
}


app.get('/download/:file(*)', function(req, res, next){
  var file = req.params.file; 
  var path = __dirname + '/img/' + file;
  log.info('path='+path);
  log.debug('file='+file);
  res.download(path);
});
//212.5.80.66:9951

function sendAllDataToTTS(url1, param_value, file, path, key) {
	var fileStats = fs.statSync(path); 
	var fileSizeInBytes = fileStats["size"]; 
	log.info('fileStats='+fileStats); 
	log.info('fileSizeInBytes='+fileSizeInBytes);
    httpreq.uploadFiles({
	url: 'http://212.5.80.66:9951/tts/tts.download_file.upload1',
    files:{
        file: path
    }
}, function (error, response){
    if(error){
		log.info('error TTS1:'+error.message);
		if (key!=null){fs.unlinkSync(path)};
	}
	else {
		log.info('response TTs1:'+response.code+':'+response.body+url1);
		in_request({
			url: url1, //URL to hit
			qs: {p_params: param_value + '###' + file}, //Query string data
			method: 'GET'
			//Set the body as a string
		}, function(error, response, body){
			if(error) {
				console.log('error TTS2='+error);
				if (key!=null){fs.unlinkSync(path)};
				return;
			} else {
				console.log('response TTS2='+response.statusCode+'body='+body);
				if (key!=null){fs.unlinkSync(path)};
				return;
			}
		});
	}
})

	

/*	
    var r = in_request.post('http://192.168.5.113:8081/tts/tts.download_file.upload1', function (err, res, body) {
    if(err){
		log.info('error TTS1:'+err.message);
		if (key!=null){fs.unlinkSync(path)};
	}
	else {
		log.info('response TTs1:'+res+':'+body+url1);
		in_request({
			url: url1, //URL to hit
			qs: {p_params: param_value + '###' + file}, //Query string data
			method: 'GET'
			//Set the body as a string
		}, function(error, response, body){
			if(error) {
				console.log('error TTS2='+error);
				if (key!=null){fs.unlinkSync(path)};
				return;
			} else {
				console.log('response TTS2='+response.statusCode+'body='+body);
				if (key!=null){fs.unlinkSync(path)};
				return;
			}
		});
   }
}
);
	var form = r.form();
	form.append('file', fs.createReadStream(path));
	*/
}



/*
function sendAllDataToTTS(url1, param_value, file, path, key) {
    log.info('url into='+url1);
    var CRLF = '\r\n';
	//var buf = fs.readFileSync(path);
	//var data = 	'------aaaaaa'+CRLF+'Content-Disposition: form-data; name="file"; filename="'+file+'"'+CRLF+
//'Content-Type: audio/wav'+CRLF+CRLF+  fs.readFileSync(path) + CRLF+'------aaaaaa--'+CRLF;
	    log.info('start send to TTS');
		


		//log.info('length='+buf.length);
		var fileStats = fs.statSync(path); 
		var fileSizeInBytes = fileStats["size"]; 
		log.info('fileStats='+fileStats); 
		log.info('fileSizeInBytes='+fileSizeInBytes);
	    in_request({
		    //212.5.80.66:9951
			url: 'http://192.168.5.113:8081/tts/tts.download_file.upload1', //URL to hit
			method: 'POST',
			headers: {
				'Content-Type': 'multipart/form-data; boundary=----aaaaaa'
			},
			body: '------aaaaaa'+CRLF+'Content-Disposition: form-data; name="file"; filename="'+file+'"'+CRLF+
'Content-Type: audio/wav'+CRLF+CRLF+  fs.readFileSync(path, 'UTF-8') + CRLF+'------aaaaaa--'+CRLF //Set the body as a string
		}, function(err, resp, body){
		 if(err){
			log.info('error TTS1:'+err.message);
			if (key!=null){fs.unlinkSync(path)};
		}
		else {
			log.info('response TTs1:'+resp+':'+body+url1);
			in_request({
			url: url1, //URL to hit
			qs: {p_params: param_value + '###' + file}, //Query string data
			method: 'GET'
			//Set the body as a string
		}, function(error, response, body){
			if(error) {
				console.log('error TTS2='+error);
				if (key!=null){fs.unlinkSync(path)};
				return;
			} else {
				console.log('response TTS2='+response.statusCode+'body='+body);
				if (key!=null){fs.unlinkSync(path)};
				return;
			}
		});
   }

		});
}
*/

function pg_connect(cs, proc, select_string, res) {
pg.connect(cs, function(err, client, done) {
  if(err) {
    return console.error('error fetching client from pool', err);
  }
  client.query(select_string, function(err, result) {
    //call `done()` to release the client back to the pool
  done();
  if(err) {
      return console.error('error running query', err);
  }
	console.log(result.rows[0]);
	return result_process(proc, result.rows[0], res);
    //output: 1
  });
});
}

app.get('/integrateTTS',function(req, res){
	var str = req.query.str;
	log.info(str);
	//str = 'Текущие_задачи###202###тестовая задача######12.06.2015###202###202###Роскосмос###11111'	
	var request = require('request');
		request({
			url: 'http://172.19.1.82/tts/tts.df_create_task.create_task', //URL to hit
			qs: {p_params: str}, //Query string data
			method: 'GET',
			//Set the body as a string
		}, function(error, response, body){
			if(error) {
					console.log(error);
					result=error;
					return res.send(response.statusCode+':'+error);
			} else {
					console.log(response.statusCode, body);
					result = body;
					return res.send(response.statusCode+':'+body);
			}
		});
});
	


app.listen(1337, function(){
    console.log('Express server listening on port 1337');
});