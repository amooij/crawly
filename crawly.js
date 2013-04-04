#!/usr/local/bin/node

var http = require('http');
var url = require('url');
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

var status = [];
var domain = [];
var visited = [];
var counter = 0;
var counterMax = 50000;
var numOpen = 0;
var numComplete = 0;
var queue = [];

function crawl(link, setDomain) {
	if (visited.indexOf(link) != -1) return;
	if (counter >= counterMax) return;
	if (numOpen > 250) {
		queue.push(link);
		return;
	}

	visited.push(link);
	///console.log('GET', link);

	var options = url.parse(link);
	options.headers =  { 'User-Agent' : 'Crawly/0.1' };
	if (setDomain) {
		domain.push(options.protocol + '//' + options.host);
	}
	var request = http.request(options, retrieve);
	request.on('error', failure);
	request.end();
	numOpen++;
	counter++;
	process.send({ pid : process.pid, numOpen : numOpen, counter : counter, numComplete : numComplete, queue : queue.length });
}

function retrieve(response) {
	var requested = 'http://' + response.req._headers.host + response.req.path;
 	response.setEncoding('utf8');
	if (response.statusCode != 200) {
		console.log(response.statusCode, requested);
	}
	var data = '';
	response.on('data', function(chunk) {
		data += chunk;
	});
	response.on('end', function() {
		var regex = /a\s*href="([^"]+)"/ig;
		var url = '';
		while (url = regex.exec(data)) {
			if (url[1] == '#') {
				continue;
			}
			else if (url[1].charAt(0) == '/') {
				continue;
				url[1] = domain + url[1].substring(1);
			}
			var included = false;
			for (var i = 0; i < domain.length; i++) {
				if (url[1].substring(0, domain[i].length) == domain[i]) {
					included = true;
				}
			}
			if (!included) continue;
			crawl(url[1]);
		}
		numOpen--;
		if (queue.length) {
			crawl(queue.shift());
		}
		numComplete++;
		process.send({ pid : process.pid, numOpen : numOpen, counter : counter, numComplete : numComplete, queue: queue.length });
	});
}

function failure(e) {
	console.log('fail: ' + e, arguments);
}

if (cluster.isMaster) {
	cluster.fork({'link' : 'http://staging.1001oyun.com'});
	cluster.fork({'link' : 'http://staging.superspellen.nl'});
	cluster.fork({'link' : 'http://staging.jeuxjeuxjeux.fr'});
	cluster.fork({'link' : 'http://staging.gamepilot.com'});
	cluster.fork({'link' : 'http://staging.spielyeti.de'});
	cluster.fork({'link' : 'http://staging.megaspel.se'});
	//cluster.fork({'link' : 'http://staging.trochoi.net'});
	setInterval(function() { 
		var queue;
		counter = numComplete = numOpen = queue = 0;
		status.forEach(function(msg) {
			counter += msg.counter;
			numComplete += msg.numComplete;
			numOpen += msg.numOpen;
			queue += msg.queue;
			console.log('pid', msg.pid, 'Total', msg.counter, 'Completed', msg.numComplete, 'Working', msg.numOpen, 'Queue', msg.queue) 
		});
		console.log('Total', counter, 'Completed', numComplete, 'Working', numOpen, 'Queue', queue) 
	}, 1000);

	Object.keys(cluster.workers).forEach(function(id) {
		cluster.workers[id].on('message', function(msg) {
			status[msg.pid] = msg;
		});
	});
}
else {
	console.log(process.env['link']);
	crawl(process.env['link'], true);
	setInterval(function() {
		if (queue.length) {
			while (numOpen < 250) {
				crawl(queue.shift());
			}
		}
	}, 1000);
}
