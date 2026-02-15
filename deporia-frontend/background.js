const API_DOMAIN = "https://bubblier-subconcavely-frida.ngrok-free.dev";

browser.contextMenus.create(
  {
    id: "ai-report",
    title: "Mark as AI-generated",
    contexts: ["all"],
  },
);

browser.contextMenus.create(
  {
    id: "human-report",
    title: "Mark as human-generated",
    contexts: ["all"],
  },
);

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const { data: mousePos } =  await browser.tabs.sendMessage(tab.id, { action: "getMenuCoords" });
  switch (info.menuItemId) {
    case "ai-report":
      await doReportUnderCursor(tab, false, mousePos);
      break;
    case "human-report":
      await doReportUnderCursor(tab, true, mousePos);
      break;
  }
})

// incoming IPC
async function fetchRep(sha) {
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


async function bumpRep(sha, trust) {
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

// written by claude
async function tryGetCorsBypass(url) {
  try {
    // Fetch the image using extension permissions (bypasses CORS)
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    // Get the image as a blob
    const blob = await response.blob();
    
    // Convert blob to base64 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result); // Returns "data:image/png;base64,..."
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

// ipc object:

// send
// - action
// - params (any[])

// recieve
// - data

// outgoing IPC
async function doReportUnderCursor(tab, trust, coords) {
  await browser.tabs.sendMessage(tab.id, { action: "doReportUnderCursor", params: [trust, coords] });
}

browser.runtime.onMessage.addListener((request, sender) => {
  switch (request.action) {
    case "fetchRep":
      return fetchRep(...request.params).then(value => ({ data: value }));
    case "bumpRep":
      return fetchRep(...request.params).then(value => ({ data: value }));
    case "tryGetCorsBypass":
      return tryGetCorsBypass(...request.params).then(value => ({ data: value }));
    default:
      return false;
  }
});
