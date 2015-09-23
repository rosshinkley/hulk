var path = require('path'),
    fm = require('front-matter'),
    _ = require('lodash'),
    converters = require('./converters'),
    Promise = require('bluebird'),
    mkdirp = Promise.promisify(require('mkdirp')),
    fs = Promise.promisifyAll(require('fs'));

var Page = function(site, filePath, content) {
    this.filePath = filePath;
    this.site = site;

    var parsedContent = fm(content);
    this._originalFrontMatter = parsedContent.attributes;
    this.templateData = _.clone(this._originalFrontMatter);

    // Save the raw content of the page.
    // This will be the original Markdown or HTML
    // along with any tokens.
    this.content = parsedContent.body;

    // Mark the page as published unless the front-matter has set it to `false`.
    this.published = true;
    if (typeof this.templateData.published === 'boolean') {
        this.published = this.templateData.published;
    }

    // Get the name of the layout to use.
    this.layout = this.templateData.layout;

    // Use the URL specified in the front-matter or default to a URL
    // that matches the relative path of the page.
    if (this._originalFrontMatter.url) {
        this.url = this.templateData.url = this._originalFrontMatter.url;
    } else {
        this.url = this.templateData.url = path.relative(site.source, filePath);
    }
};

var p = Page.prototype;

p.render = function(layouts, siteTemplateData) {
    var page = this;
    return new Promise(function(resolve, reject) {
        var data = {
            site: siteTemplateData,
            page: page.templateData
        };
        //use the page converter if it exists.  If not, use the default.
        var converter = converters.getConverter(page) || converters.default;

        // Save the page's rendered content (minus layout)
        // into the page's template data.
        // This will make it available to index pages and such
        // which may want to include the content of multiple posts on the page.
        var pageHtml = page.templateData.content = converter.render(page.content, data);

        var layout = layouts[page.layout];
        if (layout) {
            // Render the page's content into the layout that should be used.
            page.content = layout.render(pageHtml, data);
        } else {
            page.content = pageHtml;
        }
        return resolve();
    });
};

p.destination = function(destPath) {

    // Add 'index.html' to the URL if needed.
    var url = this.url;
    if (!path.extname(url)) {
        url = path.join(url, 'index.html');
    }

    return path.join(this.site.source, path.join(destPath, url));
};

p.write = function(destination) {
    var destPath = this.destination(destination);
    var page = this;
    return mkdirp(path.dirname(destPath))
        .then(fs.writeFileAsync(destPath, page.content, 'utf8'));
};

module.exports = Page;
