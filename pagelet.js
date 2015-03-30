'use strict';

var EventEmitter = require('eventemitter3')
  , collection = require('./collection')
  , AsyncAsset = require('async-asset')
  , Fortress = require('fortress')
  , async = require('./async')
  , val = require('parsifal')
  , one = require('one-time')
  , sandbox
  , undef;

//
// Async Asset loader.
//
var assets = new AsyncAsset(document.body, {
  prefix: '_'
});

/**
 * Representation of a single pagelet.
 *
 * @constructor
 * @param {BigPipe} bigpipe The BigPipe instance that was created.
 * @api public
 */
function Pagelet(bigpipe) {
  if (!(this instanceof Pagelet)) return new Pagelet(bigpipe);

  var self = this;

  //
  // Create one single Fortress instance that orchestrates all iframe based client
  // code. This sandbox variable should never be exposed to the outside world in
  // order to prevent leaking.
  //
  this.sandbox = sandbox = sandbox || new Fortress();
  this.bigpipe = bigpipe;

  //
  // Add an initialized method which is __always__ called when the pagelet is
  // either destroyed directly, errored or loaded.
  //
  this.initialized = one(function initialized() {
    self.broadcast('initialized');
  });
}

//
// Inherit from EventEmitter.
//
Pagelet.prototype = new EventEmitter();
Pagelet.prototype.constructor = Pagelet;

/**
 * Configure the Pagelet.
 *
 * @param {String} name The given name of the pagelet.
 * @param {Object} data The data of the pagelet.
 * @param {Object} state The state of the pagelet.
 * @param {Array} roots HTML root elements search for targets.
 * @api private
 */
Pagelet.prototype.configure = function configure(name, data, state, roots) {
  var bigpipe = this.bigpipe
    , pagelet = this;

  //
  // Pagelet identification.
  //
  pagelet.container = pagelet.sandbox.create(); // Create an application sandbox.
  pagelet.timeout = data.timeout || 25 * 1000;  // Resource loading timeout.
  pagelet.css = collection.array(data.css);     // CSS for the Page.
  pagelet.js = collection.array(data.js);       // Dependencies for the page.
  pagelet.append = data.append || false;        // Append content to the container.
  pagelet.loader = data.loader || '';           // Loading placeholder.
  pagelet.mode = data.mode;                     // Fragment rendering mode.
  pagelet.hash = data.hash;                     // MD5 of templates.
  pagelet.run = data.run;                       // Pagelet client code.
  pagelet.id = data.id;                         // ID of the pagelet.
  pagelet.data = state;                         // All the template state.
  pagelet.name = name;                          // Name of the pagelet.

  //
  // This pagelet was actually part of a parent pagelet, so set a reference to
  // the parent pagelet that was loaded.
  //
  var parent = pagelet.parent = data.parent ? bigpipe.get(data.parent) : void 0;

  //
  // Locate all the placeholders for this given pagelet.
  //
  pagelet.placeholders = pagelet.$('data-pagelet', name, roots);

  //
  // Destroy the pagelet as we've been given the remove flag.
  // However do not destroy assets as unauthorized pagelets won't register
  // assets in the first place and they might be used by other pagelets.
  //
  if (data.remove) return pagelet.destroy({
    assets: false,
    remove: true
  });

  //
  // If we don't have any loading placeholders we want to scan the current
  // placeholders for content and assume that this content should be used when
  // the pagelet is loading or re-loading content. This also needs to be done
  // BEFORE we render the template from the server or we will capture the wrong
  // piece of HTML.
  //
  if (!pagelet.loader) collection.each(pagelet.placeholders, function each(node) {
    if (pagelet.loader) return false;

    var html = (node.innerHTML || '').replace(/^\s+|\s+$/g, '');
    if (html.length) pagelet.loader = html;

    return !pagelet.loader;
  });

  async.each(this.css.concat(this.js), function download(url, next) {
    assets.add(url, next);
  }, function done(err) {
    if (err) return pagelet.initialized(), pagelet.broadcast('error', err);

    pagelet.broadcast('loaded');
    pagelet.render(pagelet.parse());

    //
    // All resources are loaded, but we have a parent element. When the parent
    // element renders it will most likely also nuke our placeholder references
    // preventing us from rendering updates again.
    //
    if (parent) parent.on('render', function render() {
      pagelet.placeholders = pagelet.$('data-pagelet', pagelet.name, parent.placeholders);
      pagelet.render(pagelet.parse() || pagelet.data);
    });

    pagelet.initialize();
  }, { context: bigpipe, timeout: this.timeout });

  pagelet.broadcast('configured', data);
};

