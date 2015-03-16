'use strict';

var EventEmitter = require('eventemitter3')
  , collection = require('./collection')
  , Pagelet = require('./pagelet')
  , destroy = require('demolish');

/**
 * BigPipe is the client-side library which is automatically added to pages which
 * uses the BigPipe framework.
 *
 * Options:
 *
 * - limit: The amount pagelet instances we can reuse.
 * - pagelets: The amount of pagelets we're expecting to load.
 * - id: The id of the page that we're loading.
 *
 * @constructor
 * @param {Object} options BigPipe configuration.
 * @api public
 */
function BigPipe(options) {
  if (!(this instanceof BigPipe)) return new BigPipe(options);

  options = options || {};

  this.expected = +options.pagelets || 0; // Pagelets that this page requires.
  this.allowed = +options.pagelets || 0;  // Pagelets that are allowed for this page.
  this.maximum = options.limit || 20;     // Max Pagelet instances we can reuse.
  this.readyState = BigPipe.LOADING;      // Current readyState.
  this.options = options;                 // Reference to the used options.
  this.templates = {};                    // Collection of templates.
  this.pagelets = [];                     // Collection of different pagelets.
  this.freelist = [];                     // Collection of unused Pagelet instances.
  this.rendered = [];                     // List of already rendered pagelets.
  this.progress = 0;                      // Percentage loaded.
  this.assets = {};                       // Asset cache.
  this.root = document.documentElement;   // The <html> element.

  EventEmitter.call(this);

  this.configure(options);
}

//
// Inherit from EventEmitter3, use old school inheritance because that's the way
// we roll. Oh and it works in every browser.
//
BigPipe.prototype = new EventEmitter();
BigPipe.prototype.constructor = BigPipe;

//
// The various of readyStates that our class can be in.
//
BigPipe.LOADING     = 1;    // Still loading pagelets.
BigPipe.INTERACTIVE = 2;    // All pagelets received, you can safely modify.
BigPipe.COMPLETE    = 3;    // All assets and pagelets loaded.

/**
 * The BigPipe plugins will contain all our plugins definitions.
 *
 * @type {Object}
 * @private
 */
BigPipe.prototype.plugins = {};

/**
 * Process a change in BigPipe.
 *
 * @param {Object} changed Data that is changed.
 * @returns {BigPipe}
 * @api private
 */
BigPipe.prototype.change = require('modification')(' changed');

/**
 * Configure the BigPipe.
 *
 * @param {Object} options Configuration.
 * @return {BigPipe}
 * @api private
 */
BigPipe.prototype.configure = function configure(options) {
  var bigpipe = this;

  //
  // Process the potential plugins.
  //
  for (var plugin in this.plugins) {
    this.plugins[plugin].call(this, this, options);
  }

  //
  // Setup our completion handler.
  //
  var remaining = this.expected;
  bigpipe.on('arrive', function arrived(name) {
    bigpipe.once(name +':initialized', function initialize() {
      if (!--remaining) {
        bigpipe.change({ readyState: BigPipe.COMPLETE });
      }
    });
  });

  return this;
};

/**
 * Horrible hack, but needed to prevent memory leaks caused by
 * `document.createDocumentFragment()` while maintaining sublime performance.
 *
 * @type {Number}
 * @private
 */
BigPipe.prototype.IEV = document.documentMode
  || +(/MSIE.(\d+)/.exec(navigator.userAgent) || [])[1];

/**
 * A new Pagelet is flushed by the server. We should register it and update the
 * content.
 *
 * @param {String} name The name of the pagelet.
 * @param {Object} data Pagelet data.
 * @param {Object} state Pagelet state
 * @returns {BigPipe}
 * @api public
 */
BigPipe.prototype.arrive = function arrive(name, data, state) {
  data = data || {};

  var index
    , bigpipe = this
    , parent = data.parent
    , remaining = data.remaining
    , rendered = bigpipe.rendered;

  bigpipe.progress = Math.round(((bigpipe.expected - remaining) / bigpipe.expected) * 100);
  bigpipe.emit('arrive', name, data, state);

  //
  // Create child pagelet after parent has finished rendering.
  //
  if (!bigpipe.has(name)) {
    if (parent !== 'bootstrap' && !~collection.index(bigpipe.rendered, parent)) {
      bigpipe.once(parent +':render', function render() {
        bigpipe.create(name, data, state, bigpipe.get(parent).placeholders);
      });
    } else {
      bigpipe.create(name, data, state);
    }
  }

  //
  // Keep track of how many pagelets have been fully initialized, e.g. assets
  // loaded and all rendering logic processed. Also count destroyed pagelets as
  // processed.
  //
  if (data.remove) bigpipe.allowed--;
  else bigpipe.once(name +':render', function finished() {
    if (rendered.length === bigpipe.allowed) return bigpipe.broadcast('finished');
  });

  //
  // Emit progress information about the amount of pagelet's that we've
  // received.
  //
  bigpipe.emit('progress', bigpipe.progress, remaining);

  //
  // Check if all pagelets have been received from the server.
  //
  if (remaining) return bigpipe;

  bigpipe.change({ readyState: BigPipe.INTERACTIVE });
  bigpipe.emit('received');

  return this;
};

/**
 * Create a new Pagelet instance.
 *
 * @param {String} name The name of the pagelet.
 * @param {Object} data Data for the pagelet.
 * @param {Object} state State for the pagelet.
 * @param {Array} roots Root elements we can search can search for.
 * @returns {BigPipe}
 * @api private
 */
