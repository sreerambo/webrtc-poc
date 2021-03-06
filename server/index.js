
// Require

var socket = require('socket.io');
var fs     = require('fs');
var https  = require('https');

var Collection = require('../common/collection');
var PeerInfo   = require('../common/peerInfo');
var log        = require('../common/helpers').log;


// State

var peerInfos = new Collection();


// SSL-enabled Server

function reqIgnorer (req, res) { res.end("NO"); }
function getFile (path) { return fs.readFileSync(__dirname + path).toString(); }

var credentials = {
  key: getFile('/ssl/key.pem'),
  cert: getFile('/ssl/cert.pem'),
  passphrase: ''
};

var server = https.createServer(credentials, reqIgnorer).listen(8081);


// Socket Server

var io = socket.listen(server);

io.on('connection', function (socket) {
    var myPeerInfo = new PeerInfo(socket.id);

    console.log('Client connected.', socket.id, '(no name until join)');

    socket.on('error', function () {
      console.log(arguments);
    });

    socket.on('join', function onJoin (username) {
        if (peerInfos.anyWith('id', socket.id)) {
          log("- Socket ID collision:", socket.id);
          socket.emit('join-error', 'Id collision: ' + socket.id);
        } else if (peerInfos.anyWith('name', username)) {
          log("- Username collision:", username);
          socket.emit('join-error', 'Username collision: ' + username);
        } else {
          log('Join:', username);
          socket.emit('peer-list', peerInfos.members);
          myPeerInfo.username = username;
          peerInfos.push(myPeerInfo);
        }
    });

    socket.on('leave', function onLeave () {
        log('Peer leaving:', socket.id, '(' + (myPeerInfo.username || 'no name') + ')');
        socket.broadcast.emit('peer-disconnected', myPeerInfo);
        peerInfos.remove(myPeerInfo);
    });

    socket.on('offer', function onOffer (targetPeer, sdp) {
        myPeerInfo.initiator = true;
        log('Received offer from', myPeerInfo.username, '-', sdp.sdp.replace("\r\n", '').substring(7, 20));
        socket.to(targetPeer.id).emit('offer', myPeerInfo, sdp);
    });

    socket.on('answer', function onAnswer (targetPeer, sdp) {
        log('Received answer from', myPeerInfo.username, '-', sdp.sdp.replace("\r\n", '').substring(7, 20));
        socket.to(targetPeer.id).emit('answer', myPeerInfo, sdp);
    });

    socket.on('candidate', function onCand (candidate) {
        //log('Candidate:', candidate);
        socket.broadcast.emit('candidate', myPeerInfo, candidate);
    });

    socket.on('disconnect', function () {
        log('Client interrupted:', socket.id, '(' + (myPeerInfo.username || 'no name') + ')');
        socket.broadcast.emit('peer-disconnected', myPeerInfo);
        peerInfos.remove(myPeerInfo);
    });
});