/**
 * Get the template for a given type. We currently only support `client` and
 * `error` as types.
 *
 * @param {String} type Template type
 * @returns {Function}
 * @api private
 */
Pagelet.prototype.template = function template(type) {
  type = type || 'client';

  return this.bigpipe.templates[this.hash[type]];
};

/**
 * Get a pagelet loaded on the page.
 *
 * @param {String} name Name of the pagelet we need.
 * @returns {Pagelet|Undefined}
 */
Pagelet.prototype.pagelet = function pagelet(name) {
  return this.bigpipe.get(name, this.name);
};

/**
 * The Pagelet's resource has all been loaded.
 *
 * @api private
 */
Pagelet.prototype.initialize = function initialise() {
  this.broadcast('initialize');
  this.initialized();

  //
  // Only load the client code in a sandbox when it exists. There no point in
  // spinning up a sandbox if it does nothing
  //
  if (!this.code) return;
  this.sandbox(this.prepare(this.code));
};

/**
 * Broadcast an event that will be emitted on the pagelet and the page.
 *
 * @param {String} event The name of the event we should emit
 * @returns {Pagelet}
 * @api public
 */
Pagelet.prototype.broadcast = function broadcast(event) {
  var pagelet = this;

  /**
   * Broadcast the event with namespaced name.
   *
   * @param {String} name Event name.
   * @returns {Pagelet}
   * @api private
   */
  function shout(name) {
    pagelet.bigpipe.emit.apply(pagelet.bigpipe, [
      name.join(':'),
      pagelet
    ].concat(Array.prototype.slice.call(arguments, 1)));

    return pagelet;
  }

  EventEmitter.prototype.emit.apply(this, arguments);

  if (this.parent) shout([this.parent.name, this.name, event]);
  return shout([this.name, event]);
};

/**
 * Check if the event we're about to emit is a reserved event and should be
 * blocked.
 *
 * @param {String} event Name of the event we want to emit
 * @returns {Boolean}
 * @api public
 */
Pagelet.prototype.reserved = function reserved(event) {
  return event in this.reserved.events;
};

/**
 * The events that are used internally.
 *
 * @type {Object}
 * @api private
 */
Pagelet.prototype.reserved.events = {
  configured: 1,    // Pagelet has been configured.
  error: 1,         // Something when wrong in the Pagelet.
  loaded: 1,        // All assets has been loaded.
  submit: 1,        // We've submitted a form.
  initialize: 1,    // Pagelet has been fully initialized, ready to go.
  render: 1,        // Pagelet has rendered new HTML.
  destroy: 1        // Pagelet has been destroyed.
};

/**
 * Find the element based on the attribute and value.
 *
 * @param {String} attribute The name of the attribute we're searching.
 * @param {String} value The value that the attribute should equal to.
 * @param {Array} root Optional array of root elements.
 * @returns {Array} A list of HTML elements that match.
 * @api public
 */
Pagelet.prototype.$ = function $(attribute, value, roots) {
  var elements = [];

  collection.each(roots || [document], function each(root) {
    if ('querySelectorAll' in root) return Array.prototype.push.apply(
      elements,
      root.querySelectorAll('['+ attribute +'="'+ value +'"]')
    );

    //
    // No querySelectorAll support, so we're going to do a full DOM scan in
    // order to search for attributes.
    //
    for (var all = root.getElementsByTagName('*'), i = 0, l = all.length; i < l; i++) {
      if (value === all[i].getAttribute(attribute)) {
        elements.push(all[i]);
      }
    }
  });

  return elements;
};

/**
 * Invoke the correct render method for the pagelet.
 *
 * @param {String|Object} html The HTML or data that needs to be rendered.
 * @returns {Boolean} Successfully rendered a pagelet.
 * @api public
 */
Pagelet.prototype.render = function render(html) {
  if (!this.placeholders.length) return false;

  var mode = this.mode in this ? this[this.mode] : this.html
    , template = this.template('client');

  //
  // We have been given an object instead of pure HTML so we are going to make
  // the assumption that this is data for the client side template and render
  // that our selfs. If no HTML is supplied we're going to use the data that has
  // been send to the client
  //
  if (
       'function' === collection.type(template)
    && (
      'object' === collection.type(html)
      || undef === html && 'object' === collection.type(this.data)
      || html instanceof Error
    )) {
    try {
      if (html instanceof Error) throw html; // So it's captured an processed as error
      html = template(collection.copy(html || {}, this.data || {}));
    }
    catch (e) {
      html = this.template('error')(collection.copy(html || {}, this.data || {}, {
        reason: 'Failed to render: '+ this.name,
        message: e.message,
        stack: e.stack,
        error: e
      }));
    }
  }

  collection.each(this.placeholders, function each(root) {
    mode.call(this, root, html);
  }, this);

  //
  // Register the name of the rendered pagelet as child pagelets
  // might be waiting for it. The length of the collection
  // is also used to keep track of the number of rendered pagelets.
  //
  this.bigpipe.rendered.push(this.name);
  this.broadcast('render', html);

  return true;
};

