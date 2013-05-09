//Requires
var http = require("http");
var config = require('./ndOptions');
var url = require('url');
var fs = require("./ndFileWrite");
var ndThreads = require("./ndThreads");
var ndVerify = require('./ndVerify');

//Helper Methods
var onError = function(e) {
	console.log("Error: ", e);
};

//Workers
var createDownloadThread = function(index) {
	var onEnd = function() {
		var t = threads.getStatus(index);
		threads.end(index);
		completedThreads++;
		if (t.end != t.position) {

			if (config.retry_on_failure) {

				completedThreads--;
				threads.restart(index);

				t = threads.getStatus(index);
				//console.log('\nre-created:', t.header, t.position);
				createDownloadThread(index);

			} else {
				console.log('\nthread failed:', t.header, t.position);
			}
		} else {

			if (completedThreads == threads.count()) {
				threads.finish();
				ndVerify.checksum(_options.fileName, _options.checksum);
			}
		}
	};

	var onData = function(dataChunk) {

		var position = threads.getStatus(index).position;
		threads.setPosition(index, dataChunk.length);
		writer.write(dataChunk, position);
	};

	var onResponse = function(response) {
		response.addListener('end', onEnd);
		response.addListener('data', onData);
	};

	var req = {
		headers: {
			'range': threads.getStatus(index).header
		},
		hostname: requestOptions.hostname,
		path: requestOptions.path
	};
	http.get(req, onResponse).on('error', onError);
};



var onHead = function(response) {
	_options.fileSize = response.headers['content-length'];


	console.log("File size: ", _options.fileSize + " bytes");
	var threader = ndThreads(_options);
	threads = threader.createThreads();
	response.destroy();
	if (threads !== undefined) {
		for (var i = 0; i < threads.count(); i++) {
			createDownloadThread(i);
		}
	} else {
		ndVerify.checksum(_options.fileName, _options.checksum);
	}
};


var _download = function() {
	completedThreads = 0;
	var reqUrl = url.parse(_options.url);

	console.log("Host: ", reqUrl.host);
	requestOptions = {
		hostname: reqUrl.hostname,
		path: reqUrl.path,
		method: 'HEAD'
	};
	http.request(requestOptions, onHead)
		.on('error', onError)
		.end();
};


module.exports = function(options) {

	if (options.fileName === undefined) {
		var t = options.url.split('/');
		options.fileName = t[t.length - 1];
	}

	_options = options;
	http.globalAgent.maxSockets = 200;
	http.Agent.defaultMaxSockets = 200;

	//Defaults
	writer = new fs(_options.fileName);

	return {
		download: _download
	};
};