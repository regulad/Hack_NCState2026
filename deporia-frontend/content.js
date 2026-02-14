// https://stackoverflow.com/questions/40031688/how-can-i-convert-an-arraybuffer-to-a-hexadecimal-string-hex
function buf2hex(buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
}

const SIGNIFICANT_IMG_SIZE = 128 // images below this size on both axis aren't checked

// IPC wrappers
async function bumpRep(sha, trust) {
  const response = await browser.runtime.sendMessage({ action: "bumpRep", params: [sha, trust] });
  if (response.data !== undefined) {
    return response.data;
  } else {
    throw new Error("bad IPC");
  }
}

async function fetchRep(sha) {
  const response = await browser.runtime.sendMessage({ action: "fetchRep", params: [sha] });
  if (response.data !== undefined) {
    return response.data;
  } else {
    throw new Error("bad IPC");
  }
}

async function tryGetCorsBypass(url) {
  const response = await browser.runtime.sendMessage({ action: "tryGetCorsBypass", params: [url] });
  if (response.data !== undefined) {
    return response.data;
  } else {
    throw new Error("bad IPC");
  }
}

// TODO: detect images, canvases (not by us) and divs with background styles inserted into DOM for overlay

const lastContextMenuCoords = { x: null, y: null };
document.addEventListener('contextmenu', (e) => {
  // this will fire whenever a context menu is opened, our RPC call from background.js will get the data
  lastContextMenuCoords.x = e.clientX;
  lastContextMenuCoords.y = e.clientY;
});

async function getMenuCoords() {
  // hacky and needs to be fired AS SOON AS the thing is recieved
  return lastContextMenuCoords;
}

function getAllElementsAtPoint(x, y) {
  // similar to document.elementsFromPoint but uses bounding box to detect things that may have
  // pointer events set to none
  const allElements = document.querySelectorAll('img, canvas, [style*="background"]');
  const matchingElements = [];
  
  for (const el of allElements) {
    const rect = el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && 
        y >= rect.top && y <= rect.bottom) {
      matchingElements.push(el);
    }
  }
  
  return matchingElements;
}

// find every image in the website
async function doReportUnderCursor(trust, coords) {
  // errors encountered here propagate up tthe call chain (which we want), but the stacktrace also gets lost.
  // this ensures that that the stack trace is printed anyway
  try {
    const candidateElements = getAllElementsAtPoint(coords.x, coords.y);
    const candidateBuffersMaybe = await Promise.all(candidateElements.map(getHashOrNull));
    const candidateHashes = candidateBuffersMaybe.filter(maybeString => maybeString !== null);
    await Promise.all(
      candidateHashes.map(buf2hex).map(definitelyString => bumpRep(definitelyString, trust))
    );
    if (candidateHashes.length > 0) {
      alert("All done! Thank you for your submission!");
    } else {
      alert("Didn't find anything to submit.")
    }
  } catch (error) {
    console.error("error when handling RPC!", error.stack);
    alert("Your submission was not successful.");
  }
}

const urlRegex = /^https?:\/\/.+/i;

async function panicGetHashOrNull(src) {
  // src type of string
  // we failed to get the url normally, we need to do a CORS bypass to get the bytes of this image
  // step 1: check to see if it is a data: url
  if (!src.startsWith("data:") && urlRegex.test(src)) {
    // non-data but fetchable URL blocked by CORS.
    // background script transformation may work.
    src = await tryGetCorsBypass(src) || src;
  }

  if (src.startsWith("data:")) {
    // we got an easy one!
    const base64 = src.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return await crypto.subtle.digest("SHA-256", bytes);
  }

  console.warn("got a weird URI we can't handle yet:", src);
  return null;
}

// handle getting a hash of an element
async function getHashOrNull(element) {
  // if the element has image data (img, content with css background, canvas)
  // return the sha256 hash as a hex string
  // core issue: different image formats may contain the same visual data but different bytes therefore different hashes
  // fix in future with embeddedings 
  const computedStyle = window.getComputedStyle(element);
  if (element.tagName === "CANVAS") {
    const ctx = element.getContext('2d');
    const canvasBytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return await crypto.subtle.digest("SHA-256", canvasBytes);
  } else if (element.tagName === "IMG" && element.naturalHeight > SIGNIFICANT_IMG_SIZE && element.naturalWidth > SIGNIFICANT_IMG_SIZE) {
      const scratchCanvas = document.createElement('canvas');
      scratchCanvas.style.display = "none";
      scratchCanvas.height = element.naturalHeight;
      scratchCanvas.width = element.naturalWidth;
      const ctx = scratchCanvas.getContext('2d');
      ctx.drawImage(element, 0, 0);
      try {
        const canvasBytes = ctx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height).data;
        return await crypto.subtle.digest("SHA-256", canvasBytes);
      } catch (error) {
        // CORS error brought us here.
        return await panicGetHashOrNull(element.src);
      }
  } else if (!!computedStyle.backgroundImage && computedStyle.backgroundImage !== "none") {
    const maybeUrl = computedStyle.backgroundImage.match(/url\(["']?([^"']*)["']?\)/);
    if (!maybeUrl) {
      return null; // probably just a gradient or similar
    }
    return await panicGetHashOrNull(maybeUrl[1]);
  } else {
    // no idea what this is lol
    return null;
  }
}

// IPC
// - doReportUnderCursor
// - getMenuCoords
// apparently will only work on Chrome >= 144 or Firefox
// https://issues.chromium.org/issues/40753031
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage
browser.runtime.onMessage.addListener((request, sender) => {
    switch (request.action) {
      case "getMenuCoords":
        return getMenuCoords().then(menuCoords => ({ data: menuCoords }));
      case "doReportUnderCursor":
        return doReportUnderCursor(...request.params).then();
      default:
        return false;
    }
});

// mutation handler
// Create the observer
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      // Only process element nodes (not text nodes, comments, etc.)
      if (node.nodeType === Node.ELEMENT_NODE) {
        handleElement(node);
        
        // Also check for nested elements within the added node
        const descendants = node.querySelectorAll('*');
        descendants.forEach(handleElement);
      }
    });
  });
});

// Start observing
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

// Handle existing elements on page load
document.querySelectorAll('*').forEach(handleElement);

async function handleElement(element) {
  // see if a element is supported by it
  const maybeNull = await getHashOrNull(element);
  if (maybeNull === null) {
    return;
  }

  const hexHash = buf2hex(maybeNull);
  const imageReputation = await fetchRep(hexHash);

  // we have an element relevant to us
  console.debug("interesting element...", element, hexHash, imageReputation);
  // TODO: add element with reputation
}