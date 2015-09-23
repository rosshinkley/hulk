var path = require('path'),
    Promise = require('bluebird'),
    fs = Promise.promisifyAll(('fs')),
    mkdirp = Promise.promisify(require('mkdirp')),
    util = require('util'),
    _ = require('lodash');

var StaticFile = function(site, filePath) {
    this.site = site;
    this.filePath = filePath;
};

var p = StaticFile.prototype;

p.destination = function(destPath) {
    var rel = path.relative(this.site.source, this.filePath);
    return path.join(this.site.source, path.join(destPath, rel));
};

p.write = function(destination) {
    var destPath = this.destination(destination),
        filePath = this.filePath;

    return mkdirp(path.dirname(destPath))
        .then(copyFile(filePath, destPath));
};

// http://stackoverflow.com/a/14387791/31308
function copyFile(source, target) {
    return new Promise(function(resolve, reject) {
        var callbackCalled = false;

        var rd = fs.createReadStream(source);
        rd.on("error", function(err) {
            reject(err);
        });

        var wr = fs.createWriteStream(target);
        wr.on("error", function(err) {
            reject(err);
        });
        wr.on("close", function(ex) {
            resolve()
        });

        rd.pipe(wr);
    });
}

module.exports = StaticFile;
