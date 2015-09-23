var _ = require('lodash'),
    util = require('util'),
    path = require('path'),
    EventEmitter = require('events')
    .EventEmitter,
    iterateFiles = require('iterate-files'),
    Layout = require('./layout'),
    Post = require('./post'),
    Page = require('./page'),
    StaticFile = require('./staticFile'),
    minimatch = require('minimatch'),
    debug = require('debug')('hulk:site'),
    Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    glob = Promise.promisify(require('glob')),
    rimraf = require('rimraf');

var Site = function(config) {
    this.config = config;
    this.source = this.config.source;
    this.permalink = this.config.permalink;

    this.reset();
};

// Any errors during site processing,
// along with other status events will be emmitted.
util.inherits(Site, EventEmitter);

var p = Site.prototype;

// Read, process, and write this Site to output.
p.process = function() {
    return site.reset()
        .then(site.read())
        .then(site.render())
        .then(site.cleanup())
        .then(site.write())
        .then(function() {
            return new Promise(function(resolve) {
                var totalFiles = site.posts.length + site.pages.length + site.staticFiles.length;
                debug('generated %d files', totalFiles);
                return resolve({
                    filesChanged: totalFiles
                });
            });
        });
};

// Reset Site details.
p.reset = function() {
    var self = this;
    return new Promise(function(resolve, reject) {
        self.layouts = {};
        self.posts = [];
        self.pages = [];
        self.staticFiles = [];

        self.templateData = _.defaults({
            time: new Date(),
            url: self.config.url,
            posts: [],
            pages: []
        }, self.config.global);

        resolve(self);
    });
};


// Read Site data from disk and load it into internal data structures.
// returns a promise once site contents have been read in.
p.read = function() {
    return glob(path.join(site.source, '**', '*'))
        .then(function(files) {
            return Promise.all(_.map(files, function(filePath) {
                return new Promise(function(resolve, reject) {
                    var relativePath = path.relative(site.source, filePath);

                    // Skip ignored files.
                    if (site.isIgnored(filePath)) {
                        //debug('Ignored:', relativePath);
                        return resolve();
                    }

                    if (site.isLayout(filePath)) {
                        var layoutName = path.basename(filePath, path.extname(filePath));
                        //debug('Layout:', relativePath);

                        fs.readFileAsync(filePath, 'utf8')
                            .then(function(data) {
                                site.layouts[layoutName] = new Layout(site, filePath, data);
                                resolve();
                            })
                            .error(function(err) {
                                return reject(err);
                            });
                    } else if (site.isPost(filePath)) {
                        if (!Post.isValid(filePath)) {
                            return resolve();
                        }
                        //debug('Post:', relativePath);
                        fs.readFileAsync(filePath, 'utf8')
                            .then(function(data) {
                                // Check for front-matter to determine if
                                // this post should be included.
                                // Posts without front-matter are ignored.
                                if (data.substr(0, 3) === '---') {
                                    var post = new Post(site, filePath, data);
                                    if (post.published) {
                                        site.posts.push(post);
                                    }
                                }
                                resolve();
                            })
                            .error(function(err) {
                                return reject(err);
                            });
                    } else {
                        var reader = fs.createReadStream(filePath, {
                            encoding: 'utf8'
                        });

                        var isPage = false;
                        var pageContent = '';

                        reader.on('data', function(data) {
                            // Check for front-matter to determine if
                            // this is a page or static file.
                            if (data.substr(0, 3) === '---') {
                                //debug('Page:', relativePath);
                                isPage = true;
                                pageContent += data;
                            } else {
                                reader.destroy();

                                //debug('Static File:', relativePath);
                                site.staticFiles.push(new StaticFile(site, filePath));
                                return resolve();
                            }
                        });

                        reader.on('end', function() {
                            if (isPage) {
                                var page = new Page(site, filePath, pageContent);
                                if (page.published) {
                                    site.pages.push(page);
                                }
                            }
                            return resolve();
                        });
                    }
                });
            }));
        });
};

// Returns true or false whether the given file should be ignored.
p.isIgnored = function(filePath) {
    var relativePath = path.relative(this.source, filePath);

    var ignoreList = this.config.ignore;
    for (var i = 0; i < ignoreList.length; i++) {
        var pattern = ignoreList[i];
        if (minimatch(relativePath, pattern, {
            dot: true,
            nocomment: true
        })) {
            return true;
        }
    }

    return false;
};

// Returns true or false whether the given file is in the layout folder.
p.isLayout = function(filePath) {
    var relativePath = path.relative(this.source, filePath);
    var layoutGlob = path.join(this.config.layouts, '**');
    return minimatch(relativePath, layoutGlob, {
        dot: true,
        nocomment: true
    });
};

// Returns true or false whether the given file is in the posts folder.
p.isPost = function(filePath) {
    var relativePath = path.relative(this.source, filePath);
    var postsGlob = path.join(this.config.posts, '**');
    return minimatch(relativePath, postsGlob, {
        dot: true,
        nocomment: true
    });
};

// Render the posts and pages.
p.render = function() {
    var site = this;
    return Promise.all(site.posts.map(function(post) {
            return post.render(site.layouts, site.templateData);
        }))
        .join(Promise.all(site.pages.map(function(page) {
            return page.render(site.layouts, site.templateData);
        })));
};

p.cleanup = function(callback) {
    var site = this;
    //remove orphaned files (files not in pages, posts, or staticFiles) and empty directories in destination

    // Build a list of the file paths we will be creating during the write step.
    var expectedFiles = _.union(
        _.pluck(site.posts, 'filePath'),
        _.pluck(site.pages, 'filePath'),
        _.pluck(site.staticFiles, 'filePath')
    );

    glob(path.join(site.config.destination, '**', '*'))
        .then(function(files) {
            Promise.all(_.map(files, function(filePath) {
                return new Promise(function(resolve, reject) {
                    if (_.indexOf(expectedFiles, filepath) === -1) {
                        return fs.unlinkAsync(filePath)
                            .then(function() {
                                //todo: emit about cleanup
                                //todo: check directory for empty
                                return resolve();
                            })
                            .error(function(err) {
                                return reject(err);
                            });
                    } else {
                        return resolve();
                    }
                });
            }));
        });
};

// Write the posts, pages, and static files to the destination folder.
p.write = function() {
    var site = this;
    return Promise.all(site.posts.map(function(post) {
            return post.write(site.layouts, site.templateData);
        }))
        .join(Promise.all(site.pages.map(function(page) {
            return page.write(site.layouts, site.templateData);
        })));
};

module.exports = Site;
