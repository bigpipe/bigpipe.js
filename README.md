# BigPipe.js

`BigPipe.js` is the client side component for the [BigPipe] framework. It
orchestrates the arrival of [pagelet]'s on the page, loads all assets and setup
the real-time connections. It's the glue between the server and your own client
code. While this library is highly opinionated and developed against the
features that are provided in [BigPipe] we made sure that every piece of code is
re-usable by the community. We've extracted various of components out of this
library and released them as separate projects:

- **[frames]**: A small function for creating and managing iframes in the DOM.
- **[containerization]**: Containerization for front-end code.
- **[alcatraz]**: Wraps and prepares front-end code for containerization.
- **[fortress]**: The Docker of front-end applications. It provides a
  docker like API for controlling the containerization process of multiple
  snippets of code.

## Installation

The code is released through npm, but it doesn't work in Node.js. We merely use
it for dependency management.

```
npm install --save bigpipe.js
```

We assume that this code is loaded in an environment that has [primus] and it's
[substream] plugin loaded.

## Table of Contents

**BigPipe instance**
- [Configuration](#bigpipe-configuration)
- [Events](#bigpipe-events)
- [BigPipe.arrive()](#bigpipearrive)
- [BigPipe.has()](#bigpipehas)
- [BigPipe.remove()](#bigpiperemove)
- [BigPipe.broadcast()](#bigpipebroadcast)

**Pagelet instance**
- [Configuration](#pagelet-configuration)
- [Events](#pagelet-events)
- [Pagelet.name](#pageletname)
- [Pagelet.id](#pageletid)
- [Pagelet.placeholders](#pageletplaceholders)
- [Pagelet.destroy()](#pageletdestroy)
- [Pagelet.submit()](#pageletsubmit)
- [Pagelet.get()](#pageletget)
- [Pagelet.broadcast()](#pageletbroadcast)
- [Pagelet.$()](#pagelet)
- [Pagelet.render()](#pageletrender)
- [Pagelet.parse()](#pageletparse)
- [Pagelet.listen()](#pageletlisten)
- [Pagelet.processor()](#pageletprocessor)

### BigPipe: Configuration

The code introduced to the page as an **`BigPipe`** global. The `BigPipe`
constructor accepts 2 arguments:

1. Location of your BigPipe server. If nothing is provided it assumes that you
   want to connect to the current domain.
2. Configuration or options of the BigPipe instance.

The following options are accepted:

- **limit**: The amount of Pagelets instances we can re-use to reduce garbage
  collections. Defaults to `20`
- **pagelets**: The amount of Pagelets we expect to be loaded on the page. This
  is used to determine the loading/progress of the page.
- **id**: The `id` of the Page that we're loading.

In addition to the options listed above, all options that can be used to
configure [primus] are also supported as this options object is directly passed
to the Primus constructor. The only Primus option that is forced by us is the
**manual** option. As we need to be in control of the opening of the real-time
connection.

```js
var bigpipe = new BigPipe(undefined, { 
  pagelets: 20,
  id: 'ADFASDF0E-2FADAF-24'
});
```

When a new BigPipe instance has been created it will automatically check the
`documentElement` or `<html>` element for the presence of a `no_js` class. When
this class is found it will be automatically removed as JavaScript is obviously
active and working as intended.  In addition to that we also append the class
`pagelets-loading` to the element.

### BigPipe: Events

The created `bigpipe` instance is an [EventEmitter3]. Events that are prefixed
with `<name>` indicates that the `<name>` is the name of the Pagelet that emits
this message.

Event                 | Receives                   | Description
----------------------|----------------------------|--------------------------------
`progress`            | percentage, index, Pagelet | A new Pagelet has been loaded.
`loaded`              |                            | All Pagelets have been loaded.
`create`              | Pagelet                    | A new Pagelet has been created.
`remove`              | Pagelet                    | A pagelet has been removed.
`<name>:error`        | Pagelet, Error             | We've failed to load the Pagelet.
`<name>:loaded`       | Pagelet                    | All assets have been loaded.
`<name>:configure`    | Pagelet, Data object       | Pagelet has been configured.
`<name>:initialize`   | Pagelet                    | Pagelet has been initialized.
`<name>:render`       | Pagelet, html              | Rendered the HTML.
`<name>:destroy`      | Pagelet                    | Pagelet has been destroyed.

### BigPipe#arrive

**public**, _returns BigPipe_.

```js
bigpipe.arrive('pagelet name', { data object });
```

When a new Pagelet has been pushed from the server to the client it should be
announced using this method. If we don't have a Pagelet for this name yet we
will automatically create a new Pagelet instance and assign it this name. After
the creation of this Pagelet we emit the `progress` event as new Pagelet has
been loaded.

```js
bigpipe.on('progress', function progress(percentage, index, pagelet) {
  console.log('loaded %s of %s pagelets. We are %s% loaded', this.expected, index, percentage);
});
```

But also an `create` event:

```js
bigpipe.on('create', function create(pagelet) {
  console.log('A new pagelet has been created', pagelet.name);
});
```

If this was the last Pagelet that needed to be loaded we will also emit the
`loaded` event:

```js
bigpipe.on('loaded', function loaded() {
  console.log('All pagelets have been loaded.');
});
```

But just because they have been loaded it doesn't mean that they all have been
rendered as well as assets still need to be loaded.

The options that are provided will be passed in the Pagelet's configuration
method so it can start fetching and rendering the newly received Pagelet. There
is one property that is **required** to be present on the data object:

- **processed**: A number that indicates how many pagelets the server has
  processed. This is used to determine if all Pagelets have been flushed from
  the server.

Please note that in the case of BigPipe this method call is automatically added
at the bottom of the server response. So you don't need to manually invoke this.

```js
bigpipe.arrive("packages", {
  "id": "G1M3RAKQK4V7K3XR-SB00M199BR8DUNMI-9EJZKHLWHE5C23XR-LHXF7DD4SHHQ6W29",
  "css": ["/4200c15db55f69d6038332b69a9099b3d178242f.css"],
  "js": ["/97bdbe337bf705ff46b4476ed8a5b65b551106dd.js"],
  "rpc": ["autocomplete"],
  "authorized": true,
  "streaming": true,
  "remove": false,
  "processed": 1,
  "data": {}
});
```

### BigPipe#has

**public**, _returns boolean_.

```js
bigpipe.has('pagelet name');
```

Check if a Pagelet has already been loaded/received on the page.

### BigPipe#remove

**public**, _returns BigPipe_

```js
bigpipe.remove('pagelet name');
```

Removes a pagelet from our internal Pagelet object. The `remove` event is
emitted before we actually destroy the pagelet that gets removed so you could do
some additional cleanup if needed. After the event is emitted we call the
[Pagelet#destroy](#pageletdestroy) method and remove it from our internal
reference.

```js
bigpipe.on('remove', function (pagelet) {
  console.log('removed', pagelet);
});

bigpipe.remove('pagelet name');
```

### BigPipe#broadcast

**public**, __returns BigPipe__

```js
bigpipe.broadcast(event, [args]);
```

Broadcast will emit the given event on every single added Pagelet instance.

```js
bigpipe.broadcast('hello', 'world');
bigpipe.broadcast('foo bar', 'multiple', 1, 'args', { no: 'problem' });
```
### Pagelet: Configuration

Unlike the `BigPipe` class you do not need to create instances of the Pagelet
your self. This is all orchestrated by the [BigPipe.arrive] method. The reason
for this is that it needs to have a reference to the BigPipe instance as well as
one to the created [Primus] connection so we can create a dedicated [substream]
for each pagelet.

```js
var pagelet = new Pagelet(bigpipe);
```

The Pagelet instances are simply allocated and returned to a pool so they can be
re-used and improve garbage collection. The options it receives are applied
every time the `Pagelet.configuration` is called which again is done in the
BigPipe.arrive method.

```js
pagelet.configure('pagelet name', { received data/options });
```

The following options are accepted:

- **id**: The `id` of the Pagelet that we're loading.
- **remove**: Do we need to remove the placeholder from the DOM? You usually
  want to do this with optional pagelets that require authorization.
- **css**: An array of CSS files that need to be loaded before we can display
  the Pagelet's HTML.
- **js**: Array of JS files that need to be loaded before we can display the
  Pagelet's HTML.
- **data**: Addition data that should be made available on the client. This is
  data that you've selected using the
  [Pagelet.query](https://github.com/bigpipe/pagelet#pagelet-query) on the server.
- **rpc**: An array of method names on the server which should be introduced on
  this Pagelet which will do RPC calls.
- **timeout**: The maximum amount of milliseconds we should wait for all the
  Pagelets resources to be loaded. If it takes longer than this we assume a load
  failure.
- **streaming**: Should we stream form submits to the server using our real-time
  connection.

When the pagelet is configured it:

01. Finds all placeholders for the given name based on the `data-pagelet=""`
    attribute on HTML elements.
02. Stores the name as `.name` and `data.id` as `.id`.
03. If `remove` as option is set. It will call `Pagelet.destroy(true)` so it
    removes the placeholder elements.
04. It attaches `<form>` submit listeners so we re-route those requests over our
    real-time connection.
05. Creates a [substream] with the Pagelet's name so we can multiplex multiple
    Pagelets over one single real-time connection.
06. Stores some of the data properties.
07. Generates methods from the given `rpc` array.
08. Broadcasts the `configured` event.
09. It loads all `css` and `js` files.
10. When all assets have been loaded it will emit `loaded`
11. We'll find the HTML that needs to be rendered using the `Pagelet.parse` and
    render it in the placeholders using `Pagelet.render(html)`
12. The render method emits `render`.
13. Finally everything is done and emit the `initialize` event.

Congratulations you've read through the whole configuration process of a
pagelet. Hopefully this makes everything a bit more clear on how they work.

### Pagelet: Events

The created `Pagelet` instance is an [EventEmitter3]. The following events are
emitted by the Pagelet:

Event                 | Receives                   | Description
----------------------|----------------------------|--------------------------------
`error`               | Error                      | We've failed to load the Pagelet.
`loaded`              |                            | All assets have been loaded.
`configure`           | Data object                | Pagelet has been configured.
`initialize`          |                            | Pagelet has been initialized.
`render`              | html                       | Rendered the HTML.
`destroy`             |                            | Pagelet is about to be destroyed.

### Pagelet.name

**public**, __String__

The name of the Pagelet.

### Pagelet.id

**public**, __String__

The unique id of the Pagelet.

### Pagelet.placeholders

**public**, __Array__

Array of placeholders HTML elements that had `data-pagelet` set to the Pagelet's
name. When the pagelet is rendering all of these pagelets will have their HTML
updated.

### Pagelet#destroy

**public**, __returns Pagelet__.

```js
pagelet.destroy(boolean);
```

Destroy the created Pagelet. If `true` as argument is given it will also remove
the placeholders the Pagelet was running in. Before we start with the
destruction process we emit an `destroy` event. This allows you clean up the
pagelet if needed.

```js
pagelet.on('destroy', function () {
  console.log('Pagelet', this.name, 'has been destroyed');
});
```

After the event is emitted we:

- Remove all the elements from the Pagelet placeholder.
- If the `remove` boolean is given, the placeholder is also removed.
- If `rpc` methods were added to the Pagelet, they are deleted.
- Possible JavaScript sandboxes are cleared.
- The pagelet is freed and returned to the Pagelet pool.

### Pagelet#submit

**public**, __returns Object__.

```js
pagelet.submit(document.forms[0]);
```

Submit the contents of the given form to Pagelet on the server using the
real-time connection. We extract the input/select/textarea/button elements from
the form and transform it an object. If you have selected a button/input we will
filter out elements with same name so it doesn't get overridden.

When invoking this method we return the created object which was sent to the
server.

```html
<form id="foo" action="/foo" method="POST">
  <input name="foo" value="bar">
</form>
```

```js
var data = pagelet.submit(document.getElementById('foo'));

console.log(data.foo) // "bar"
```

### Pagelet#get

**public**, __returns Pagelet__.

```js
pagelet.get();
```

Re-render the HTML which is retrieved from the server.

### Pagelet#broadcast

**public**, __returns Pagelet__.

```js
pagelet.broadcast('eventname', [ optional arguments ]);
```

Broadcast an event to this Pagelet instance as well as the BigPipe instance
that created the Pagelet. Before emitting the event on the BigPipe instance it
prefixes the event with the name of the Pagelet and `:`. If the name of your
Pagelet is `foo` and you emit event `bar` the BigPipe instance will emit
`foo:bar` as event.

```js
pagelet.broadcast('foo', 'bar');
```

### Pagelet#$

**public**, __returns Array__.

```js
pagelet.$('data-pagelet', 'foo');
```

Find elements in the DOM based on the attribute name and it's value. If
`querySelectorAll` is not supported in the browser we will fall back to a full
DOM scan in order to get the correct elements. All items are added to an array.
If no matching elements are found the Array will be empty.

### Pagelet#render

**public**, __returns Boolean__.

```js
pagelet.render('<strong>bigpipe ftw</strong>');
```

Insert the given HTML in the placeholders. If there are elements in the
placeholder they will be removed first as it might be a good idea to display a
loading message while we are still rendering or loading the resource from the
server. Once all HTML has been added to the placeholders we emit the `render`
event.

```js
pagelet.render('foo'); // true
pagelet.placeholders.length = 0;
pagelet.render('foo'); // false
```

### Pagelet#parse

**private**, __returns String__.

```js
var prerendered = pagelet.parse();
```

Parse the pre-rendered HTML template from the comment node that got injected in
to our Page when the fragment was written. It's wrapped in a HTML comment so the
browser doesn't spend any time parsing the contents of it. It searches for the
comment node based on the `name` property and searches for an element with an
`data-pagelet-fragment` attribute.

### Pagelet#listen

**private**, __returns Pagelet__.

```js
pagelet.listen();
```

This **private** method attaches an `submit` listener to the placeholder so it
can intercept the POST/PUT/GET requests from a `<form>` and re-route them over the
real-time connection. If a `data-pagelet-async="false"` property is set on the
form it will simply append `_pagelet=<name>` to the action as query string so the
server knows which pagelet has submitted this form.

When the Pagelet emits `destroy` we will automatically remove the attached event
listener.

### Pagelet#processor

**private**, __returns Pagelet__.

```js
pagelet.processor({ packet object });
```

This **private** method processes the incoming messages from our [substream]. It
handles all the RPC calls, Event Emitting, HTML rendering and much more. There
are many different types of packets that it can process. There a couple
requirements in order for us to process the data.

- The received packets are objects.
- Each packet contains a `type` property that indicates the type of package.

```js
pagelet.processor({ type: 'event', args: ['eventname', 'arg', 'arg' ]});
```

## License

MIT

[BigPipe]: https://bigpipe.io
[pagelet]: https://github.com/bigpipe/pagelet
[primus]: https://github.com/primus/primus
[substream]: https://github.com/primus/substream
[frames]: https://github.com/bigpipe/frames
[containerization]: https://github.com/bigpipe/containerization
[alcatraz]: https://github.com/bigpipe/alcatraz
[fortress]: https://github.com/bigpipe/fortress
[EventEmitter3]: https://github.com/3rd-Eden/EventEmitter3