/**
 * Render the fragment as HTML (default).
 *
 * @param {Element} root Container.
 * @param {String} content Fragment content.
 * @api public
 */
Pagelet.prototype.html = function html(root, content) {
  this.createElements(root, content);
};

/**
 * Create elements via a document fragment.
 *
 * @param {Element} root Container.
 * @param {String} content Fragment content.
 * @api private
 */
Pagelet.prototype.createElements = function createElements(root, content) {
  var fragment = document.createDocumentFragment()
    , div = document.createElement('div')
    , borked = this.bigpipe.IEV < 7;

  //
  // Clean out old HTML before we append our new HTML or we will get duplicate
  // DOM. Or there might have been a loading placeholder in place that needs
  // to be removed. If elements need to be appended only move the elements from
  // the root to the new fragment.
  //
  while (root.firstChild) {
    if (this.append) {
      fragment.appendChild(root.firstChild);
      continue;
    }

    root.removeChild(root.firstChild);
  }

  if (borked) root.appendChild(div);

  div.innerHTML = content;

  while (div.lastChild) {
    fragment.insertBefore(div.lastChild, fragment.firstChild);
  }

  root.appendChild(fragment);
  if (borked) root.removeChild(div);
};

/**
 * Parse the included template from the comment node so it can be injected in to
 * the page as initial rendered view.
 *
 * @returns {String} View.
 * @api private
 */
Pagelet.prototype.parse = function parse() {
  var node = this.$('data-pagelet-fragment', this.id)[0]
    , comment;

  //
  // The firstChild of the fragment should have been a HTML comment, this is to
  // prevent the browser from rendering and parsing the template.
  //
  if (!node.firstChild || node.firstChild.nodeType !== 8) return;

  comment = node.firstChild.nodeValue;

  return comment
    .substring(1, comment.length -1)
    .replace(/\\([\s\S]|$)/g, '$1');
};

/**
 * Set the pagelet in a loading state.
 *
 * @param {Boolean} unloading We're not loading, but unloading.
 * @returns {Pagelet}
 * @api public
 */
Pagelet.prototype.loading = function loading(unloading) {
  if (!unloading) this.render(
    'function' !== typeof this.loader
      ? this.loader || ''
      : this.loader()
  );

  collection.each(this.placeholders, !unloading ? function add(node) {
    var className = (node.className || '').split(' ');

    if (!~collection.index(className, 'loading')) {
      className.push('loading');
      node.className = className.join(' ');
    }

    node.style.cursor = 'wait';
  } : function remove(node) {
    var className = (node.className || '').split(' ')
      , index = collection.index(className, 'loading');

    if (~index) {
      className.splice(index, 1);
      node.className = className.join(' ');
    }

    node.style.cursor = '';
  });

  return this;
};

/**
 * Destroy the pagelet and clean up all references so it can be re-used again in
 * the future.
 *
 * Options:
 *
 * - assets: Also remove assets, true by default can be set to false to keep.
 * - remove: Remove the DOM node after deletion.
 *
 * @param {Object} options Destruction information.
 * @api public
 */
Pagelet.prototype.destroy = function destroy(options) {
  var pagelet = this;

  options = options || {};

  //
  // Execute any extra destroy hooks. This needs to be done before we remove any
  // elements or destroy anything as there might people subscribed to these
  // events.
  //
  this.initialized();
  this.broadcast('destroy', options);

  //
  // Remove all the HTML from the placeholders.
  //
  if (this.placeholders) collection.each(this.placeholders, function remove(root) {
    if (options.remove && root.parentNode) root.parentNode.removeChild(root);
    else while (root.firstChild) root.removeChild(root.firstChild);
  });

  //
  // Remove the sandboxing and prevent element leaking by deferencing them.
  //
  if (this.container) sandbox.kill(this.container.id);
  this.placeholders = this.container = null;

  //
  // Remove the CSS and JS assets.
  //
  if (options.assets !== false) {
    collection.each(this.css.concat(this.js), function remove(url) {
      assets.remove(url);
    });
  }

  //
  // Everything has been cleaned up, release it to our free list Pagelet pool.
  //
  this.bigpipe.free(this);

  return this;
};

//
// Expose the module.
//
module.exports = Pagelet;
