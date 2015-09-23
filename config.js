var Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    path = require('path'),
    yaml = require('yaml-js'),
    _ = require('lodash'),

    // read config
    defaults = {
        source: process.cwd(),
        destination: '_site',
        layouts: '_layouts',
        posts: '_posts',
        permalink: '/{{year}}/{{month}}/{{day}}/{{slug}}.html',
        ignore: [
            '_config.yml',
            'node_modules/**',
            'package.json',
            '**/.*', // dot files
            '.*/**' // dot files
        ]
    };

function ignoreSpecialFolders(config) {
    var ignores = [
        config.destination,
        config.layouts,
        config.posts
    ];

    for (var i = 0; i < ignores.length; i++) {
        config.ignore.push(path.join(ignores[i], '**'));
    }
}

function readConfig() {
    var configPath = path.join(process.cwd(), '_config.yml');
    console.log('Configuration from %s', configPath);
    return fs.readFileAsync(configPath, 'utf8')
        .then(function(data) {
            var config = yaml.load(data);

            // Override the default configuration values with the site's config.
            config = _.defaults(config, defaults);

            // Merge the config file's ignore list with our default ignores.
            // Unlike other configuration options the user can't override
            // our defaults, only append to them.
            config.ignore = _.union(config.ignore, defaults.ignore);

            // Trim trailing forward-slash from the URL.
            // This is only applicable to relative URLs of course.
            // All page and post URLs will begin with a forward-slash
            // and this prevents doubling up.
            config.url = config.url.replace(/\/$/, '');

            // Ignore some special folders set in the configuration.
            ignoreSpecialFolders(config);
        });
}

module.exports = {
    read: readConfig
};
