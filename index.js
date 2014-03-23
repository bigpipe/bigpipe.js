/*globals Primus */
'use strict';

var EventEmitter = require('eventemitter3')
  , collection = require('./collection')
  , Pagelet = require('./pagelet')
  , loader = require('./loader');

/**
 * Pipe is the client-side library which is automatically added to pages which
 * uses the BigPipe framework. It assumes that this library is bundled with
 * a Primus instance which uses the `substream` plugin.
 *
 * @constructor
 * @param {String} server The server address we need to connect to.
 * @param {Object} options Pipe configuration.
 * @api public
 */
function Pipe(server, options) {
  if (!(this instanceof Pipe)) return new Pipe(server, options);

  options = options || {};

  this.server = server;                 // The server address we connect to.
  this.options = options;               // Reference to the used options.
  this.stream = null;                   // Reference to the connected Primus socket.
  this.pagelets = {};                   // Collection of different pagelets.
  this.freelist = [];                   // Collection of unused Pagelet instances.
  this.maximum = 20;                    // Max Pagelet instances we can reuse.
  this.assets = {};                     // Asset cache.
  this.root = document.documentElement; // The <html> element.

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
  var root = this.root;

  if (root.className.indexOf('no_js')) {
    root.className = root.className.replace('no_js', '');
  }

  //
  // Catch all form submits.
  //
  root.addEventListener('submit', this.submit, false);

  return this;
};

/**
 * Horrible hack, but needed to prevent memory leaks while maintaining sublime
 * performance. See Pagelet.prototype.IEV for more information.
 *
 * @type {Number}
 * @private
 */
Pipe.prototype.IEV = Pagelet.prototype.IEV;

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
  if (!this.has(name)) return this.create(name, data);

  return this;
};

/**
 * Catch all form submits and add reference to originating pagelet.
 *
 * @param {Event} evt The submit event.
 * @returns {Void}
 * @api public
 */
Pipe.prototype.submit = function submit(evt) {
  var src = evt.target || evt.srcElement
    , form = src
    , action
    , name;

  while (src.parentNode) {
    src = src.parentNode;
    if ('getAttribute' in src) name = src.getAttribute('data-pagelet');
    if (name) break;
  }

  //
  // In previous versions we had and `evt.preventDefault()` so we could make
  // changes to the form and re-submit it. But there's a big problem with that
  // and that is that in FireFox it loses the reference to the button that
  // triggered the submit. If causes buttons that had a name and value:
  //
  // ```html
  // <button name="key" value="value" type="submit">submit</button>
  // ```
  //
  // To be missing from the POST or GET. We managed to go around it by not
  // simply preventing the default action. If this still does not not work we
  // need to transform the form URLs once the pagelets are loaded.
  //
  if (name) {
    action = form.getAttribute('action');
    form.setAttribute('action', [
      action,
      ~action.indexOf('?') ? '&' : '?',
      '_pagelet=',
      name
    ].join(''));
  }
};

/**
 * Create a new Pagelet instance.
 *
 * @param {String} name The name of the pagelet.
 * @param {Object} data Data for the pagelet.
 * @returns {Pipe}
 * @api private
 */
Pipe.prototype.create = function create(name, data) {
  var pagelet = this.pagelets[name] = this.alloc();
  pagelet.configure(name, data);

  return this;
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
 * Remove the pagelet.
 *
 * @param {String} name The name of the pagelet that needs to be removed.
 * @returns {Pipe}
 * @api public
 */
Pipe.prototype.remove = function remove(name) {
  if (this.has(name)) {
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
 * @api private
 */
Pipe.prototype.broadcast = function broadcast(event) {
  for (var pagelet in this.pagelets) {
    this.pagelets[pagelet].emit.apply(this.pagelets[pagelet], arguments);
  }

  return this;
};

/**
 * Load a new resource.
 *
 * @param {Element} root The root node where we should insert stuff in.
 * @param {String} url The location of the asset.
 * @param {Function} fn Completion callback.
 * @returns {Loader}
 * @api private
 */
Pipe.prototype.load = loader.load;

/**
 * Unload a new resource.
 *
 * @param {String} url The location of the asset.
 * @returns {Loader}
 * @api private
 */
Pipe.prototype.unload = loader.unload;

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

  this.orchestrate = primus.substream('pipe::orchestrate');

  /**
   * Upgrade the connection with URL information about the current page.
   *
   * @param {Object} options The connection options.
   * @api private
   */
  primus.on('outgoing::url', function url(options) {
    var querystring = primus.querystring(options.query || '');

    querystring._bp_pid = primus.id;
    querystring._bp_url = primus.url;

    options.query = pipe.querystringify(querystring);
  });

  return this;
};

/**
 * Transform a query string object back in to string equiv.
 *
 * @param {Object} obj The query string object.
 * @returns {String}
 * @api private
 */
Pipe.prototype.querystringify = function querystringify(obj) {
  var pairs = [];

  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      pairs.push(key +'='+ obj[key]);
    }
  }

  return pairs.join('&');
};

//
// Expose the pipe
//
module.exports = Pipe;
