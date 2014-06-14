/*globals Primus */
'use strict';

var EventEmitter = require('eventemitter3')
  , collection = require('./collection')
  , Pagelet = require('./pagelet');

/**
 * Pipe is the client-side library which is automatically added to pages which
 * uses the BigPipe framework. It assumes that this library is bundled with
 * a Primus instance which uses the `substream` plugin.
 *
 * Options:
 *
 * - limit: The amount pagelet instances we can reuse.
 * - pagelets: The amount of pagelets we're expecting to load.
 * - id: The id of the page that we're loading.
 *
 * @constructor
 * @param {String} server The server address we need to connect to.
 * @param {Object} options Pipe configuration.
 * @api public
 */
function Pipe(server, options) {
  if (!(this instanceof Pipe)) return new Pipe(server, options);
  if ('object' === typeof server) {
    options = server;
    server = undefined;
  }

  options = options || {};

  this.server = server;                   // The server address we connect to.
  this.options = options;                 // Reference to the used options.
  this.stream = null;                     // Reference to the connected Primus socket.
  this.pagelets = {};                     // Collection of different pagelets.
  this.templates = {};                    // Collection of templates.
  this.freelist = [];                     // Collection of unused Pagelet instances.
  this.maximum = options.limit || 20;     // Max Pagelet instances we can reuse.
  this.assets = {};                       // Asset cache.
  this.root = document.documentElement;   // The <html> element.
  this.expected = +options.pagelets || 0; // Pagelets that this page requires.
  this.rendered = [];                     // List of already rendered pagelets.

  EventEmitter.call(this);

  this.configure(options);
  this.visit(location.pathname, options.id);
}

//
// Inherit from EventEmitter3.
//
Pipe.prototype = new EventEmitter();
Pipe.prototype.constructor = Pipe;

/**
 * Configure the Pipe.
 *
 * @param {Object} options Configuration.
 * @return {Pipe}
 * @api private
 */
Pipe.prototype.configure = function configure(options) {
  var root = this.root
    , className = (root.className || '').replace(/no[_-]js\s?/, '');

  //
  // Add a loading className so we can style the page accordingly and add all
  // classNames back to the root element.
  //
  className = className.length ? className.split(' ') : [];
  if (!~className.indexOf('pagelets-loading')) {
    className.push('pagelets-loading');
  }

  root.className = className.join(' ');

  return this;
};

/**
 * Horrible hack, but needed to prevent memory leaks caused by
 * `document.createDocumentFragment()` while maintaining sublime performance.
 *
 * @type {Number}
 * @private
 */
Pipe.prototype.IEV = document.documentMode
  || +(/MSIE.(\d+)/.exec(navigator.userAgent) || [])[1];

/**
 * A new Pagelet is flushed by the server. We should register it and update the
 * content.
 *
 * @param {String} name The name of the pagelet.
 * @param {Object} data Pagelet data.
 * @returns {Pipe}
 * @api public
 */
Pipe.prototype.arrive = function arrive(name, data) {
  data = data || {};

  var pipe = this
    , root = pipe.root
    , className = (root.className || '').split(' ');

  //
  // Create child pagelet after parent has finished rendering.
  //
  if (!pipe.has(name)) {
    if (data.parent && !~pipe.rendered.indexOf(data.parent)) {
      pipe.once(data.parent +':render', function render() {
        pipe.create(name, data, pipe.get(data.parent).placeholders);
      });
    } else {
      pipe.create(name, data);
    }
  }

  if (data.processed !== pipe.expected) return pipe;

  if (~className.indexOf('pagelets-loading')) {
    className.splice(className.indexOf('pagelets-loading'), 1);
  }

  root.className = className.join(' ');
  pipe.emit('loaded');

  return this;
};

/**
 * Create a new Pagelet instance.
 *
 * @param {String} name The name of the pagelet.
 * @param {Object} data Data for the pagelet.
 * @param {Array} roots Root elements we can search can search for.
 * @returns {Pipe}
 * @api private
 */
