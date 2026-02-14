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
      await browser.tabs.sendMessage(tab.id, { action: "doReportUnderCursor", params: [false, mousePos] });
      break;
    case "human-report":
      await browser.tabs.sendMessage(tab.id, { action: "doReportUnderCursor", params: [true, mousePos] });
      break;
  }
})

// ipc object:

// send
// - action
// - params (any[])

// recieve
// - data
