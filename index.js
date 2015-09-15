'use strict';

var Fittings = require('fittings')
  , join = require('path').join
  , fs = require('fs');

/**
 * Read files out of our instructions directory.
 *
 * @param {String} file Filename that we should read.
 * @returns {String}
 * @api private
 */
function read(file) {
  return fs.readFileSync(join(__dirname, 'instructions', file), 'utf-8');
}

//
// Expose the fittings definition for the BigPipe.js client library which
// processes all the magic.
//
Fittings.extend({
  //
  // Required name to identify the framework being pushed into Fittings.
  //
  name: 'bigpipe',

  //
  // The template that is flushed to the client every single time a pagelet is
  // ready to write it's output. We split it so we can minify all the things.
  //
  fragment: read('fragment.html').split('\n').join(''),

  //
  // Library bootstrap which will be passed into the bootstrap pagelet.
  //
  bootstrap: read('bootstrap.html'),

  //
  // Wrapping template to introduce client-side templates.
  //
  template: read('template.js'),

  //
  // Wrapping template to introduce plugin client code.
  //
  plugin: read('plugin.js'),

  //
  // Reference(s) to the library files that should be loaded.
  //
  library: require.resolve('./bigpipe.js'),

  //
  // Additional plugins.
  //
  use: {
    css: {
      server: function server(bigpipe) {
        var compiler = bigpipe._compiler;

        compiler.on('assembly', compiler.namespace);
      }
    }
  }
}).on(module);
