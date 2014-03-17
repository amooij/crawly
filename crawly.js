#!/usr/local/bin/node


/*
	Possible features:
	module structure to allow callbacks

 */

var http = require('http');
var url = require('url');

var domain;
var visited = [];
var counter = 0;
var counterMax = 100;
var start = {};
var speed = {};
var pending = 0;
var simultaneous = 20;
var queue = [];
var verbose = false;
var redirects = 0;
var errors = 0;

function crawl(link, setDomain) {
	if (visited.indexOf(link) != -1) return;
	if (counter > counterMax) return;
	if (pending >= simultaneous) {
		queue.push(link);
		return;
	}

	visited.push(link);
	if (verbose) {
		console.log('GET', link);
	}

	var options = url.parse(link);
	options.headers =  { 'User-Agent' : 'Crawly/0.1' };
	if (setDomain) {
		domain = options.protocol + '//' + options.host;
	}
	var d = new Date();
	start[link] = (d.getTime());
	pending++;
	var request = http.request(options, retrieve);
	request.on('error', failure);
	request.end();
	counter++;
}

function retrieve(response) {
	var requested = 'http://' + response.req._headers.host + (response.req.path == '/' ? '' : response.req.path);
	var data = '';
	response.on('data', function(chunk) {
		data += chunk;
	});
	response.on('end', function() {
		if (start[requested]) {
			var d = new Date();
			var time = (d.getTime()) - start[requested];
			speed[requested] = time;
			if (verbose || response.statusCode != 200) {
				if (response.statusCode >= 300 && response.statusCode < 400) redirects++;
				if (response.statusCode >= 400) errors++;
				console.log(response.statusCode + ' ' + requested + ' ' + time + 'ms');
			}
			delete start[requested];
		}
		var regex = /a\s*href="([^"]+)"/ig;
		var url = '';
		while (url = regex.exec(data)) {
			if (url[1] == '#') {
				continue;
			}
			else if (url[1].substring(0, domain.length) != domain) {
				continue;
			}
			else if (url[1].charAt(0) == '/') {
				url[1] = domain + url[1].substring(1);
			}
			url[1] = url[1].replace(/(.*)#.*/, '$1');
			crawl(url[1]);
		}
		if (!/<\/body>/i.exec(data)) {
			console.log('Missing </body> for ' + requested);
			errors++;
		}
		dequeue();
		if (pending == 0) {
			printStatistics();
		}
	});
}

function failure(e) {
	console.log('fail: ' + e);
	dequeue();
}

function dequeue() {
	pending--;
	if (queue.length) {
		crawl(queue.pop());
	}
}

function printStatistics() {
	min = 10000000000; max = -1; avg = 0; n = 0;
	slowestUrl = '';
	for (link in speed) {
		n++;
		avg += speed[link];
		if (speed[link] < min) {
			min = speed[link];
		}
		if (speed[link] > max) {
			max = speed[link];
			slowestUrl = link;
		}
	}
	avg = avg / n;
	console.log(n + ' pages crawled');
	console.log(redirects + ' redirects');
	console.log(errors + ' errors');
	console.log('avg: ' + avg + ' min: ' + min + ' max: ' + max);
	console.log('slowest url: ' + slowestUrl);
}

verbose = process.argv[3] && process.argv[3] == 'verbose';
counterMax = process.argv[4] ? (process.argv[4] + 0) : counterMax; 
simultaneous = process.argv[5] ? (process.argv[5] + 0) : simultaneous;
if (!process.argv[2]) {
	console.log('Usage: crawly.ls http://example.com [verbose]');
}
else {
	crawl(process.argv[2], true);
}
