var _ = require('lodash');
var path = require('path');
var lodashTemplate = require('../templateEngines/lodash');

templateHelpers = require('../templateHelpers.js');

module.exports = {
    // Gets true or false whether the given page is supported by this converter.
    supports: function(page) {
        return /^\.(htm|html)$/i.test(path.extname(page.filePath));
    },

    render: function(content, data) {
        // Render the content and return the output.
        var output = lodashTemplate.render(content, _.extend(data, templateHelpers));
        return output;
    }
};