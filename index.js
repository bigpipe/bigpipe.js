'use strict';

var read = require('fs').readFileSync
  , Fittings = require('fittings')
  , join = require('path').join;

//
// Expose the fittings definition for the BigPipe.js client library which
// processes all the magic.
//
Fittings.extend({
  //
  // The template that is flushed to the client every single time a pagelet is
  // ready to write it's output.
  //
  fragment: read(join(__dirname, '/fragment.html'), 'utf-8').split('\n').join(''),

  //
  // Library bootstrap which will be passed into the bootstrap pagelet.
  //
  bootstrap: read(join(__dirname, '/bootstrap.html'), 'utf-8'),

  //
  // Wrapping template to introduce client-side templates.
  //
  template: read(join(__dirname, '/template.js'), 'utf-8'),

  //
  // Wrapping template to introduce plugin client code.
  //
  plugin: read(join(__dirname, '/plugin.js'), 'utf-8'),

  //
  // Reference(s) to the library files that should be loaded.
  //
  library: read(join(__dirname, 'bigpipe.js'), 'utf-8'),
}).on(module);
