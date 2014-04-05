#!/usr/local/bin/node
/*
	Possible features:
	module structure to allow callbacks
*/

var http = require('http');
var url = require('url');
var events = require('events');
var util = require('util');

var Crawly = function() {
	events.EventEmitter.call(this);

	return this;
}


Crawly.prototype = {
	domains : [],
	visited : [],
	counter : 0,
	limit : 100,
	start : {},
	speed : {},
	pending : 0,
	simultaneous : 20,
	queue : [],
	verbose : false,
	redirects : 0,
	errors : 0,

	start : function() {
		for (i = 0; i < this.domains.length; i++) {
			this.crawl(this.domains[i]);
		}
	},

	addDomain : function(url) {
		this.domains.push(url);
	},

	crawl : function (link, referer, method) {
		if (this.visited.indexOf(link) != -1) return false;
		if ((this.counter - this.limit) == 0) return false;
		if (this.pending >= this.simultaneous) {
			this.queue.push([link, referer, method]);
			return true;
		}

		this.visited.push(link);
		if (this.verbose) {
			console.log(method ? method : 'GET', link, referer ? referer : '');
		}

		this.pending++;
		this.counter++;
		if ((this.counter % 1000) == 0) console.log('Counter: ' + this.counter);
		
		var req = new Request(this, link, referer, method);

		this.emit('request', req);
		req.on('speed', this.speed.bind(this));
		req.on('http_redirect', this.redirect.bind(this));
		req.on('http_error', this.error.bind(this));
		req.on('end', this.dequeue.bind(this));
		req.on('fail', this.dequeue.bind(this));
		req.on('url', this.crawl.bind(this));
		req.on('info', function(msg, code) {
			if (!this.verbose) return;
			console.log(code + ' ' + msg);
		}.bind(this));

		req.start();

		return true;
	},

	dequeue : function() {
		this.pending--;
		while (this.queue.length && !this.crawl.apply(this, this.queue.shift()));
		if (this.pending == 0) {
			this.printStatistics();
		}
	},

	speed : function(url, time) {
		this.speed[url] = time;
	},

	error : function(url, code, referer) {
		this.errors++;
		console.log(code + ' ' + url + ' linked on ' + referer);
		return true;
	},

	redirect : function(url, code, referer) {
		this.redirects++;
		console.log(code + ' ' + url + ' linked on ' + referer);
	},

	printStatistics : function() {
		min = 10000000000; max = -1; avg = 0; n = 0;
		slowestUrl = '';
		for (link in this.speed) {
			n++;
			avg += this.speed[link];
			if (this.speed[link] < min) {
				min = this.speed[link];
			}
			if (this.speed[link] > max) {
				max = this.speed[link];
				slowestUrl = link;
			}
		}
		avg = avg / n;
		console.log(n + ' pages crawled');
		console.log(this.redirects + ' redirects');
		console.log(this.errors + ' errors');
		console.log('avg: ' + avg + ' min: ' + min + ' max: ' + max);
		console.log('slowest url: ' + slowestUrl);
		console.log('queue: ' + this.queue.length);
	},

};

for (e in events.EventEmitter.prototype) {
	if (typeof events.EventEmitter.prototype[e] == 'function') {
		Crawly.prototype[e] = events.EventEmitter.prototype[e];
	}
}

Request = function(crawly, link, referer, method) {
	this.url = link;
	this.referer = referer;
	this.method = method ? method : 'GET';

	return events.EventEmitter.call(this);
}


Request.prototype = {
	response : null,
	data : '',

	start : function() {
		this.emit('start');

		var options = url.parse(this.url);
		options.keepAlive = true;
		options.headers =  { 'User-Agent' : 'Crawly/0.1' };
		options.method = this.method;
		this.start = ((new Date()).getTime());
		var request = http.request(options, this.receive.bind(this));
		request.on('error', this.failure.bind(this));
		request.end();

	},

	receive : function(response) {
		this.response = response;
		response.on('data', function(chunk) {
			this.data += chunk;
		}.bind(this));
		response.on('end', this.responseEnd.bind(this));
	},

	responseEnd : function() {
		if (this.start) {
			var d = new Date();
			var time = (d.getTime()) - this.start;
			this.emit('speed', this.url, time);
			if (this.response.statusCode >= 300 && this.response.statusCode < 400) {
				this.emit('http_redirect', this.url, this.response.statusCode, this.referer);
			}
			else if (this.response.statusCode >= 400) {
				this.emit('http_error', this.url, this.response.statusCode, this.referer);
			}
			else {
			       	this.emit('info', this.url + ' ' + time + 'ms', this.response.statusCode, this.referer);
			}
		}

		if (this.response.statusCode >= 200 && this.response.statusCode < 300 && this.method == 'GET') {
			this.followLinks();

			if (!/<\/body>/i.test(this.data)) {
				this.emit('html_error', 'Missing </body>', this.url);
			}
		}

		this.emit('end', this);
	},

	followLinks : function() {
		var regex = /a\s*href="([^"]+)"/ig;
		var url = '';
		var domain = /(http:\/\/[^\/]+)/i.exec(this.url);
		domain = domain[1];

		while (url = regex.exec(this.data)) {
			if (url[1] == '#') {
				continue;
			}
			else if (url[1].substring(0, 7) != 'http://' && url[1].substring(0, 8) != 'https://') {
				url[1] = 'http://' + this.response.req._headers.host + url[1];
			}
			else if (url[1].substring(0, domain.length) != domain) {
				continue;
			}
			url[1] = url[1].replace(/(.*)#.*/, '$1');
			this.emit('url', url[1], this.url);
		}
	},

	failure : function(e) {
		console.log('fail: ' + e);
		this.emit('fail', this.url);
	}
}

for (e in events.EventEmitter.prototype) {
	if (typeof events.EventEmitter.prototype[e] == 'function') {
		Request.prototype[e] = events.EventEmitter.prototype[e];
	}
}

module.exports = Crawly;

