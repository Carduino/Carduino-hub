//-----------------------------------------//
//------------ Node.JS Modules ------------//
//-----------------------------------------//
var util = require('util'),
	SerialPort = require('serialport').SerialPort,
	xbee_api = require('xbee-api'),
	socketIO = require('socket.io-client'),
	jwt = require('jsonwebtoken');



//-----------------------------------------//
//------------- Config params -------------//
//-----------------------------------------//
var hubName = 'Hub 1',
	serverAddress = 'dauliac.fr:3000';



//-----------------------------------------//
//----------- General variables -----------//
//-----------------------------------------//
var authToken,
	socket,
	sensorsDatas = [], // Almost realtime representation of the connected sensors
	Timers = {}, // Used to store expirency timeouts
	hub = {
		name: hubName,
		children: []
	};



//-----------------------------------------//
//------------- Authentication ------------//
//-----------------------------------------//

// Create a jwt with HMAC using SHA-256 hash algorithm
authToken = jwt.sign({
	name: hubName,
	role: 'hub'
}, 'pwd', {
	algorithm: 'HS256',
	issuer: 'Carduino-server'
});



//-----------------------------------------//
//---------- XBee communications ----------//
//-----------------------------------------//

// Instantiate a XBeeAPI object in mode AP=2 (escaping enabled)
var xbeeAPI = new xbee_api.XBeeAPI({
	api_mode: 2
});

// Initialize a new pipe to the serial port where the XBee is connected to with the XBeeAPI parser
var serialport = new SerialPort("/dev/ttyAMA0", {
	baudrate: 9600,
	parser: xbeeAPI.rawParser()
});

// Broadcast the hub address to the sensors periodicaly
serialport.on("open", function() {
	var frame_obj = {
		type: 0x10,
		id: 0x01,
		destination64: "000000000000FFFF",
		broadcastRadius: 0x00,
		options: 0x00,
		data: "HUB ADDRESS"
	};
	setInterval(function() {
		serialport.write(xbeeAPI.buildFrame(frame_obj));
		console.log('Sent to serial port.');
	}, 5000);
});


//-----------------------------------------//
//--------------- Websockets --------------//
//-----------------------------------------//

// Socket.io Websocket connexion init
socket = socketIO('ws://' + serverAddress);

// Launch authentication process when opening the connexion
socket.on('connect', function() {
	socket.emit('authenticate', {
		token: authToken
	});
});

// When the hub is authenticated
socket.on('authenticated', function() {
	// Emit the datas refering to the hub and the Sensors connected, and the sensors values
	socket.emit('newHub', hub);


	// All frames parsed by the XBee will be catched here
	xbeeAPI.on("frame_object", function(frame) {
		if (frame.data !== undefined) { //&& frame.data.toString('utf8') !== 'HUB ADDRESS'
			// Read datas from a sensor
			var datas = frame.data.toString('utf8').split(',');
			var sensorData = {
				name: datas[0],
				battery: parseInt(datas[1], 10),
				bpm: parseInt(datas[2], 10),
				timestamp: Date.now()
			};

			// ...
			var sensorIndex = hub.children.findIndex(function(sensor) {
				return sensor.name === datas[0];
			});
			if (sensorIndex < 0) {
				socket.emit('newSensor', sensorData);
			}

			// Add the sensor to the sensorsDatas array and the hub object
			sensorsDatas[datas[0]] = sensorData;
			hub.children.push(sensorData);
			console.log(sensorsDatas);

			// ...
			socket.emit('sensorData', sensorData);

			// Handle timout expirency for sensors in the sensorsDatas array and the hub object
			if (Timers[datas[0]]) {
				clearTimeout(Timers[datas[0]]);
			}
			Timers[datas[0]] = setTimeout(function() {
				delete sensorsDatas[datas[0]];
				var sensorIndex = hub.children.findIndex(function(sensor) {
					return sensor.name === datas[0];
				});
				if (sensorIndex > -1) {
					hub.children.splice(sensorIndex, 1);
				}
				socket.emit('sensorLost', data[0]);
				console.log(sensorsDatas);
			}, 3000);
		}
	});
});