BigPipe.prototype.create = function create(name, data, state, roots) {
  data = data || {};

  var bigpipe = this
    , pagelet = bigpipe.alloc();

  bigpipe.pagelets.push(pagelet);
  pagelet.configure(name, data, state, roots);

  //
  // A new pagelet has been loaded, emit a progress event.
  //
  bigpipe.emit('create', pagelet);
};

/**
 * Check if the pagelet has already been loaded.
 *
 * @param {String} name The name of the pagelet.
 * @returns {Boolean}
 * @api public
 */
BigPipe.prototype.has = function has(name) {
  return !!this.get(name);
};

/**
 * Get a pagelet that has already been loaded.
 *
 * @param {String} name The name of the pagelet.
 * @param {String} parent Optional name of the parent.
 * @returns {Pagelet|undefined} The found pagelet.
 * @api public
 */
BigPipe.prototype.get = function get(name, parent) {
  var found;

  collection.each(this.pagelets, function each(pagelet) {
    if (name === pagelet.name) {
      found = !parent || pagelet.parent && parent === pagelet.parent.name
        ? pagelet
        : found;
    }

    return !found;
  });

  return found;
};

/**
 * Remove the pagelet.
 *
 * @param {String} name The name of the pagelet that needs to be removed.
 * @returns {BigPipe}
 * @api public
 */
BigPipe.prototype.remove = function remove(name) {
  var pagelet = this.get(name)
    , index = collection.index(this.pagelets, pagelet);

  if (~index && pagelet) {
    this.emit('remove', pagelet);
    this.pagelets.splice(index, 1);
    pagelet.destroy();
  }

  return this;
};

/**
 * Broadcast an event to all connected pagelets.
 *
 * @param {String} event The event that needs to be broadcasted.
 * @returns {BigPipe}
 * @api public
 */
BigPipe.prototype.broadcast = function broadcast(event) {
  var args = arguments;

  collection.each(this.pagelets, function each(pagelet) {
    if (!pagelet.reserved(event)) {
      EventEmitter.prototype.emit.apply(pagelet, args);
    }
  });

  return this;
};

/**
 * Check if the event we're about to emit is a reserved event and should be
 * blocked.
 *
 * Assume that every <name>: prefixed event is internal and should not be
 * emitted by user code.
 *
 * @param {String} event Name of the event we want to emit
 * @returns {Boolean}
 * @api public
 */
BigPipe.prototype.reserved = function reserved(event) {
  return this.has(event.split(':')[0])
  || event in this.reserved.events;
};

/**
 * The actual reserved events.
 *
 * @type {Object}
 * @api private
 */
BigPipe.prototype.reserved.events = {
  remove: 1,    // Pagelet has been removed.
  received: 1,  // Pagelets have been received.
  finished: 1,  // Pagelets have been loaded, processed and rendered.
  progress: 1,  // Loaded a new Pagelet.
  create: 1     // Created a new Pagelet
};

/**
 * Allocate a new Pagelet instance, retrieve it from our pagelet cache if we
 * have free pagelets available in order to reduce garbage collection.
 *
 * @returns {Pagelet}
 * @api private
 */
BigPipe.prototype.alloc = function alloc() {
  return this.freelist.length
    ? this.freelist.shift()
    : new Pagelet(this);
};

/**
 * Free an allocated Pagelet instance which can be re-used again to reduce
 * garbage collection.
 *
 * @param {Pagelet} pagelet The pagelet instance.
 * @returns {Boolean}
 * @api private
 */
BigPipe.prototype.free = function free(pagelet) {
  if (this.freelist.length < this.maximum) {
    this.freelist.push(pagelet);
    return true;
  }

  return false;
};

/**
 * Check if we've probed the client for gzip support yet.
 *
 * @param {String} version Version number of the zipline we support.
 * @returns {Boolean}
 * @api public
 */
BigPipe.prototype.ziplined = function zipline(version) {
  if (~document.cookie.indexOf('zipline='+ version)) return true;

  try { if (sessionStorage.getItem('zipline') === version) return true; }
  catch (e) {}
  try { if (localStorage.getItem('zipline') === version) return true; }
  catch (e) {}

  var bigpipe = document.createElement('bigpipe')
    , iframe = document.createElement('iframe')
    , doc;

  bigpipe.style.display = 'none';
  iframe.frameBorder = 0;
  bigpipe.appendChild(iframe);
  this.root.appendChild(bigpipe);

  doc = iframe.contentWindow.document;
  doc.open().write('<body onload="' +
  'var d = document;d.getElementsByTagName(\'head\')[0].' +
  'appendChild(d.createElement(\'script\')).src' +
  '=\'\/zipline.js\'">');
  doc.close();

  return false;
};

/**
 * Completely destroy the BigPipe instance.
 *
 * @type {Function}
 * @returns {Boolean}
 * @api public
 */
BigPipe.prototype.destroy = destroy('options, templates, pagelets, freelist, rendered, assets, root', {
  before: function before() {
    var bigpipe = this;

    collection.each(bigpipe.pagelets, function remove(pagelet) {
      bigpipe.remove(pagelet.name);
    });
  },
  after: 'removeAllListeners'
});

//
// Expose the BigPipe client library and Pagelet constructor for easy extending.
//
BigPipe.Pagelet = Pagelet;
module.exports = BigPipe;