Pipe.prototype.create = function create(name, data, roots) {
  data = data || {};

  var pipe = this
    , nr = data.processed || 0
    , pagelet = pipe.pagelets[name] = pipe.alloc();

  pagelet.configure(name, data, roots);

  //
  // A new pagelet has been loaded, emit a progress event.
  //
  pipe.emit('progress', Math.round((nr / pipe.expected) * 100), nr, pagelet);
  pipe.emit('create', pagelet);
};

/**
 * Check if the pagelet has already been loaded.
 *
 * @param {String} name The name of the pagelet.
 * @returns {Boolean}
 * @api public
 */
Pipe.prototype.has = function has(name) {
  return name in this.pagelets;
};

/**
 * Get a pagelet that has already been loaded.
 *
 * @param {String} name The name of the pagelet.
 * @returns {Pagelet|undefined} The found pagelet.
 * @api public
 */
Pipe.prototype.get = function get(name) {
  if (!this.has(name)) return undefined;

  return this.pagelets[name];
};

/**
 * Remove the pagelet.
 *
 * @param {String} name The name of the pagelet that needs to be removed.
 * @returns {Pipe}
 * @api public
 */
Pipe.prototype.remove = function remove(name) {
  if (this.has(name)) {
    this.emit('remove', this.pagelets[name]);
    this.pagelets[name].destroy();

    delete this.pagelets[name];
  }

  return this;
};

/**
 * Broadcast an event to all connected pagelets.
 *
 * @param {String} event The event that needs to be broadcasted.
 * @returns {Pipe}
 * @api public
 */
Pipe.prototype.broadcast = function broadcast(event) {
  for (var pagelet in this.pagelets) {
    if (this.pagelets.hasOwnProperty(pagelet)) {
      EventEmitter.prototype.emit.apply(this.pagelets[pagelet], arguments);
    }
  }

  return this;
};

/**
 * Allocate a new Pagelet instance, retrieve it from our pagelet cache if we
 * have free pagelets available in order to reduce garbage collection.
 *
 * @returns {Pagelet}
 * @api private
 */
Pipe.prototype.alloc = function alloc() {
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
Pipe.prototype.free = function free(pagelet) {
  if (this.freelist.length < this.maximum) {
    this.freelist.push(pagelet);
    return true;
  }

  return false;
};

/**
 * Register a new URL that we've joined.
 *
 * @param {String} url The current URL.
 * @param {String} id The id of the Page that rendered this page.
 * @api public
 */
Pipe.prototype.visit = function visit(url, id) {
  this.id = id || this.id;              // Unique ID of the page.
  this.url = url;                       // Location of the page.

  if (!this.orchestrate) return this.connect();

  this.orchestrate.write({
    url: this.url,
    type: 'page',
    id: this.id
  });

  return this;
};

/**
 * Setup a real-time connection to the pagelet server.
 *
 * @param {String} url The server address.
 * @param {Object} options The Primus configuration.
 * @returns {Pipe}
 * @api private
 */
Pipe.prototype.connect = function connect(url, options) {
  options = options || {};
  options.manual = true;

  var primus = this.stream = new Primus(url, options)
    , pipe = this;

  this.orchestrate = primus.substream('pipe:orchestrate');

  /**
   * Upgrade the connection with URL information about the current page.
   *
   * @param {Object} options The connection options.
   * @api private
   */
  primus.on('outgoing::url', function url(options) {
    var querystring = primus.querystring(options.query || '');

    querystring._bp_pid = pipe.id;
    querystring._bp_url = pipe.url;

    options.query = primus.querystringify(querystring);
  });

  //
  // We forced manual opening of the connection so we can listen to the correct
  // event as it will be executed directly after the `.open` call.
  //
  primus.open();

  return this;
};

//
// Expose the pipe
//
module.exports = Pipe;
