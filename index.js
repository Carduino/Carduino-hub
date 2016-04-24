// Node modules
var util = require('util'),
	SerialPort = require('serialport').SerialPort,
	xbee_api = require('xbee-api'),
	socketIO = require('socket.io-client'),
	jwt = require('jsonwebtoken');



// Config variables
var hubName = 'Hub 1',
	serverAddress = 'dauliac.fr:3000';



// General variables
var authToken,
	socket,
	sensorsDatas = [],
	hub = {
		name: hubName,
		children: []
	};



// Create a jwt with HMAC using SHA-256 hash algorithm
authToken = jwt.sign({
	name: hubName,
	role: 'hub'
}, 'pwd', {
	algorithm: 'HS256',
	issuer: 'Carduino-server'
});



// XBee
var xbeeAPI = new xbee_api.XBeeAPI({
	api_mode: 2
});

var serialport = new SerialPort("/dev/ttyAMA0", {
	baudrate: 9600,
	parser: xbeeAPI.rawParser()
});



// Socket.io Websocket connexion init
socket = socketIO('ws://' + serverAddress);

socket.on('connect', function() {
	socket.emit('authenticate', {
		token: authToken
	});
});

socket.on('authenticated', function() {
	// Emit the datas refering to the hub and the Sensors connected
	socket.emit('newHub', hub);

	// All frames parsed by the XBee will be catched here
	xbeeAPI.on("frame_object", function(frame) {
		if (frame.data !== undefined) {
			// ...
			var datas = frame.data.toString('utf8').split(',');
			var sensorData = {
				battery: datas[1],
				bpm: datas[2]
			};

			// ...
			sensorsDatas[datas[0]] = sensorData;
			console.log(sensorsDatas);

			// ...
			socket.emit('sensorsDatas', sensorData);
		}
	});
});
