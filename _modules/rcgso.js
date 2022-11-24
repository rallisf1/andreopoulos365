function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function exclude_internal_props(props) {
    const result = {};
    for (const k in props)
        if (k[0] !== '$')
            result[k] = props[k];
    return result;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function set_attributes(node, attributes) {
    // @ts-ignore
    const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
    for (const key in attributes) {
        if (attributes[key] == null) {
            node.removeAttribute(key);
        }
        else if (key === 'style') {
            node.style.cssText = attributes[key];
        }
        else if (key === '__value') {
            node.value = node[key] = attributes[key];
        }
        else if (descriptors[key] && descriptors[key].set) {
            node[key] = attributes[key];
        }
        else {
            attr(node, key, attributes[key]);
        }
    }
}
function set_svg_attributes(node, attributes) {
    for (const key in attributes) {
        attr(node, key, attributes[key]);
    }
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_svg_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, svg_element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.wholeText !== data)
        text.data = data;
}
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, cancelable, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs#run-time-svelte-onmount
 */
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
/**
 * Schedules a callback to run immediately before the component is unmounted.
 *
 * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
 * only one that runs inside a server-side component.
 *
 * https://svelte.dev/docs#run-time-svelte-ondestroy
 */
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
/**
 * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
 * Event dispatchers are functions that can take two arguments: `name` and `detail`.
 *
 * Component events created with `createEventDispatcher` create a
 * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
 * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
 * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
 * property and can contain any type of data.
 *
 * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
 */
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail, { cancelable = false } = {}) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail, { cancelable });
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
            return !event.defaultPrevented;
        }
        return true;
    };
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        while (flushidx < dirty_components.length) {
            const component = dirty_components[flushidx];
            flushidx++;
            set_current_component(component);
            update(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}

function get_spread_update(levels, updates) {
    const update = {};
    const to_null_out = {};
    const accounted_for = { $$scope: 1 };
    let i = levels.length;
    while (i--) {
        const o = levels[i];
        const n = updates[i];
        if (n) {
            for (const key in o) {
                if (!(key in n))
                    to_null_out[key] = 1;
            }
            for (const key in n) {
                if (!accounted_for[key]) {
                    update[key] = n[key];
                    accounted_for[key] = 1;
                }
            }
            levels[i] = n;
        }
        else {
            for (const key in o) {
                accounted_for[key] = 1;
            }
        }
    }
    for (const key in to_null_out) {
        if (!(key in update))
            update[key] = undefined;
    }
    return update;
}
function create_component(block) {
    block && block.c();
}
function claim_component(block, parent_nodes) {
    block && block.l(parent_nodes);
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

const matchIconName = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const stringToIcon = (value, validate, allowSimpleName, provider = "") => {
  const colonSeparated = value.split(":");
  if (value.slice(0, 1) === "@") {
    if (colonSeparated.length < 2 || colonSeparated.length > 3) {
      return null;
    }
    provider = colonSeparated.shift().slice(1);
  }
  if (colonSeparated.length > 3 || !colonSeparated.length) {
    return null;
  }
  if (colonSeparated.length > 1) {
    const name2 = colonSeparated.pop();
    const prefix = colonSeparated.pop();
    const result = {
      provider: colonSeparated.length > 0 ? colonSeparated[0] : provider,
      prefix,
      name: name2
    };
    return validate && !validateIconName(result) ? null : result;
  }
  const name = colonSeparated[0];
  const dashSeparated = name.split("-");
  if (dashSeparated.length > 1) {
    const result = {
      provider,
      prefix: dashSeparated.shift(),
      name: dashSeparated.join("-")
    };
    return validate && !validateIconName(result) ? null : result;
  }
  if (allowSimpleName && provider === "") {
    const result = {
      provider,
      prefix: "",
      name
    };
    return validate && !validateIconName(result, allowSimpleName) ? null : result;
  }
  return null;
};
const validateIconName = (icon, allowSimpleName) => {
  if (!icon) {
    return false;
  }
  return !!((icon.provider === "" || icon.provider.match(matchIconName)) && (allowSimpleName && icon.prefix === "" || icon.prefix.match(matchIconName)) && icon.name.match(matchIconName));
};
const defaultIconDimensions = Object.freeze({
  left: 0,
  top: 0,
  width: 16,
  height: 16
});
const defaultIconTransformations = Object.freeze({
  rotate: 0,
  vFlip: false,
  hFlip: false
});
const defaultIconProps = Object.freeze({
  ...defaultIconDimensions,
  ...defaultIconTransformations
});
const defaultExtendedIconProps = Object.freeze({
  ...defaultIconProps,
  body: "",
  hidden: false
});
function mergeIconTransformations(obj1, obj2) {
  const result = {};
  if (!obj1.hFlip !== !obj2.hFlip) {
    result.hFlip = true;
  }
  if (!obj1.vFlip !== !obj2.vFlip) {
    result.vFlip = true;
  }
  const rotate = ((obj1.rotate || 0) + (obj2.rotate || 0)) % 4;
  if (rotate) {
    result.rotate = rotate;
  }
  return result;
}
function mergeIconData(parent, child) {
  const result = mergeIconTransformations(parent, child);
  for (const key in defaultExtendedIconProps) {
    if (key in defaultIconTransformations) {
      if (key in parent && !(key in result)) {
        result[key] = defaultIconTransformations[key];
      }
    } else if (key in child) {
      result[key] = child[key];
    } else if (key in parent) {
      result[key] = parent[key];
    }
  }
  return result;
}
function getIconsTree(data, names) {
  const icons = data.icons;
  const aliases = data.aliases || {};
  const resolved = /* @__PURE__ */ Object.create(null);
  function resolve(name) {
    if (icons[name]) {
      return resolved[name] = [];
    }
    if (!(name in resolved)) {
      resolved[name] = null;
      const parent = aliases[name] && aliases[name].parent;
      const value = parent && resolve(parent);
      if (value) {
        resolved[name] = [parent].concat(value);
      }
    }
    return resolved[name];
  }
  (names || Object.keys(icons).concat(Object.keys(aliases))).forEach(resolve);
  return resolved;
}
function internalGetIconData(data, name, tree) {
  const icons = data.icons;
  const aliases = data.aliases || {};
  let currentProps = {};
  function parse(name2) {
    currentProps = mergeIconData(icons[name2] || aliases[name2], currentProps);
  }
  parse(name);
  tree.forEach(parse);
  return mergeIconData(data, currentProps);
}
function parseIconSet(data, callback) {
  const names = [];
  if (typeof data !== "object" || typeof data.icons !== "object") {
    return names;
  }
  if (data.not_found instanceof Array) {
    data.not_found.forEach((name) => {
      callback(name, null);
      names.push(name);
    });
  }
  const tree = getIconsTree(data);
  for (const name in tree) {
    const item = tree[name];
    if (item) {
      callback(name, internalGetIconData(data, name, item));
      names.push(name);
    }
  }
  return names;
}
const optionalPropertyDefaults = {
  provider: "",
  aliases: {},
  not_found: {},
  ...defaultIconDimensions
};
function checkOptionalProps(item, defaults) {
  for (const prop in defaults) {
    if (prop in item && typeof item[prop] !== typeof defaults[prop]) {
      return false;
    }
  }
  return true;
}
function quicklyValidateIconSet(obj) {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }
  const data = obj;
  if (typeof data.prefix !== "string" || !obj.icons || typeof obj.icons !== "object") {
    return null;
  }
  if (!checkOptionalProps(obj, optionalPropertyDefaults)) {
    return null;
  }
  const icons = data.icons;
  for (const name in icons) {
    const icon = icons[name];
    if (!name.match(matchIconName) || typeof icon.body !== "string" || !checkOptionalProps(icon, defaultExtendedIconProps)) {
      return null;
    }
  }
  const aliases = data.aliases || {};
  for (const name in aliases) {
    const icon = aliases[name];
    const parent = icon.parent;
    if (!name.match(matchIconName) || typeof parent !== "string" || !icons[parent] && !aliases[parent] || !checkOptionalProps(icon, defaultExtendedIconProps)) {
      return null;
    }
  }
  return data;
}
const dataStorage = /* @__PURE__ */ Object.create(null);
function newStorage(provider, prefix) {
  return {
    provider,
    prefix,
    icons: /* @__PURE__ */ Object.create(null),
    missing: /* @__PURE__ */ new Set()
  };
}
function getStorage(provider, prefix) {
  const providerStorage = dataStorage[provider] || (dataStorage[provider] = /* @__PURE__ */ Object.create(null));
  return providerStorage[prefix] || (providerStorage[prefix] = newStorage(provider, prefix));
}
function addIconSet(storage2, data) {
  if (!quicklyValidateIconSet(data)) {
    return [];
  }
  return parseIconSet(data, (name, icon) => {
    if (icon) {
      storage2.icons[name] = icon;
    } else {
      storage2.missing.add(name);
    }
  });
}
function addIconToStorage(storage2, name, icon) {
  try {
    if (typeof icon.body === "string") {
      storage2.icons[name] = {...icon};
      return true;
    }
  } catch (err) {
  }
  return false;
}
let simpleNames = false;
function allowSimpleNames(allow) {
  if (typeof allow === "boolean") {
    simpleNames = allow;
  }
  return simpleNames;
}
function getIconData(name) {
  const icon = typeof name === "string" ? stringToIcon(name, true, simpleNames) : name;
  if (icon) {
    const storage2 = getStorage(icon.provider, icon.prefix);
    const iconName = icon.name;
    return storage2.icons[iconName] || (storage2.missing.has(iconName) ? null : void 0);
  }
}
function addIcon(name, data) {
  const icon = stringToIcon(name, true, simpleNames);
  if (!icon) {
    return false;
  }
  const storage2 = getStorage(icon.provider, icon.prefix);
  return addIconToStorage(storage2, icon.name, data);
}
function addCollection(data, provider) {
  if (typeof data !== "object") {
    return false;
  }
  if (typeof provider !== "string") {
    provider = data.provider || "";
  }
  if (simpleNames && !provider && !data.prefix) {
    let added = false;
    if (quicklyValidateIconSet(data)) {
      data.prefix = "";
      parseIconSet(data, (name, icon) => {
        if (icon && addIcon(name, icon)) {
          added = true;
        }
      });
    }
    return added;
  }
  const prefix = data.prefix;
  if (!validateIconName({
    provider,
    prefix,
    name: "a"
  })) {
    return false;
  }
  const storage2 = getStorage(provider, prefix);
  return !!addIconSet(storage2, data);
}
const defaultIconSizeCustomisations = Object.freeze({
  width: null,
  height: null
});
const defaultIconCustomisations = Object.freeze({
  ...defaultIconSizeCustomisations,
  ...defaultIconTransformations
});
const unitsSplit = /(-?[0-9.]*[0-9]+[0-9.]*)/g;
const unitsTest = /^-?[0-9.]*[0-9]+[0-9.]*$/g;
function calculateSize(size, ratio, precision) {
  if (ratio === 1) {
    return size;
  }
  precision = precision || 100;
  if (typeof size === "number") {
    return Math.ceil(size * ratio * precision) / precision;
  }
  if (typeof size !== "string") {
    return size;
  }
  const oldParts = size.split(unitsSplit);
  if (oldParts === null || !oldParts.length) {
    return size;
  }
  const newParts = [];
  let code = oldParts.shift();
  let isNumber = unitsTest.test(code);
  while (true) {
    if (isNumber) {
      const num = parseFloat(code);
      if (isNaN(num)) {
        newParts.push(code);
      } else {
        newParts.push(Math.ceil(num * ratio * precision) / precision);
      }
    } else {
      newParts.push(code);
    }
    code = oldParts.shift();
    if (code === void 0) {
      return newParts.join("");
    }
    isNumber = !isNumber;
  }
}
function iconToSVG(icon, customisations) {
  const fullIcon = {
    ...defaultIconProps,
    ...icon
  };
  const fullCustomisations = {
    ...defaultIconCustomisations,
    ...customisations
  };
  const box = {
    left: fullIcon.left,
    top: fullIcon.top,
    width: fullIcon.width,
    height: fullIcon.height
  };
  let body = fullIcon.body;
  [fullIcon, fullCustomisations].forEach((props) => {
    const transformations = [];
    const hFlip = props.hFlip;
    const vFlip = props.vFlip;
    let rotation = props.rotate;
    if (hFlip) {
      if (vFlip) {
        rotation += 2;
      } else {
        transformations.push("translate(" + (box.width + box.left).toString() + " " + (0 - box.top).toString() + ")");
        transformations.push("scale(-1 1)");
        box.top = box.left = 0;
      }
    } else if (vFlip) {
      transformations.push("translate(" + (0 - box.left).toString() + " " + (box.height + box.top).toString() + ")");
      transformations.push("scale(1 -1)");
      box.top = box.left = 0;
    }
    let tempValue;
    if (rotation < 0) {
      rotation -= Math.floor(rotation / 4) * 4;
    }
    rotation = rotation % 4;
    switch (rotation) {
      case 1:
        tempValue = box.height / 2 + box.top;
        transformations.unshift("rotate(90 " + tempValue.toString() + " " + tempValue.toString() + ")");
        break;
      case 2:
        transformations.unshift("rotate(180 " + (box.width / 2 + box.left).toString() + " " + (box.height / 2 + box.top).toString() + ")");
        break;
      case 3:
        tempValue = box.width / 2 + box.left;
        transformations.unshift("rotate(-90 " + tempValue.toString() + " " + tempValue.toString() + ")");
        break;
    }
    if (rotation % 2 === 1) {
      if (box.left !== box.top) {
        tempValue = box.left;
        box.left = box.top;
        box.top = tempValue;
      }
      if (box.width !== box.height) {
        tempValue = box.width;
        box.width = box.height;
        box.height = tempValue;
      }
    }
    if (transformations.length) {
      body = '<g transform="' + transformations.join(" ") + '">' + body + "</g>";
    }
  });
  const customisationsWidth = fullCustomisations.width;
  const customisationsHeight = fullCustomisations.height;
  const boxWidth = box.width;
  const boxHeight = box.height;
  let width;
  let height;
  if (customisationsWidth === null) {
    height = customisationsHeight === null ? "1em" : customisationsHeight === "auto" ? boxHeight : customisationsHeight;
    width = calculateSize(height, boxWidth / boxHeight);
  } else {
    width = customisationsWidth === "auto" ? boxWidth : customisationsWidth;
    height = customisationsHeight === null ? calculateSize(width, boxHeight / boxWidth) : customisationsHeight === "auto" ? boxHeight : customisationsHeight;
  }
  const result = {
    attributes: {
      width: width.toString(),
      height: height.toString(),
      viewBox: box.left.toString() + " " + box.top.toString() + " " + boxWidth.toString() + " " + boxHeight.toString()
    },
    body
  };
  return result;
}
const regex = /\sid="(\S+)"/g;
const randomPrefix = "IconifyId" + Date.now().toString(16) + (Math.random() * 16777216 | 0).toString(16);
let counter = 0;
function replaceIDs(body, prefix = randomPrefix) {
  const ids = [];
  let match;
  while (match = regex.exec(body)) {
    ids.push(match[1]);
  }
  if (!ids.length) {
    return body;
  }
  ids.forEach((id) => {
    const newID = typeof prefix === "function" ? prefix(id) : prefix + (counter++).toString();
    const escapedID = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(new RegExp('([#;"])(' + escapedID + ')([")]|\\.[a-z])', "g"), "$1" + newID + "$3");
  });
  return body;
}
const storage = /* @__PURE__ */ Object.create(null);
function setAPIModule(provider, item) {
  storage[provider] = item;
}
function getAPIModule(provider) {
  return storage[provider] || storage[""];
}
function createAPIConfig(source) {
  let resources;
  if (typeof source.resources === "string") {
    resources = [source.resources];
  } else {
    resources = source.resources;
    if (!(resources instanceof Array) || !resources.length) {
      return null;
    }
  }
  const result = {
    resources,
    path: source.path || "/",
    maxURL: source.maxURL || 500,
    rotate: source.rotate || 750,
    timeout: source.timeout || 5e3,
    random: source.random === true,
    index: source.index || 0,
    dataAfterTimeout: source.dataAfterTimeout !== false
  };
  return result;
}
const configStorage = /* @__PURE__ */ Object.create(null);
const fallBackAPISources = [
  "https://api.simplesvg.com",
  "https://api.unisvg.com"
];
const fallBackAPI = [];
while (fallBackAPISources.length > 0) {
  if (fallBackAPISources.length === 1) {
    fallBackAPI.push(fallBackAPISources.shift());
  } else {
    if (Math.random() > 0.5) {
      fallBackAPI.push(fallBackAPISources.shift());
    } else {
      fallBackAPI.push(fallBackAPISources.pop());
    }
  }
}
configStorage[""] = createAPIConfig({
  resources: ["https://api.iconify.design"].concat(fallBackAPI)
});
function addAPIProvider(provider, customConfig) {
  const config = createAPIConfig(customConfig);
  if (config === null) {
    return false;
  }
  configStorage[provider] = config;
  return true;
}
function getAPIConfig(provider) {
  return configStorage[provider];
}
const detectFetch = () => {
  let callback;
  try {
    callback = fetch;
    if (typeof callback === "function") {
      return callback;
    }
  } catch (err) {
  }
};
let fetchModule = detectFetch();
function calculateMaxLength(provider, prefix) {
  const config = getAPIConfig(provider);
  if (!config) {
    return 0;
  }
  let result;
  if (!config.maxURL) {
    result = 0;
  } else {
    let maxHostLength = 0;
    config.resources.forEach((item) => {
      const host = item;
      maxHostLength = Math.max(maxHostLength, host.length);
    });
    const url = prefix + ".json?icons=";
    result = config.maxURL - maxHostLength - config.path.length - url.length;
  }
  return result;
}
function shouldAbort(status) {
  return status === 404;
}
const prepare = (provider, prefix, icons) => {
  const results = [];
  const maxLength = calculateMaxLength(provider, prefix);
  const type = "icons";
  let item = {
    type,
    provider,
    prefix,
    icons: []
  };
  let length = 0;
  icons.forEach((name, index) => {
    length += name.length + 1;
    if (length >= maxLength && index > 0) {
      results.push(item);
      item = {
        type,
        provider,
        prefix,
        icons: []
      };
      length = name.length;
    }
    item.icons.push(name);
  });
  results.push(item);
  return results;
};
function getPath(provider) {
  if (typeof provider === "string") {
    const config = getAPIConfig(provider);
    if (config) {
      return config.path;
    }
  }
  return "/";
}
const send = (host, params, callback) => {
  if (!fetchModule) {
    callback("abort", 424);
    return;
  }
  let path = getPath(params.provider);
  switch (params.type) {
    case "icons": {
      const prefix = params.prefix;
      const icons = params.icons;
      const iconsList = icons.join(",");
      const urlParams = new URLSearchParams({
        icons: iconsList
      });
      path += prefix + ".json?" + urlParams.toString();
      break;
    }
    case "custom": {
      const uri = params.uri;
      path += uri.slice(0, 1) === "/" ? uri.slice(1) : uri;
      break;
    }
    default:
      callback("abort", 400);
      return;
  }
  let defaultError = 503;
  fetchModule(host + path).then((response) => {
    const status = response.status;
    if (status !== 200) {
      setTimeout(() => {
        callback(shouldAbort(status) ? "abort" : "next", status);
      });
      return;
    }
    defaultError = 501;
    return response.json();
  }).then((data) => {
    if (typeof data !== "object" || data === null) {
      setTimeout(() => {
        callback("next", defaultError);
      });
      return;
    }
    setTimeout(() => {
      callback("success", data);
    });
  }).catch(() => {
    callback("next", defaultError);
  });
};
const fetchAPIModule = {
  prepare,
  send
};
function sortIcons(icons) {
  const result = {
    loaded: [],
    missing: [],
    pending: []
  };
  const storage2 = /* @__PURE__ */ Object.create(null);
  icons.sort((a, b) => {
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    if (a.prefix !== b.prefix) {
      return a.prefix.localeCompare(b.prefix);
    }
    return a.name.localeCompare(b.name);
  });
  let lastIcon = {
    provider: "",
    prefix: "",
    name: ""
  };
  icons.forEach((icon) => {
    if (lastIcon.name === icon.name && lastIcon.prefix === icon.prefix && lastIcon.provider === icon.provider) {
      return;
    }
    lastIcon = icon;
    const provider = icon.provider;
    const prefix = icon.prefix;
    const name = icon.name;
    const providerStorage = storage2[provider] || (storage2[provider] = /* @__PURE__ */ Object.create(null));
    const localStorage = providerStorage[prefix] || (providerStorage[prefix] = getStorage(provider, prefix));
    let list;
    if (name in localStorage.icons) {
      list = result.loaded;
    } else if (prefix === "" || localStorage.missing.has(name)) {
      list = result.missing;
    } else {
      list = result.pending;
    }
    const item = {
      provider,
      prefix,
      name
    };
    list.push(item);
  });
  return result;
}
function removeCallback(storages, id) {
  storages.forEach((storage2) => {
    const items = storage2.loaderCallbacks;
    if (items) {
      storage2.loaderCallbacks = items.filter((row) => row.id !== id);
    }
  });
}
function updateCallbacks(storage2) {
  if (!storage2.pendingCallbacksFlag) {
    storage2.pendingCallbacksFlag = true;
    setTimeout(() => {
      storage2.pendingCallbacksFlag = false;
      const items = storage2.loaderCallbacks ? storage2.loaderCallbacks.slice(0) : [];
      if (!items.length) {
        return;
      }
      let hasPending = false;
      const provider = storage2.provider;
      const prefix = storage2.prefix;
      items.forEach((item) => {
        const icons = item.icons;
        const oldLength = icons.pending.length;
        icons.pending = icons.pending.filter((icon) => {
          if (icon.prefix !== prefix) {
            return true;
          }
          const name = icon.name;
          if (storage2.icons[name]) {
            icons.loaded.push({
              provider,
              prefix,
              name
            });
          } else if (storage2.missing.has(name)) {
            icons.missing.push({
              provider,
              prefix,
              name
            });
          } else {
            hasPending = true;
            return true;
          }
          return false;
        });
        if (icons.pending.length !== oldLength) {
          if (!hasPending) {
            removeCallback([storage2], item.id);
          }
          item.callback(icons.loaded.slice(0), icons.missing.slice(0), icons.pending.slice(0), item.abort);
        }
      });
    });
  }
}
let idCounter = 0;
function storeCallback(callback, icons, pendingSources) {
  const id = idCounter++;
  const abort = removeCallback.bind(null, pendingSources, id);
  if (!icons.pending.length) {
    return abort;
  }
  const item = {
    id,
    icons,
    callback,
    abort
  };
  pendingSources.forEach((storage2) => {
    (storage2.loaderCallbacks || (storage2.loaderCallbacks = [])).push(item);
  });
  return abort;
}
function listToIcons(list, validate = true, simpleNames2 = false) {
  const result = [];
  list.forEach((item) => {
    const icon = typeof item === "string" ? stringToIcon(item, validate, simpleNames2) : item;
    if (icon) {
      result.push(icon);
    }
  });
  return result;
}
var defaultConfig = {
  resources: [],
  index: 0,
  timeout: 2e3,
  rotate: 750,
  random: false,
  dataAfterTimeout: false
};
function sendQuery(config, payload, query, done) {
  const resourcesCount = config.resources.length;
  const startIndex = config.random ? Math.floor(Math.random() * resourcesCount) : config.index;
  let resources;
  if (config.random) {
    let list = config.resources.slice(0);
    resources = [];
    while (list.length > 1) {
      const nextIndex = Math.floor(Math.random() * list.length);
      resources.push(list[nextIndex]);
      list = list.slice(0, nextIndex).concat(list.slice(nextIndex + 1));
    }
    resources = resources.concat(list);
  } else {
    resources = config.resources.slice(startIndex).concat(config.resources.slice(0, startIndex));
  }
  const startTime = Date.now();
  let status = "pending";
  let queriesSent = 0;
  let lastError;
  let timer = null;
  let queue = [];
  let doneCallbacks = [];
  if (typeof done === "function") {
    doneCallbacks.push(done);
  }
  function resetTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  function abort() {
    if (status === "pending") {
      status = "aborted";
    }
    resetTimer();
    queue.forEach((item) => {
      if (item.status === "pending") {
        item.status = "aborted";
      }
    });
    queue = [];
  }
  function subscribe(callback, overwrite) {
    if (overwrite) {
      doneCallbacks = [];
    }
    if (typeof callback === "function") {
      doneCallbacks.push(callback);
    }
  }
  function getQueryStatus() {
    return {
      startTime,
      payload,
      status,
      queriesSent,
      queriesPending: queue.length,
      subscribe,
      abort
    };
  }
  function failQuery() {
    status = "failed";
    doneCallbacks.forEach((callback) => {
      callback(void 0, lastError);
    });
  }
  function clearQueue() {
    queue.forEach((item) => {
      if (item.status === "pending") {
        item.status = "aborted";
      }
    });
    queue = [];
  }
  function moduleResponse(item, response, data) {
    const isError = response !== "success";
    queue = queue.filter((queued) => queued !== item);
    switch (status) {
      case "pending":
        break;
      case "failed":
        if (isError || !config.dataAfterTimeout) {
          return;
        }
        break;
      default:
        return;
    }
    if (response === "abort") {
      lastError = data;
      failQuery();
      return;
    }
    if (isError) {
      lastError = data;
      if (!queue.length) {
        if (!resources.length) {
          failQuery();
        } else {
          execNext();
        }
      }
      return;
    }
    resetTimer();
    clearQueue();
    if (!config.random) {
      const index = config.resources.indexOf(item.resource);
      if (index !== -1 && index !== config.index) {
        config.index = index;
      }
    }
    status = "completed";
    doneCallbacks.forEach((callback) => {
      callback(data);
    });
  }
  function execNext() {
    if (status !== "pending") {
      return;
    }
    resetTimer();
    const resource = resources.shift();
    if (resource === void 0) {
      if (queue.length) {
        timer = setTimeout(() => {
          resetTimer();
          if (status === "pending") {
            clearQueue();
            failQuery();
          }
        }, config.timeout);
        return;
      }
      failQuery();
      return;
    }
    const item = {
      status: "pending",
      resource,
      callback: (status2, data) => {
        moduleResponse(item, status2, data);
      }
    };
    queue.push(item);
    queriesSent++;
    timer = setTimeout(execNext, config.rotate);
    query(resource, payload, item.callback);
  }
  setTimeout(execNext);
  return getQueryStatus;
}
function initRedundancy(cfg) {
  const config = {
    ...defaultConfig,
    ...cfg
  };
  let queries = [];
  function cleanup() {
    queries = queries.filter((item) => item().status === "pending");
  }
  function query(payload, queryCallback, doneCallback) {
    const query2 = sendQuery(config, payload, queryCallback, (data, error) => {
      cleanup();
      if (doneCallback) {
        doneCallback(data, error);
      }
    });
    queries.push(query2);
    return query2;
  }
  function find(callback) {
    return queries.find((value) => {
      return callback(value);
    }) || null;
  }
  const instance = {
    query,
    find,
    setIndex: (index) => {
      config.index = index;
    },
    getIndex: () => config.index,
    cleanup
  };
  return instance;
}
function emptyCallback$1() {
}
const redundancyCache = /* @__PURE__ */ Object.create(null);
function getRedundancyCache(provider) {
  if (!redundancyCache[provider]) {
    const config = getAPIConfig(provider);
    if (!config) {
      return;
    }
    const redundancy = initRedundancy(config);
    const cachedReundancy = {
      config,
      redundancy
    };
    redundancyCache[provider] = cachedReundancy;
  }
  return redundancyCache[provider];
}
function sendAPIQuery(target, query, callback) {
  let redundancy;
  let send2;
  if (typeof target === "string") {
    const api = getAPIModule(target);
    if (!api) {
      callback(void 0, 424);
      return emptyCallback$1;
    }
    send2 = api.send;
    const cached = getRedundancyCache(target);
    if (cached) {
      redundancy = cached.redundancy;
    }
  } else {
    const config = createAPIConfig(target);
    if (config) {
      redundancy = initRedundancy(config);
      const moduleKey = target.resources ? target.resources[0] : "";
      const api = getAPIModule(moduleKey);
      if (api) {
        send2 = api.send;
      }
    }
  }
  if (!redundancy || !send2) {
    callback(void 0, 424);
    return emptyCallback$1;
  }
  return redundancy.query(query, send2, callback)().abort;
}
const browserCacheVersion = "iconify2";
const browserCachePrefix = "iconify";
const browserCacheCountKey = browserCachePrefix + "-count";
const browserCacheVersionKey = browserCachePrefix + "-version";
const browserStorageHour = 36e5;
const browserStorageCacheExpiration = 168;
function getStoredItem(func, key) {
  try {
    return func.getItem(key);
  } catch (err) {
  }
}
function setStoredItem(func, key, value) {
  try {
    func.setItem(key, value);
    return true;
  } catch (err) {
  }
}
function removeStoredItem(func, key) {
  try {
    func.removeItem(key);
  } catch (err) {
  }
}
function setBrowserStorageItemsCount(storage2, value) {
  return setStoredItem(storage2, browserCacheCountKey, value.toString());
}
function getBrowserStorageItemsCount(storage2) {
  return parseInt(getStoredItem(storage2, browserCacheCountKey)) || 0;
}
const browserStorageConfig = {
  local: true,
  session: true
};
const browserStorageEmptyItems = {
  local: /* @__PURE__ */ new Set(),
  session: /* @__PURE__ */ new Set()
};
let browserStorageStatus = false;
function setBrowserStorageStatus(status) {
  browserStorageStatus = status;
}
let _window = typeof window === "undefined" ? {} : window;
function getBrowserStorage(key) {
  const attr = key + "Storage";
  try {
    if (_window && _window[attr] && typeof _window[attr].length === "number") {
      return _window[attr];
    }
  } catch (err) {
  }
  browserStorageConfig[key] = false;
}
function iterateBrowserStorage(key, callback) {
  const func = getBrowserStorage(key);
  if (!func) {
    return;
  }
  const version = getStoredItem(func, browserCacheVersionKey);
  if (version !== browserCacheVersion) {
    if (version) {
      const total2 = getBrowserStorageItemsCount(func);
      for (let i = 0; i < total2; i++) {
        removeStoredItem(func, browserCachePrefix + i.toString());
      }
    }
    setStoredItem(func, browserCacheVersionKey, browserCacheVersion);
    setBrowserStorageItemsCount(func, 0);
    return;
  }
  const minTime = Math.floor(Date.now() / browserStorageHour) - browserStorageCacheExpiration;
  const parseItem = (index) => {
    const name = browserCachePrefix + index.toString();
    const item = getStoredItem(func, name);
    if (typeof item !== "string") {
      return;
    }
    try {
      const data = JSON.parse(item);
      if (typeof data === "object" && typeof data.cached === "number" && data.cached > minTime && typeof data.provider === "string" && typeof data.data === "object" && typeof data.data.prefix === "string" && callback(data, index)) {
        return true;
      }
    } catch (err) {
    }
    removeStoredItem(func, name);
  };
  let total = getBrowserStorageItemsCount(func);
  for (let i = total - 1; i >= 0; i--) {
    if (!parseItem(i)) {
      if (i === total - 1) {
        total--;
        setBrowserStorageItemsCount(func, total);
      } else {
        browserStorageEmptyItems[key].add(i);
      }
    }
  }
}
function initBrowserStorage() {
  if (browserStorageStatus) {
    return;
  }
  setBrowserStorageStatus(true);
  for (const key in browserStorageConfig) {
    iterateBrowserStorage(key, (item) => {
      const iconSet = item.data;
      const provider = item.provider;
      const prefix = iconSet.prefix;
      const storage2 = getStorage(provider, prefix);
      if (!addIconSet(storage2, iconSet).length) {
        return false;
      }
      const lastModified = iconSet.lastModified || -1;
      storage2.lastModifiedCached = storage2.lastModifiedCached ? Math.min(storage2.lastModifiedCached, lastModified) : lastModified;
      return true;
    });
  }
}
function updateLastModified(storage2, lastModified) {
  const lastValue = storage2.lastModifiedCached;
  if (lastValue && lastValue >= lastModified) {
    return lastValue === lastModified;
  }
  storage2.lastModifiedCached = lastModified;
  if (lastValue) {
    for (const key in browserStorageConfig) {
      iterateBrowserStorage(key, (item) => {
        const iconSet = item.data;
        return item.provider !== storage2.provider || iconSet.prefix !== storage2.prefix || iconSet.lastModified === lastModified;
      });
    }
  }
  return true;
}
function storeInBrowserStorage(storage2, data) {
  if (!browserStorageStatus) {
    initBrowserStorage();
  }
  function store(key) {
    let func;
    if (!browserStorageConfig[key] || !(func = getBrowserStorage(key))) {
      return;
    }
    const set = browserStorageEmptyItems[key];
    let index;
    if (set.size) {
      set.delete(index = Array.from(set).shift());
    } else {
      index = getBrowserStorageItemsCount(func);
      if (!setBrowserStorageItemsCount(func, index + 1)) {
        return;
      }
    }
    const item = {
      cached: Math.floor(Date.now() / browserStorageHour),
      provider: storage2.provider,
      data
    };
    return setStoredItem(func, browserCachePrefix + index.toString(), JSON.stringify(item));
  }
  if (data.lastModified && !updateLastModified(storage2, data.lastModified)) {
    return;
  }
  if (!Object.keys(data.icons).length) {
    return;
  }
  if (data.not_found) {
    data = Object.assign({}, data);
    delete data.not_found;
  }
  if (!store("local")) {
    store("session");
  }
}
function emptyCallback() {
}
function loadedNewIcons(storage2) {
  if (!storage2.iconsLoaderFlag) {
    storage2.iconsLoaderFlag = true;
    setTimeout(() => {
      storage2.iconsLoaderFlag = false;
      updateCallbacks(storage2);
    });
  }
}
function loadNewIcons(storage2, icons) {
  if (!storage2.iconsToLoad) {
    storage2.iconsToLoad = icons;
  } else {
    storage2.iconsToLoad = storage2.iconsToLoad.concat(icons).sort();
  }
  if (!storage2.iconsQueueFlag) {
    storage2.iconsQueueFlag = true;
    setTimeout(() => {
      storage2.iconsQueueFlag = false;
      const {provider, prefix} = storage2;
      const icons2 = storage2.iconsToLoad;
      delete storage2.iconsToLoad;
      let api;
      if (!icons2 || !(api = getAPIModule(provider))) {
        return;
      }
      const params = api.prepare(provider, prefix, icons2);
      params.forEach((item) => {
        sendAPIQuery(provider, item, (data, error) => {
          if (typeof data !== "object") {
            if (error !== 404) {
              return;
            }
            item.icons.forEach((name) => {
              storage2.missing.add(name);
            });
          } else {
            try {
              const parsed = addIconSet(storage2, data);
              if (!parsed.length) {
                return;
              }
              const pending = storage2.pendingIcons;
              if (pending) {
                parsed.forEach((name) => {
                  pending.delete(name);
                });
              }
              storeInBrowserStorage(storage2, data);
            } catch (err) {
              console.error(err);
            }
          }
          loadedNewIcons(storage2);
        });
      });
    });
  }
}
const loadIcons = (icons, callback) => {
  const cleanedIcons = listToIcons(icons, true, allowSimpleNames());
  const sortedIcons = sortIcons(cleanedIcons);
  if (!sortedIcons.pending.length) {
    let callCallback = true;
    if (callback) {
      setTimeout(() => {
        if (callCallback) {
          callback(sortedIcons.loaded, sortedIcons.missing, sortedIcons.pending, emptyCallback);
        }
      });
    }
    return () => {
      callCallback = false;
    };
  }
  const newIcons = /* @__PURE__ */ Object.create(null);
  const sources = [];
  let lastProvider, lastPrefix;
  sortedIcons.pending.forEach((icon) => {
    const {provider, prefix} = icon;
    if (prefix === lastPrefix && provider === lastProvider) {
      return;
    }
    lastProvider = provider;
    lastPrefix = prefix;
    sources.push(getStorage(provider, prefix));
    const providerNewIcons = newIcons[provider] || (newIcons[provider] = /* @__PURE__ */ Object.create(null));
    if (!providerNewIcons[prefix]) {
      providerNewIcons[prefix] = [];
    }
  });
  sortedIcons.pending.forEach((icon) => {
    const {provider, prefix, name} = icon;
    const storage2 = getStorage(provider, prefix);
    const pendingQueue = storage2.pendingIcons || (storage2.pendingIcons = /* @__PURE__ */ new Set());
    if (!pendingQueue.has(name)) {
      pendingQueue.add(name);
      newIcons[provider][prefix].push(name);
    }
  });
  sources.forEach((storage2) => {
    const {provider, prefix} = storage2;
    if (newIcons[provider][prefix].length) {
      loadNewIcons(storage2, newIcons[provider][prefix]);
    }
  });
  return callback ? storeCallback(callback, sortedIcons, sources) : emptyCallback;
};
function mergeCustomisations(defaults, item) {
  const result = {
    ...defaults
  };
  for (const key in item) {
    const value = item[key];
    const valueType = typeof value;
    if (key in defaultIconSizeCustomisations) {
      if (value === null || value && (valueType === "string" || valueType === "number")) {
        result[key] = value;
      }
    } else if (valueType === typeof result[key]) {
      result[key] = key === "rotate" ? value % 4 : value;
    }
  }
  return result;
}
const separator = /[\s,]+/;
function flipFromString(custom, flip) {
  flip.split(separator).forEach((str) => {
    const value = str.trim();
    switch (value) {
      case "horizontal":
        custom.hFlip = true;
        break;
      case "vertical":
        custom.vFlip = true;
        break;
    }
  });
}
function rotateFromString(value, defaultValue = 0) {
  const units = value.replace(/^-?[0-9.]*/, "");
  function cleanup(value2) {
    while (value2 < 0) {
      value2 += 4;
    }
    return value2 % 4;
  }
  if (units === "") {
    const num = parseInt(value);
    return isNaN(num) ? 0 : cleanup(num);
  } else if (units !== value) {
    let split = 0;
    switch (units) {
      case "%":
        split = 25;
        break;
      case "deg":
        split = 90;
    }
    if (split) {
      let num = parseFloat(value.slice(0, value.length - units.length));
      if (isNaN(num)) {
        return 0;
      }
      num = num / split;
      return num % 1 === 0 ? cleanup(num) : 0;
    }
  }
  return defaultValue;
}
function iconToHTML(body, attributes) {
  let renderAttribsHTML = body.indexOf("xlink:") === -1 ? "" : ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  for (const attr in attributes) {
    renderAttribsHTML += " " + attr + '="' + attributes[attr] + '"';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg"' + renderAttribsHTML + ">" + body + "</svg>";
}
function encodeSVGforURL(svg) {
  return svg.replace(/"/g, "'").replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\s+/g, " ");
}
function svgToURL(svg) {
  return 'url("data:image/svg+xml,' + encodeSVGforURL(svg) + '")';
}
const defaultExtendedIconCustomisations = {
  ...defaultIconCustomisations,
  inline: false
};
const svgDefaults = {
  xmlns: "http://www.w3.org/2000/svg",
  "xmlns:xlink": "http://www.w3.org/1999/xlink",
  "aria-hidden": true,
  role: "img"
};
const commonProps = {
  display: "inline-block"
};
const monotoneProps = {
  "background-color": "currentColor"
};
const coloredProps = {
  "background-color": "transparent"
};
const propsToAdd = {
  image: "var(--svg)",
  repeat: "no-repeat",
  size: "100% 100%"
};
const propsToAddTo = {
  "-webkit-mask": monotoneProps,
  mask: monotoneProps,
  background: coloredProps
};
for (const prefix in propsToAddTo) {
  const list = propsToAddTo[prefix];
  for (const prop in propsToAdd) {
    list[prefix + "-" + prop] = propsToAdd[prop];
  }
}
function fixSize(value) {
  return value + (value.match(/^[-0-9.]+$/) ? "px" : "");
}
function render(icon, props) {
  const customisations = mergeCustomisations(defaultExtendedIconCustomisations, props);
  const mode = props.mode || "svg";
  const componentProps = mode === "svg" ? {...svgDefaults} : {};
  let style = typeof props.style === "string" ? props.style : "";
  for (let key in props) {
    const value = props[key];
    if (value === void 0) {
      continue;
    }
    switch (key) {
      case "icon":
      case "style":
      case "onLoad":
      case "mode":
        break;
      case "inline":
      case "hFlip":
      case "vFlip":
        customisations[key] = value === true || value === "true" || value === 1;
        break;
      case "flip":
        if (typeof value === "string") {
          flipFromString(customisations, value);
        }
        break;
      case "color":
        style = style + (style.length > 0 && style.trim().slice(-1) !== ";" ? ";" : "") + "color: " + value + "; ";
        break;
      case "rotate":
        if (typeof value === "string") {
          customisations[key] = rotateFromString(value);
        } else if (typeof value === "number") {
          customisations[key] = value;
        }
        break;
      case "ariaHidden":
      case "aria-hidden":
        if (value !== true && value !== "true") {
          delete componentProps["aria-hidden"];
        }
        break;
      default:
        if (key.slice(0, 3) === "on:") {
          break;
        }
        if (defaultExtendedIconCustomisations[key] === void 0) {
          componentProps[key] = value;
        }
    }
  }
  const item = iconToSVG(icon, customisations);
  const renderAttribs = item.attributes;
  if (customisations.inline) {
    style = "vertical-align: -0.125em; " + style;
  }
  if (mode === "svg") {
    Object.assign(componentProps, renderAttribs);
    if (style !== "") {
      componentProps.style = style;
    }
    let localCounter = 0;
    let id = props.id;
    if (typeof id === "string") {
      id = id.replace(/-/g, "_");
    }
    return {
      svg: true,
      attributes: componentProps,
      body: replaceIDs(item.body, id ? () => id + "ID" + localCounter++ : "iconifySvelte")
    };
  }
  const {body, width, height} = icon;
  const useMask = mode === "mask" || (mode === "bg" ? false : body.indexOf("currentColor") !== -1);
  const html = iconToHTML(body, {
    ...renderAttribs,
    width: width + "",
    height: height + ""
  });
  const url = svgToURL(html);
  const styles = {
    "--svg": url,
    width: fixSize(renderAttribs.width),
    height: fixSize(renderAttribs.height),
    ...commonProps,
    ...useMask ? monotoneProps : coloredProps
  };
  let customStyle = "";
  for (const key in styles) {
    customStyle += key + ": " + styles[key] + ";";
  }
  componentProps.style = customStyle + style;
  return {
    svg: false,
    attributes: componentProps
  };
}
allowSimpleNames(true);
setAPIModule("", fetchAPIModule);
if (typeof document !== "undefined" && typeof window !== "undefined") {
  initBrowserStorage();
  const _window2 = window;
  if (_window2.IconifyPreload !== void 0) {
    const preload = _window2.IconifyPreload;
    const err = "Invalid IconifyPreload syntax.";
    if (typeof preload === "object" && preload !== null) {
      (preload instanceof Array ? preload : [preload]).forEach((item) => {
        try {
          if (typeof item !== "object" || item === null || item instanceof Array || typeof item.icons !== "object" || typeof item.prefix !== "string" || !addCollection(item)) {
            console.error(err);
          }
        } catch (e) {
          console.error(err);
        }
      });
    }
  }
  if (_window2.IconifyProviders !== void 0) {
    const providers = _window2.IconifyProviders;
    if (typeof providers === "object" && providers !== null) {
      for (let key in providers) {
        const err = "IconifyProviders[" + key + "] is invalid.";
        try {
          const value = providers[key];
          if (typeof value !== "object" || !value || value.resources === void 0) {
            continue;
          }
          if (!addAPIProvider(key, value)) {
            console.error(err);
          }
        } catch (e) {
          console.error(err);
        }
      }
    }
  }
}
function checkIconState(icon, state, mounted, callback, onload) {
  function abortLoading() {
    if (state.loading) {
      state.loading.abort();
      state.loading = null;
    }
  }
  if (typeof icon === "object" && icon !== null && typeof icon.body === "string") {
    state.name = "";
    abortLoading();
    return {data: {...defaultIconProps, ...icon}};
  }
  let iconName;
  if (typeof icon !== "string" || (iconName = stringToIcon(icon, false, true)) === null) {
    abortLoading();
    return null;
  }
  const data = getIconData(iconName);
  if (!data) {
    if (mounted && (!state.loading || state.loading.name !== icon)) {
      abortLoading();
      state.name = "";
      state.loading = {
        name: icon,
        abort: loadIcons([iconName], callback)
      };
    }
    return null;
  }
  abortLoading();
  if (state.name !== icon) {
    state.name = icon;
    if (onload && !state.destroyed) {
      onload(icon);
    }
  }
  const classes = ["iconify"];
  if (iconName.prefix !== "") {
    classes.push("iconify--" + iconName.prefix);
  }
  if (iconName.provider !== "") {
    classes.push("iconify--" + iconName.provider);
  }
  return {data, classes};
}
function generateIcon(icon, props) {
  return icon ? render({
    ...defaultIconProps,
    ...icon
  }, props) : null;
}
var checkIconState_1 = checkIconState;
var generateIcon_1 = generateIcon;

/* generated by Svelte v3.50.1 */

function create_if_block(ctx) {
	let if_block_anchor;

	function select_block_type(ctx, dirty) {
		if (/*data*/ ctx[0].svg) return create_if_block_1;
		return create_else_block;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			if_block.c();
			if_block_anchor = empty();
		},
		l(nodes) {
			if_block.l(nodes);
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if_block.m(target, anchor);
			insert_hydration(target, if_block_anchor, anchor);
		},
		p(ctx, dirty) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},
		d(detaching) {
			if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

// (113:1) {:else}
function create_else_block(ctx) {
	let span;
	let span_levels = [/*data*/ ctx[0].attributes];
	let span_data = {};

	for (let i = 0; i < span_levels.length; i += 1) {
		span_data = assign(span_data, span_levels[i]);
	}

	return {
		c() {
			span = element("span");
			this.h();
		},
		l(nodes) {
			span = claim_element(nodes, "SPAN", {});
			children(span).forEach(detach);
			this.h();
		},
		h() {
			set_attributes(span, span_data);
		},
		m(target, anchor) {
			insert_hydration(target, span, anchor);
		},
		p(ctx, dirty) {
			set_attributes(span, span_data = get_spread_update(span_levels, [dirty & /*data*/ 1 && /*data*/ ctx[0].attributes]));
		},
		d(detaching) {
			if (detaching) detach(span);
		}
	};
}

// (109:1) {#if data.svg}
function create_if_block_1(ctx) {
	let svg;
	let raw_value = /*data*/ ctx[0].body + "";
	let svg_levels = [/*data*/ ctx[0].attributes];
	let svg_data = {};

	for (let i = 0; i < svg_levels.length; i += 1) {
		svg_data = assign(svg_data, svg_levels[i]);
	}

	return {
		c() {
			svg = svg_element("svg");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {});
			var svg_nodes = children(svg);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			set_svg_attributes(svg, svg_data);
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			svg.innerHTML = raw_value;
		},
		p(ctx, dirty) {
			if (dirty & /*data*/ 1 && raw_value !== (raw_value = /*data*/ ctx[0].body + "")) svg.innerHTML = raw_value;			set_svg_attributes(svg, svg_data = get_spread_update(svg_levels, [dirty & /*data*/ 1 && /*data*/ ctx[0].attributes]));
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

function create_fragment(ctx) {
	let if_block_anchor;
	let if_block = /*data*/ ctx[0] && create_if_block(ctx);

	return {
		c() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		l(nodes) {
			if (if_block) if_block.l(nodes);
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_hydration(target, if_block_anchor, anchor);
		},
		p(ctx, [dirty]) {
			if (/*data*/ ctx[0]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const state = {
		// Last icon name
		name: '',
		// Loading status
		loading: null,
		// Destroyed status
		destroyed: false
	};

	// Mounted status
	let mounted = false;

	// Callback counter
	let counter = 0;

	// Generated data
	let data;

	const onLoad = icon => {
		// Legacy onLoad property
		if (typeof $$props.onLoad === 'function') {
			$$props.onLoad(icon);
		}

		// on:load event
		const dispatch = createEventDispatcher();

		dispatch('load', { icon });
	};

	// Increase counter when loaded to force re-calculation of data
	function loaded() {
		$$invalidate(3, counter++, counter);
	}

	// Force re-render
	onMount(() => {
		$$invalidate(2, mounted = true);
	});

	// Abort loading when component is destroyed
	onDestroy(() => {
		$$invalidate(1, state.destroyed = true, state);

		if (state.loading) {
			state.loading.abort();
			$$invalidate(1, state.loading = null, state);
		}
	});

	$$self.$$set = $$new_props => {
		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
	};

	$$self.$$.update = () => {
		 {
			const iconData = checkIconState_1($$props.icon, state, mounted, loaded, onLoad);
			$$invalidate(0, data = iconData ? generateIcon_1(iconData.data, $$props) : null);

			if (data && iconData.classes) {
				// Add classes
				$$invalidate(
					0,
					data.attributes['class'] = (typeof $$props['class'] === 'string'
					? $$props['class'] + ' '
					: '') + iconData.classes.join(' '),
					data
				);
			}
		}
	};

	$$props = exclude_internal_props($$props);
	return [data, state, mounted, counter];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, {});
	}
}

/* generated by Svelte v3.50.1 */

function create_fragment$1(ctx) {
	let footer;
	let div2;
	let div1;
	let h40;
	let t0;
	let t1;
	let h30;
	let t2;
	let t3;
	let ul0;
	let li0;
	let a0;
	let t4;
	let t5;
	let li1;
	let a1;
	let t6;
	let t7;
	let li2;
	let a2;
	let t8;
	let t9;
	let li3;
	let a3;
	let t10;
	let t11;
	let li4;
	let a4;
	let t12;
	let t13;
	let li5;
	let a5;
	let t14;
	let t15;
	let li6;
	let a6;
	let t16;
	let t17;
	let li7;
	let a7;
	let t18;
	let t19;
	let li8;
	let a8;
	let t20;
	let t21;
	let h31;
	let t22;
	let t23;
	let ul1;
	let li9;
	let a9;
	let t24;
	let t25;
	let li10;
	let a10;
	let t26;
	let t27;
	let li11;
	let a11;
	let t28;
	let t29;
	let li12;
	let a12;
	let t30;
	let t31;
	let li13;
	let a13;
	let t32;
	let t33;
	let li14;
	let a14;
	let t34;
	let t35;
	let li15;
	let a15;
	let t36;
	let t37;
	let li16;
	let a16;
	let t38;
	let t39;
	let li17;
	let a17;
	let t40;
	let t41;
	let h32;
	let t42;
	let t43;
	let ul2;
	let li18;
	let a18;
	let t44;
	let t45;
	let li19;
	let a19;
	let t46;
	let t47;
	let li20;
	let a20;
	let t48;
	let t49;
	let li21;
	let a21;
	let t50;
	let t51;
	let li22;
	let a22;
	let t52;
	let t53;
	let li23;
	let a23;
	let t54;
	let t55;
	let li24;
	let a24;
	let t56;
	let t57;
	let li25;
	let a25;
	let t58;
	let t59;
	let li26;
	let a26;
	let t60;
	let t61;
	let br;
	let t62;
	let h41;
	let t63;
	let t64;
	let div0;
	let a27;
	let icon0;
	let t65;
	let a28;
	let icon1;
	let t66;
	let div3;
	let t67;
	let t68;
	let t69;
	let t70;
	let t71;
	let section;
	let div4;
	let button;
	let icon2;
	let t72;
	let select;
	let option0;
	let t73;
	let option1;
	let t74;
	let option1_value_value;
	let option2;
	let t75;
	let option2_value_value;
	let t76;
	let div5;
	let a29;
	let icon3;
	let current;
	let mounted;
	let dispose;

	icon0 = new Component({
			props: {
				height: "28",
				icon: "fa6-brands:square-facebook"
			}
		});

	icon1 = new Component({
			props: { height: "28", icon: "fa6-brands:youtube" }
		});

	icon2 = new Component({
			props: {
				height: "64",
				icon: "fluent:phone-28-filled"
			}
		});

	icon3 = new Component({
			props: {
				height: "64",
				icon: "fluent:mail-24-filled"
			}
		});

	return {
		c() {
			footer = element("footer");
			div2 = element("div");
			div1 = element("div");
			h40 = element("h4");
			t0 = text("Περιοχές Εξυπηρέτησης");
			t1 = space();
			h30 = element("h3");
			t2 = text("Νότια Προάστια");
			t3 = space();
			ul0 = element("ul");
			li0 = element("li");
			a0 = element("a");
			t4 = text("Άλιμος");
			t5 = space();
			li1 = element("li");
			a1 = element("a");
			t6 = text("Αργυρούπολη");
			t7 = space();
			li2 = element("li");
			a2 = element("a");
			t8 = text("Βάρη");
			t9 = space();
			li3 = element("li");
			a3 = element("a");
			t10 = text("Βάρκιζα");
			t11 = space();
			li4 = element("li");
			a4 = element("a");
			t12 = text("Βούλα");
			t13 = space();
			li5 = element("li");
			a5 = element("a");
			t14 = text("Βουλιαγμένη");
			t15 = space();
			li6 = element("li");
			a6 = element("a");
			t16 = text("Γλυφάδα");
			t17 = space();
			li7 = element("li");
			a7 = element("a");
			t18 = text("Ελληνικό");
			t19 = space();
			li8 = element("li");
			a8 = element("a");
			t20 = text("Ηλιούπολη");
			t21 = space();
			h31 = element("h3");
			t22 = text("Κεντρικά");
			t23 = space();
			ul1 = element("ul");
			li9 = element("li");
			a9 = element("a");
			t24 = text("Άγιος Δημήτριος");
			t25 = space();
			li10 = element("li");
			a10 = element("a");
			t26 = text("Δάφνη");
			t27 = space();
			li11 = element("li");
			a11 = element("a");
			t28 = text("Καλλιθέα");
			t29 = space();
			li12 = element("li");
			a12 = element("a");
			t30 = text("Κουκάκι");
			t31 = space();
			li13 = element("li");
			a13 = element("a");
			t32 = text("Νέα Σμύρνη");
			t33 = space();
			li14 = element("li");
			a14 = element("a");
			t34 = text("Νέος Κόσμος");
			t35 = space();
			li15 = element("li");
			a15 = element("a");
			t36 = text("Παλαιό Φάληρο");
			t37 = space();
			li16 = element("li");
			a16 = element("a");
			t38 = text("Υμηττός");
			t39 = space();
			li17 = element("li");
			a17 = element("a");
			t40 = text("Καρέας");
			t41 = space();
			h32 = element("h3");
			t42 = text("Δυτικά Προάστια");
			t43 = space();
			ul2 = element("ul");
			li18 = element("li");
			a18 = element("a");
			t44 = text("Νίκαια");
			t45 = space();
			li19 = element("li");
			a19 = element("a");
			t46 = text("Νέο Φάληρο");
			t47 = space();
			li20 = element("li");
			a20 = element("a");
			t48 = text("Κερατσίνι");
			t49 = space();
			li21 = element("li");
			a21 = element("a");
			t50 = text("Αγία Βαρβάρα");
			t51 = space();
			li22 = element("li");
			a22 = element("a");
			t52 = text("Αιγάλεω");
			t53 = space();
			li23 = element("li");
			a23 = element("a");
			t54 = text("Βοτανικός");
			t55 = space();
			li24 = element("li");
			a24 = element("a");
			t56 = text("Πειραιάς");
			t57 = space();
			li25 = element("li");
			a25 = element("a");
			t58 = text("Κορυδαλλός");
			t59 = space();
			li26 = element("li");
			a26 = element("a");
			t60 = text("Μοσχάτο");
			t61 = space();
			br = element("br");
			t62 = space();
			h41 = element("h4");
			t63 = text("Ακολουθήστε μας");
			t64 = space();
			div0 = element("div");
			a27 = element("a");
			create_component(icon0.$$.fragment);
			t65 = space();
			a28 = element("a");
			create_component(icon1.$$.fragment);
			t66 = space();
			div3 = element("div");
			t67 = text("Πνευματικά Δικαιώματα Κατοχυρωμένα © ");
			t68 = text(/*year*/ ctx[3]);
			t69 = space();
			t70 = text(/*company*/ ctx[0]);
			t71 = space();
			section = element("section");
			div4 = element("div");
			button = element("button");
			create_component(icon2.$$.fragment);
			t72 = space();
			select = element("select");
			option0 = element("option");
			t73 = text("Επιλέξτε που θα μας καλέσετε");
			option1 = element("option");
			t74 = text("Κινητό");
			option2 = element("option");
			t75 = text("Σταθερό");
			t76 = space();
			div5 = element("div");
			a29 = element("a");
			create_component(icon3.$$.fragment);
			this.h();
		},
		l(nodes) {
			footer = claim_element(nodes, "FOOTER", { class: true });
			var footer_nodes = children(footer);
			div2 = claim_element(footer_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div1 = claim_element(div2_nodes, "DIV", {});
			var div1_nodes = children(div1);
			h40 = claim_element(div1_nodes, "H4", { class: true });
			var h40_nodes = children(h40);
			t0 = claim_text(h40_nodes, "Περιοχές Εξυπηρέτησης");
			h40_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			h30 = claim_element(div1_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			t2 = claim_text(h30_nodes, "Νότια Προάστια");
			h30_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			ul0 = claim_element(div1_nodes, "UL", { class: true });
			var ul0_nodes = children(ul0);
			li0 = claim_element(ul0_nodes, "LI", { class: true });
			var li0_nodes = children(li0);
			a0 = claim_element(li0_nodes, "A", { href: true, class: true });
			var a0_nodes = children(a0);
			t4 = claim_text(a0_nodes, "Άλιμος");
			a0_nodes.forEach(detach);
			li0_nodes.forEach(detach);
			t5 = claim_space(ul0_nodes);
			li1 = claim_element(ul0_nodes, "LI", { class: true });
			var li1_nodes = children(li1);
			a1 = claim_element(li1_nodes, "A", { href: true, class: true });
			var a1_nodes = children(a1);
			t6 = claim_text(a1_nodes, "Αργυρούπολη");
			a1_nodes.forEach(detach);
			li1_nodes.forEach(detach);
			t7 = claim_space(ul0_nodes);
			li2 = claim_element(ul0_nodes, "LI", { class: true });
			var li2_nodes = children(li2);
			a2 = claim_element(li2_nodes, "A", { href: true, class: true });
			var a2_nodes = children(a2);
			t8 = claim_text(a2_nodes, "Βάρη");
			a2_nodes.forEach(detach);
			li2_nodes.forEach(detach);
			t9 = claim_space(ul0_nodes);
			li3 = claim_element(ul0_nodes, "LI", { class: true });
			var li3_nodes = children(li3);
			a3 = claim_element(li3_nodes, "A", { href: true, class: true });
			var a3_nodes = children(a3);
			t10 = claim_text(a3_nodes, "Βάρκιζα");
			a3_nodes.forEach(detach);
			li3_nodes.forEach(detach);
			t11 = claim_space(ul0_nodes);
			li4 = claim_element(ul0_nodes, "LI", { class: true });
			var li4_nodes = children(li4);
			a4 = claim_element(li4_nodes, "A", { href: true, class: true });
			var a4_nodes = children(a4);
			t12 = claim_text(a4_nodes, "Βούλα");
			a4_nodes.forEach(detach);
			li4_nodes.forEach(detach);
			t13 = claim_space(ul0_nodes);
			li5 = claim_element(ul0_nodes, "LI", { class: true });
			var li5_nodes = children(li5);
			a5 = claim_element(li5_nodes, "A", { href: true, class: true });
			var a5_nodes = children(a5);
			t14 = claim_text(a5_nodes, "Βουλιαγμένη");
			a5_nodes.forEach(detach);
			li5_nodes.forEach(detach);
			t15 = claim_space(ul0_nodes);
			li6 = claim_element(ul0_nodes, "LI", { class: true });
			var li6_nodes = children(li6);
			a6 = claim_element(li6_nodes, "A", { href: true, class: true });
			var a6_nodes = children(a6);
			t16 = claim_text(a6_nodes, "Γλυφάδα");
			a6_nodes.forEach(detach);
			li6_nodes.forEach(detach);
			t17 = claim_space(ul0_nodes);
			li7 = claim_element(ul0_nodes, "LI", { class: true });
			var li7_nodes = children(li7);
			a7 = claim_element(li7_nodes, "A", { href: true, class: true });
			var a7_nodes = children(a7);
			t18 = claim_text(a7_nodes, "Ελληνικό");
			a7_nodes.forEach(detach);
			li7_nodes.forEach(detach);
			t19 = claim_space(ul0_nodes);
			li8 = claim_element(ul0_nodes, "LI", { class: true });
			var li8_nodes = children(li8);
			a8 = claim_element(li8_nodes, "A", { href: true, class: true });
			var a8_nodes = children(a8);
			t20 = claim_text(a8_nodes, "Ηλιούπολη");
			a8_nodes.forEach(detach);
			li8_nodes.forEach(detach);
			ul0_nodes.forEach(detach);
			t21 = claim_space(div1_nodes);
			h31 = claim_element(div1_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			t22 = claim_text(h31_nodes, "Κεντρικά");
			h31_nodes.forEach(detach);
			t23 = claim_space(div1_nodes);
			ul1 = claim_element(div1_nodes, "UL", { class: true });
			var ul1_nodes = children(ul1);
			li9 = claim_element(ul1_nodes, "LI", { class: true });
			var li9_nodes = children(li9);
			a9 = claim_element(li9_nodes, "A", { href: true, class: true });
			var a9_nodes = children(a9);
			t24 = claim_text(a9_nodes, "Άγιος Δημήτριος");
			a9_nodes.forEach(detach);
			li9_nodes.forEach(detach);
			t25 = claim_space(ul1_nodes);
			li10 = claim_element(ul1_nodes, "LI", { class: true });
			var li10_nodes = children(li10);
			a10 = claim_element(li10_nodes, "A", { href: true, class: true });
			var a10_nodes = children(a10);
			t26 = claim_text(a10_nodes, "Δάφνη");
			a10_nodes.forEach(detach);
			li10_nodes.forEach(detach);
			t27 = claim_space(ul1_nodes);
			li11 = claim_element(ul1_nodes, "LI", { class: true });
			var li11_nodes = children(li11);
			a11 = claim_element(li11_nodes, "A", { href: true, class: true });
			var a11_nodes = children(a11);
			t28 = claim_text(a11_nodes, "Καλλιθέα");
			a11_nodes.forEach(detach);
			li11_nodes.forEach(detach);
			t29 = claim_space(ul1_nodes);
			li12 = claim_element(ul1_nodes, "LI", { class: true });
			var li12_nodes = children(li12);
			a12 = claim_element(li12_nodes, "A", { href: true, class: true });
			var a12_nodes = children(a12);
			t30 = claim_text(a12_nodes, "Κουκάκι");
			a12_nodes.forEach(detach);
			li12_nodes.forEach(detach);
			t31 = claim_space(ul1_nodes);
			li13 = claim_element(ul1_nodes, "LI", { class: true });
			var li13_nodes = children(li13);
			a13 = claim_element(li13_nodes, "A", { href: true, class: true });
			var a13_nodes = children(a13);
			t32 = claim_text(a13_nodes, "Νέα Σμύρνη");
			a13_nodes.forEach(detach);
			li13_nodes.forEach(detach);
			t33 = claim_space(ul1_nodes);
			li14 = claim_element(ul1_nodes, "LI", { class: true });
			var li14_nodes = children(li14);
			a14 = claim_element(li14_nodes, "A", { href: true, class: true });
			var a14_nodes = children(a14);
			t34 = claim_text(a14_nodes, "Νέος Κόσμος");
			a14_nodes.forEach(detach);
			li14_nodes.forEach(detach);
			t35 = claim_space(ul1_nodes);
			li15 = claim_element(ul1_nodes, "LI", { class: true });
			var li15_nodes = children(li15);
			a15 = claim_element(li15_nodes, "A", { href: true, class: true });
			var a15_nodes = children(a15);
			t36 = claim_text(a15_nodes, "Παλαιό Φάληρο");
			a15_nodes.forEach(detach);
			li15_nodes.forEach(detach);
			t37 = claim_space(ul1_nodes);
			li16 = claim_element(ul1_nodes, "LI", { class: true });
			var li16_nodes = children(li16);
			a16 = claim_element(li16_nodes, "A", { href: true, class: true });
			var a16_nodes = children(a16);
			t38 = claim_text(a16_nodes, "Υμηττός");
			a16_nodes.forEach(detach);
			li16_nodes.forEach(detach);
			t39 = claim_space(ul1_nodes);
			li17 = claim_element(ul1_nodes, "LI", { class: true });
			var li17_nodes = children(li17);
			a17 = claim_element(li17_nodes, "A", { href: true, class: true });
			var a17_nodes = children(a17);
			t40 = claim_text(a17_nodes, "Καρέας");
			a17_nodes.forEach(detach);
			li17_nodes.forEach(detach);
			ul1_nodes.forEach(detach);
			t41 = claim_space(div1_nodes);
			h32 = claim_element(div1_nodes, "H3", { class: true });
			var h32_nodes = children(h32);
			t42 = claim_text(h32_nodes, "Δυτικά Προάστια");
			h32_nodes.forEach(detach);
			t43 = claim_space(div1_nodes);
			ul2 = claim_element(div1_nodes, "UL", { class: true });
			var ul2_nodes = children(ul2);
			li18 = claim_element(ul2_nodes, "LI", { class: true });
			var li18_nodes = children(li18);
			a18 = claim_element(li18_nodes, "A", { href: true, class: true });
			var a18_nodes = children(a18);
			t44 = claim_text(a18_nodes, "Νίκαια");
			a18_nodes.forEach(detach);
			li18_nodes.forEach(detach);
			t45 = claim_space(ul2_nodes);
			li19 = claim_element(ul2_nodes, "LI", { class: true });
			var li19_nodes = children(li19);
			a19 = claim_element(li19_nodes, "A", { href: true, class: true });
			var a19_nodes = children(a19);
			t46 = claim_text(a19_nodes, "Νέο Φάληρο");
			a19_nodes.forEach(detach);
			li19_nodes.forEach(detach);
			t47 = claim_space(ul2_nodes);
			li20 = claim_element(ul2_nodes, "LI", { class: true });
			var li20_nodes = children(li20);
			a20 = claim_element(li20_nodes, "A", { href: true, class: true });
			var a20_nodes = children(a20);
			t48 = claim_text(a20_nodes, "Κερατσίνι");
			a20_nodes.forEach(detach);
			li20_nodes.forEach(detach);
			t49 = claim_space(ul2_nodes);
			li21 = claim_element(ul2_nodes, "LI", { class: true });
			var li21_nodes = children(li21);
			a21 = claim_element(li21_nodes, "A", { href: true, class: true });
			var a21_nodes = children(a21);
			t50 = claim_text(a21_nodes, "Αγία Βαρβάρα");
			a21_nodes.forEach(detach);
			li21_nodes.forEach(detach);
			t51 = claim_space(ul2_nodes);
			li22 = claim_element(ul2_nodes, "LI", { class: true });
			var li22_nodes = children(li22);
			a22 = claim_element(li22_nodes, "A", { href: true, class: true });
			var a22_nodes = children(a22);
			t52 = claim_text(a22_nodes, "Αιγάλεω");
			a22_nodes.forEach(detach);
			li22_nodes.forEach(detach);
			t53 = claim_space(ul2_nodes);
			li23 = claim_element(ul2_nodes, "LI", { class: true });
			var li23_nodes = children(li23);
			a23 = claim_element(li23_nodes, "A", { href: true, class: true });
			var a23_nodes = children(a23);
			t54 = claim_text(a23_nodes, "Βοτανικός");
			a23_nodes.forEach(detach);
			li23_nodes.forEach(detach);
			t55 = claim_space(ul2_nodes);
			li24 = claim_element(ul2_nodes, "LI", { class: true });
			var li24_nodes = children(li24);
			a24 = claim_element(li24_nodes, "A", { href: true, class: true });
			var a24_nodes = children(a24);
			t56 = claim_text(a24_nodes, "Πειραιάς");
			a24_nodes.forEach(detach);
			li24_nodes.forEach(detach);
			t57 = claim_space(ul2_nodes);
			li25 = claim_element(ul2_nodes, "LI", { class: true });
			var li25_nodes = children(li25);
			a25 = claim_element(li25_nodes, "A", { href: true, class: true });
			var a25_nodes = children(a25);
			t58 = claim_text(a25_nodes, "Κορυδαλλός");
			a25_nodes.forEach(detach);
			li25_nodes.forEach(detach);
			t59 = claim_space(ul2_nodes);
			li26 = claim_element(ul2_nodes, "LI", { class: true });
			var li26_nodes = children(li26);
			a26 = claim_element(li26_nodes, "A", { href: true, class: true });
			var a26_nodes = children(a26);
			t60 = claim_text(a26_nodes, "Μοσχάτο");
			a26_nodes.forEach(detach);
			li26_nodes.forEach(detach);
			ul2_nodes.forEach(detach);
			t61 = claim_space(div1_nodes);
			br = claim_element(div1_nodes, "BR", {});
			t62 = claim_space(div1_nodes);
			h41 = claim_element(div1_nodes, "H4", { class: true });
			var h41_nodes = children(h41);
			t63 = claim_text(h41_nodes, "Ακολουθήστε μας");
			h41_nodes.forEach(detach);
			t64 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			a27 = claim_element(div0_nodes, "A", {
				href: true,
				title: true,
				target: true,
				class: true
			});

			var a27_nodes = children(a27);
			claim_component(icon0.$$.fragment, a27_nodes);
			a27_nodes.forEach(detach);
			t65 = claim_space(div0_nodes);

			a28 = claim_element(div0_nodes, "A", {
				href: true,
				title: true,
				target: true,
				class: true
			});

			var a28_nodes = children(a28);
			claim_component(icon1.$$.fragment, a28_nodes);
			a28_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t66 = claim_space(footer_nodes);
			div3 = claim_element(footer_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			t67 = claim_text(div3_nodes, "Πνευματικά Δικαιώματα Κατοχυρωμένα © ");
			t68 = claim_text(div3_nodes, /*year*/ ctx[3]);
			t69 = claim_space(div3_nodes);
			t70 = claim_text(div3_nodes, /*company*/ ctx[0]);
			div3_nodes.forEach(detach);
			footer_nodes.forEach(detach);
			t71 = claim_space(nodes);
			section = claim_element(nodes, "SECTION", { id: true, class: true });
			var section_nodes = children(section);
			div4 = claim_element(section_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			button = claim_element(div4_nodes, "BUTTON", { title: true, class: true });
			var button_nodes = children(button);
			claim_component(icon2.$$.fragment, button_nodes);
			button_nodes.forEach(detach);
			t72 = claim_space(div4_nodes);
			select = claim_element(div4_nodes, "SELECT", { class: true });
			var select_nodes = children(select);
			option0 = claim_element(select_nodes, "OPTION", {});
			var option0_nodes = children(option0);
			t73 = claim_text(option0_nodes, "Επιλέξτε που θα μας καλέσετε");
			option0_nodes.forEach(detach);
			option1 = claim_element(select_nodes, "OPTION", {});
			var option1_nodes = children(option1);
			t74 = claim_text(option1_nodes, "Κινητό");
			option1_nodes.forEach(detach);
			option2 = claim_element(select_nodes, "OPTION", {});
			var option2_nodes = children(option2);
			t75 = claim_text(option2_nodes, "Σταθερό");
			option2_nodes.forEach(detach);
			select_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t76 = claim_space(section_nodes);
			div5 = claim_element(section_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			a29 = claim_element(div5_nodes, "A", { href: true, title: true, class: true });
			var a29_nodes = children(a29);
			claim_component(icon3.$$.fragment, a29_nodes);
			a29_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h40, "class", "svelte-4z7pa0");
			attr(h30, "class", "svelte-4z7pa0");
			attr(a0, "href", "#");
			attr(a0, "class", "svelte-4z7pa0");
			attr(li0, "class", "svelte-4z7pa0");
			attr(a1, "href", "#");
			attr(a1, "class", "svelte-4z7pa0");
			attr(li1, "class", "svelte-4z7pa0");
			attr(a2, "href", "#");
			attr(a2, "class", "svelte-4z7pa0");
			attr(li2, "class", "svelte-4z7pa0");
			attr(a3, "href", "#");
			attr(a3, "class", "svelte-4z7pa0");
			attr(li3, "class", "svelte-4z7pa0");
			attr(a4, "href", "#");
			attr(a4, "class", "svelte-4z7pa0");
			attr(li4, "class", "svelte-4z7pa0");
			attr(a5, "href", "#");
			attr(a5, "class", "svelte-4z7pa0");
			attr(li5, "class", "svelte-4z7pa0");
			attr(a6, "href", "#");
			attr(a6, "class", "svelte-4z7pa0");
			attr(li6, "class", "svelte-4z7pa0");
			attr(a7, "href", "#");
			attr(a7, "class", "svelte-4z7pa0");
			attr(li7, "class", "svelte-4z7pa0");
			attr(a8, "href", "#");
			attr(a8, "class", "svelte-4z7pa0");
			attr(li8, "class", "svelte-4z7pa0");
			attr(ul0, "class", "svelte-4z7pa0");
			attr(h31, "class", "svelte-4z7pa0");
			attr(a9, "href", "#");
			attr(a9, "class", "svelte-4z7pa0");
			attr(li9, "class", "svelte-4z7pa0");
			attr(a10, "href", "#");
			attr(a10, "class", "svelte-4z7pa0");
			attr(li10, "class", "svelte-4z7pa0");
			attr(a11, "href", "#");
			attr(a11, "class", "svelte-4z7pa0");
			attr(li11, "class", "svelte-4z7pa0");
			attr(a12, "href", "#");
			attr(a12, "class", "svelte-4z7pa0");
			attr(li12, "class", "svelte-4z7pa0");
			attr(a13, "href", "#");
			attr(a13, "class", "svelte-4z7pa0");
			attr(li13, "class", "svelte-4z7pa0");
			attr(a14, "href", "#");
			attr(a14, "class", "svelte-4z7pa0");
			attr(li14, "class", "svelte-4z7pa0");
			attr(a15, "href", "#");
			attr(a15, "class", "svelte-4z7pa0");
			attr(li15, "class", "svelte-4z7pa0");
			attr(a16, "href", "#");
			attr(a16, "class", "svelte-4z7pa0");
			attr(li16, "class", "svelte-4z7pa0");
			attr(a17, "href", "#");
			attr(a17, "class", "svelte-4z7pa0");
			attr(li17, "class", "svelte-4z7pa0");
			attr(ul1, "class", "svelte-4z7pa0");
			attr(h32, "class", "svelte-4z7pa0");
			attr(a18, "href", "#");
			attr(a18, "class", "svelte-4z7pa0");
			attr(li18, "class", "svelte-4z7pa0");
			attr(a19, "href", "#");
			attr(a19, "class", "svelte-4z7pa0");
			attr(li19, "class", "svelte-4z7pa0");
			attr(a20, "href", "#");
			attr(a20, "class", "svelte-4z7pa0");
			attr(li20, "class", "svelte-4z7pa0");
			attr(a21, "href", "#");
			attr(a21, "class", "svelte-4z7pa0");
			attr(li21, "class", "svelte-4z7pa0");
			attr(a22, "href", "#");
			attr(a22, "class", "svelte-4z7pa0");
			attr(li22, "class", "svelte-4z7pa0");
			attr(a23, "href", "#");
			attr(a23, "class", "svelte-4z7pa0");
			attr(li23, "class", "svelte-4z7pa0");
			attr(a24, "href", "#");
			attr(a24, "class", "svelte-4z7pa0");
			attr(li24, "class", "svelte-4z7pa0");
			attr(a25, "href", "#");
			attr(a25, "class", "svelte-4z7pa0");
			attr(li25, "class", "svelte-4z7pa0");
			attr(a26, "href", "#");
			attr(a26, "class", "svelte-4z7pa0");
			attr(li26, "class", "svelte-4z7pa0");
			attr(ul2, "class", "svelte-4z7pa0");
			attr(h41, "class", "svelte-4z7pa0");
			attr(a27, "href", "https://www.facebook.com/andreopoulos365.gr");
			attr(a27, "title", "Facebook");
			attr(a27, "target", "_social");
			attr(a27, "class", "svelte-4z7pa0");
			attr(a28, "href", "https://www.youtube.com/@andreopoulos365");
			attr(a28, "title", "Youtube");
			attr(a28, "target", "_social");
			attr(a28, "class", "svelte-4z7pa0");
			attr(div0, "class", "social svelte-4z7pa0");
			attr(div2, "class", "section-container svelte-4z7pa0");
			attr(div3, "class", "copyright svelte-4z7pa0");
			attr(footer, "class", "svelte-4z7pa0");
			attr(button, "title", "Καλέστε μας");
			attr(button, "class", "svelte-4z7pa0");
			option0.__value = "";
			option0.value = option0.__value;
			option1.__value = option1_value_value = "tel:" + /*mobile*/ ctx[2].split(' ').join('') + "}";
			option1.value = option1.__value;
			option2.__value = option2_value_value = "tel:" + /*phone*/ ctx[1].split(' ').join('') + "}";
			option2.value = option2.__value;
			attr(select, "class", "svelte-4z7pa0");
			attr(div4, "class", "svelte-4z7pa0");
			attr(a29, "href", "/epikoinonia");
			attr(a29, "title", "Στείλτε μας μήνυμα");
			attr(a29, "class", "svelte-4z7pa0");
			attr(div5, "class", "svelte-4z7pa0");
			attr(section, "id", "mobileNav");
			attr(section, "class", "svelte-4z7pa0");
		},
		m(target, anchor) {
			insert_hydration(target, footer, anchor);
			append_hydration(footer, div2);
			append_hydration(div2, div1);
			append_hydration(div1, h40);
			append_hydration(h40, t0);
			append_hydration(div1, t1);
			append_hydration(div1, h30);
			append_hydration(h30, t2);
			append_hydration(div1, t3);
			append_hydration(div1, ul0);
			append_hydration(ul0, li0);
			append_hydration(li0, a0);
			append_hydration(a0, t4);
			append_hydration(ul0, t5);
			append_hydration(ul0, li1);
			append_hydration(li1, a1);
			append_hydration(a1, t6);
			append_hydration(ul0, t7);
			append_hydration(ul0, li2);
			append_hydration(li2, a2);
			append_hydration(a2, t8);
			append_hydration(ul0, t9);
			append_hydration(ul0, li3);
			append_hydration(li3, a3);
			append_hydration(a3, t10);
			append_hydration(ul0, t11);
			append_hydration(ul0, li4);
			append_hydration(li4, a4);
			append_hydration(a4, t12);
			append_hydration(ul0, t13);
			append_hydration(ul0, li5);
			append_hydration(li5, a5);
			append_hydration(a5, t14);
			append_hydration(ul0, t15);
			append_hydration(ul0, li6);
			append_hydration(li6, a6);
			append_hydration(a6, t16);
			append_hydration(ul0, t17);
			append_hydration(ul0, li7);
			append_hydration(li7, a7);
			append_hydration(a7, t18);
			append_hydration(ul0, t19);
			append_hydration(ul0, li8);
			append_hydration(li8, a8);
			append_hydration(a8, t20);
			append_hydration(div1, t21);
			append_hydration(div1, h31);
			append_hydration(h31, t22);
			append_hydration(div1, t23);
			append_hydration(div1, ul1);
			append_hydration(ul1, li9);
			append_hydration(li9, a9);
			append_hydration(a9, t24);
			append_hydration(ul1, t25);
			append_hydration(ul1, li10);
			append_hydration(li10, a10);
			append_hydration(a10, t26);
			append_hydration(ul1, t27);
			append_hydration(ul1, li11);
			append_hydration(li11, a11);
			append_hydration(a11, t28);
			append_hydration(ul1, t29);
			append_hydration(ul1, li12);
			append_hydration(li12, a12);
			append_hydration(a12, t30);
			append_hydration(ul1, t31);
			append_hydration(ul1, li13);
			append_hydration(li13, a13);
			append_hydration(a13, t32);
			append_hydration(ul1, t33);
			append_hydration(ul1, li14);
			append_hydration(li14, a14);
			append_hydration(a14, t34);
			append_hydration(ul1, t35);
			append_hydration(ul1, li15);
			append_hydration(li15, a15);
			append_hydration(a15, t36);
			append_hydration(ul1, t37);
			append_hydration(ul1, li16);
			append_hydration(li16, a16);
			append_hydration(a16, t38);
			append_hydration(ul1, t39);
			append_hydration(ul1, li17);
			append_hydration(li17, a17);
			append_hydration(a17, t40);
			append_hydration(div1, t41);
			append_hydration(div1, h32);
			append_hydration(h32, t42);
			append_hydration(div1, t43);
			append_hydration(div1, ul2);
			append_hydration(ul2, li18);
			append_hydration(li18, a18);
			append_hydration(a18, t44);
			append_hydration(ul2, t45);
			append_hydration(ul2, li19);
			append_hydration(li19, a19);
			append_hydration(a19, t46);
			append_hydration(ul2, t47);
			append_hydration(ul2, li20);
			append_hydration(li20, a20);
			append_hydration(a20, t48);
			append_hydration(ul2, t49);
			append_hydration(ul2, li21);
			append_hydration(li21, a21);
			append_hydration(a21, t50);
			append_hydration(ul2, t51);
			append_hydration(ul2, li22);
			append_hydration(li22, a22);
			append_hydration(a22, t52);
			append_hydration(ul2, t53);
			append_hydration(ul2, li23);
			append_hydration(li23, a23);
			append_hydration(a23, t54);
			append_hydration(ul2, t55);
			append_hydration(ul2, li24);
			append_hydration(li24, a24);
			append_hydration(a24, t56);
			append_hydration(ul2, t57);
			append_hydration(ul2, li25);
			append_hydration(li25, a25);
			append_hydration(a25, t58);
			append_hydration(ul2, t59);
			append_hydration(ul2, li26);
			append_hydration(li26, a26);
			append_hydration(a26, t60);
			append_hydration(div1, t61);
			append_hydration(div1, br);
			append_hydration(div1, t62);
			append_hydration(div1, h41);
			append_hydration(h41, t63);
			append_hydration(div1, t64);
			append_hydration(div1, div0);
			append_hydration(div0, a27);
			mount_component(icon0, a27, null);
			append_hydration(div0, t65);
			append_hydration(div0, a28);
			mount_component(icon1, a28, null);
			append_hydration(footer, t66);
			append_hydration(footer, div3);
			append_hydration(div3, t67);
			append_hydration(div3, t68);
			append_hydration(div3, t69);
			append_hydration(div3, t70);
			insert_hydration(target, t71, anchor);
			insert_hydration(target, section, anchor);
			append_hydration(section, div4);
			append_hydration(div4, button);
			mount_component(icon2, button, null);
			append_hydration(div4, t72);
			append_hydration(div4, select);
			append_hydration(select, option0);
			append_hydration(option0, t73);
			append_hydration(select, option1);
			append_hydration(option1, t74);
			append_hydration(select, option2);
			append_hydration(option2, t75);
			append_hydration(section, t76);
			append_hydration(section, div5);
			append_hydration(div5, a29);
			mount_component(icon3, a29, null);
			current = true;

			if (!mounted) {
				dispose = listen(select, "change", /*call*/ ctx[4]);
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (!current || dirty & /*company*/ 1) set_data(t70, /*company*/ ctx[0]);

			if (!current || dirty & /*mobile*/ 4 && option1_value_value !== (option1_value_value = "tel:" + /*mobile*/ ctx[2].split(' ').join('') + "}")) {
				option1.__value = option1_value_value;
				option1.value = option1.__value;
			}

			if (!current || dirty & /*phone*/ 2 && option2_value_value !== (option2_value_value = "tel:" + /*phone*/ ctx[1].split(' ').join('') + "}")) {
				option2.__value = option2_value_value;
				option2.value = option2.__value;
			}
		},
		i(local) {
			if (current) return;
			transition_in(icon0.$$.fragment, local);
			transition_in(icon1.$$.fragment, local);
			transition_in(icon2.$$.fragment, local);
			transition_in(icon3.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon0.$$.fragment, local);
			transition_out(icon1.$$.fragment, local);
			transition_out(icon2.$$.fragment, local);
			transition_out(icon3.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(footer);
			destroy_component(icon0);
			destroy_component(icon1);
			if (detaching) detach(t71);
			if (detaching) detach(section);
			destroy_component(icon2);
			destroy_component(icon3);
			mounted = false;
			dispose();
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { company } = $$props;
	let { address } = $$props;
	let { phone } = $$props;
	let { email } = $$props;
	let { social } = $$props;
	let { nav } = $$props;
	let { cta } = $$props;
	let { breadcrumbs } = $$props;
	let { mobile } = $$props;
	let { jsdoj } = $$props;
	let { pfjyn } = $$props;
	let { gxlkm } = $$props;
	let { nmtxv } = $$props;
	let { mkegn } = $$props;
	let { zecgs } = $$props;
	let { cxxvx } = $$props;
	let { seo_title } = $$props;
	let { seo_description } = $$props;
	const year = new Date().getFullYear();

	const call = event => {
		const ora = new Date().getHours();
		const callLink = event.target.value;

		if (ora > 7 && ora < 22 && callLink != "") {
			event.target.value = "";
			document.location.href = callLink;
		} else {
			alert("Τα τηλέφωνα μας λειτουργούν καθημερινά από τις 8 το πρωί έως τις 9 το βράδυ. Στείλτε μήνυμα για να σας καλέσουμε εμείς το συντομότερο δυνατό.");
		}
	};

	$$self.$$set = $$props => {
		if ('company' in $$props) $$invalidate(0, company = $$props.company);
		if ('address' in $$props) $$invalidate(5, address = $$props.address);
		if ('phone' in $$props) $$invalidate(1, phone = $$props.phone);
		if ('email' in $$props) $$invalidate(6, email = $$props.email);
		if ('social' in $$props) $$invalidate(7, social = $$props.social);
		if ('nav' in $$props) $$invalidate(8, nav = $$props.nav);
		if ('cta' in $$props) $$invalidate(9, cta = $$props.cta);
		if ('breadcrumbs' in $$props) $$invalidate(10, breadcrumbs = $$props.breadcrumbs);
		if ('mobile' in $$props) $$invalidate(2, mobile = $$props.mobile);
		if ('jsdoj' in $$props) $$invalidate(11, jsdoj = $$props.jsdoj);
		if ('pfjyn' in $$props) $$invalidate(12, pfjyn = $$props.pfjyn);
		if ('gxlkm' in $$props) $$invalidate(13, gxlkm = $$props.gxlkm);
		if ('nmtxv' in $$props) $$invalidate(14, nmtxv = $$props.nmtxv);
		if ('mkegn' in $$props) $$invalidate(15, mkegn = $$props.mkegn);
		if ('zecgs' in $$props) $$invalidate(16, zecgs = $$props.zecgs);
		if ('cxxvx' in $$props) $$invalidate(17, cxxvx = $$props.cxxvx);
		if ('seo_title' in $$props) $$invalidate(18, seo_title = $$props.seo_title);
		if ('seo_description' in $$props) $$invalidate(19, seo_description = $$props.seo_description);
	};

	return [
		company,
		phone,
		mobile,
		year,
		call,
		address,
		email,
		social,
		nav,
		cta,
		breadcrumbs,
		jsdoj,
		pfjyn,
		gxlkm,
		nmtxv,
		mkegn,
		zecgs,
		cxxvx,
		seo_title,
		seo_description
	];
}

class Component$1 extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
			company: 0,
			address: 5,
			phone: 1,
			email: 6,
			social: 7,
			nav: 8,
			cta: 9,
			breadcrumbs: 10,
			mobile: 2,
			jsdoj: 11,
			pfjyn: 12,
			gxlkm: 13,
			nmtxv: 14,
			mkegn: 15,
			zecgs: 16,
			cxxvx: 17,
			seo_title: 18,
			seo_description: 19
		});
	}
}

export default Component$1;
