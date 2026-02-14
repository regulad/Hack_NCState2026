// https://stackoverflow.com/questions/40031688/how-can-i-convert-an-arraybuffer-to-a-hexadecimal-string-hex
function buf2hex(buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
}

const API_DOMAIN = "https://bubblier-subconcavely-frida.ngrok-free.dev"
const SIGNIFICANT_IMG_SIZE = 128 // images below this size on both axis aren't checked

async function bump_rep(sha, trust) {
  const request = new Request(`${API_DOMAIN}/${sha}`, {
    method: "PUT",
    headers: new Headers([
      ["Ngrok-Skip-Browser-Warning", "yes"],
      ["Content-Type", "application/json"]
    ]),
    body: JSON.stringify({"trust": trust}),
  });
  const response = await fetch(request);
  if (!response.ok) {
    const errorBody = await response.text(); 
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody}`);
  }
}

async function fetch_rep(sha) {
  const request = new Request(`${API_DOMAIN}/${sha}`, {
    method: "GET",
    headers: new Headers([["Ngrok-Skip-Browser-Warning", "yes"]])
  });
  const response = await fetch(request);
  if (!response.ok) {
    const errorBody = await response.text(); 
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody}`);
  }
  return await response.text().then(JSON.parse).then(parsed => parsed.reputation);
  // TODO: response validation to see if it is a float value clamped between 0 and 1
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
      candidateHashes.map(buf2hex).map(definitelyString => bump_rep(definitelyString, trust))
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

async function panicGetHashOrNull(src) {
  // we failed to get the url normally, we need to do a CORS bypass to get the bytes of this image
  // TODO
  console.debug("got a url we can't handle yet:", src);
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
    return await panicGetHashOrNull(maybeUrl);
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

  // we have an element relevant to us
  console.debug("interesting element...");
  // TODO
}