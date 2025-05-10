let PRODUCTIVE_SITES = {
  "github.com": "Coding",
  "stackoverflow.com": "Community",
  "developer.mozilla.org": "Documentation",
  "medium.com": "Learning",
  "dev.to": "Community",
  "w3schools.com": "Learning",
  "freecodecamp.org": "Learning",
  "geeksforgeeks.org": "Learning",
  "leetcode.com": "Problem Solving",
  "chat.openai.com": "AI Assistance",
  "claude.ai": "AI Assistance",
  "gemini.google.com": "AI Assistance",
};

let currentTabId = null;
let currentStartTime = null;
let currentDomain = null;
let currentUrl = null;
let currentTitle = null;
let minTimeThreshold = 10;

function loadSettings() {
  try {
    chrome.storage.local.get(["settings"], (result) => {
      if (result.settings) {
        PRODUCTIVE_SITES = result.settings.sites || PRODUCTIVE_SITES;
        minTimeThreshold = result.settings.minTime || minTimeThreshold;
      }
    });
  } catch (e) {
    console.error("Error loading settings!", e);
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  handleTabSwitch(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    handleTabSwitch(tabId);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    endCurrentSession();
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) handleTabSwitch(tabs[0].id);
    });
  }
});

function handleTabSwitch(tabId) {
  try {
    endCurrentSession();

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.url) return;

      try {
        const url = new URL(tab.url);
        const domain = url.hostname;

        if (isProductiveDomain(domain)) {
          currentTabId = tabId;
          currentDomain = domain;
          currentUrl = tab.url;
          currentTitle = tab.title;
          currentStartTime = Date.now();
        }
      } catch (e) {
        console.error("Error processing URL:", e);
      }
    });
  } catch (e) {
    console.error("Error in handleTabSwitch:", e);
  }
}

function endCurrentSession() {
  if (currentTabId && currentDomain && currentStartTime) {
    const duration = Math.floor((Date.now() - currentStartTime) / 1000); // seconds
    if (duration >= minTimeThreshold) {
      saveLog({
        domain: currentDomain,
        url: currentUrl,
        title: currentTitle,
        duration: duration,
      });
    }

    currentTabId = null;
    currentStartTime = null;
    currentDomain = null;
    currentUrl = null;
    currentTitle = null;
  }
}

function isProductiveDomain(domain) {
  return Object.keys(PRODUCTIVE_SITES).some((site) => domain.includes(site));
}

function saveLog(activity) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const timeStamp = now.toLocaleTimeString();

  let matchedKey = Object.keys(PRODUCTIVE_SITES).find((key) =>
    activity.domain.includes(key)
  );

  const category = PRODUCTIVE_SITES[matchedKey] || "General";
  const minutesToAdd = Math.round((activity.duration / 60) * 10) / 10;

  let pagePath = "";
  try {
    const urlObj = new URL(activity.url);
    pagePath = urlObj.pathname;
  } catch (e) {
    pagePath = "/";
  }

  chrome.storage.local.get(["dailyLogs", "productivityData"], (result) => {
    const logs = result.dailyLogs || {};
    logs[today] = logs[today] || [];

    const existingIndex = logs[today].findIndex((entry) => {
      const match = entry.match(/(.*?) [-] (.*?) for ([\d.]+) min/);
      return match && match[2] === activity.domain;
    });

    if (existingIndex !== -1) {
      const existingEntry = logs[today][existingIndex];
      const timeMatch = existingEntry.match(/(.*?) [-] (.*?) for ([\d.]+) min/);
      let oldMinutes = timeMatch ? parseFloat(timeMatch[3]) : 0;

      const newMinutes = (oldMinutes + minutesToAdd).toFixed(1);
      logs[today][
        existingIndex
      ] = `${category} - ${activity.domain} for ${newMinutes} min`;
    } else {
      const minutes = minutesToAdd.toFixed(1);
      logs[today].push(`${category} - ${activity.domain} for ${minutes} min`);
    }

    const productivityData = result.productivityData || {};
    productivityData[today] = productivityData[today] || {
      totalMinutes: 0,
      categories: {},
      activities: [],
    };

    productivityData[today].totalMinutes += parseFloat(minutesToAdd);

    productivityData[today].categories[category] =
      (productivityData[today].categories[category] || 0) + minutesToAdd;

    const activityData = {
      timestamp: timeStamp,
      domain: activity.domain,
      url: activity.url,
      path: pagePath,
      title: activity.title,
      category: category,
      minutes: minutesToAdd,
      seconds: activity.duration,
    };

    productivityData[today].activities.push(activityData);

    chrome.storage.local.set({
      dailyLogs: logs,
      productivityData: productivityData,
    });
  });
}

function exportDailyLog(date) {
  chrome.storage.local.get(["dailyLogs", "productivityData"], (result) => {
    const logs = result.dailyLogs || {};
    const productivityData = result.productivityData || {};

    const todayLogs = logs[date] || [];
    const todayData = productivityData[date] || {
      totalMinutes: 0,
      categories: {},
    };

    let markdown = `# CodeCred Log for ${date}\n\n`;
    markdown += `Total productive time: ${todayData.totalMinutes.toFixed(
      1
    )} minutes\n\n`;

    const categories = {};
    todayLogs.forEach((entry) => {
      const match = entry.match(/(.*?) [-] (.*?) for ([\d.]+) min/);
      if (match) {
        const category = match[1];
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(`${match[2]} for ${match[3]} min`);
      }
    });
    for (const category in categories) {
      markdown += `## ${category}\n`;
      categories[category].forEach((item) => {
        markdown += `- ${item}\n`;
      });
      markdown += "\n";
    }

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `codecred-${date}.md`,
      saveAs: false,
    });
  });
}

loadSettings();

setInterval(() => {
  if (currentStartTime) {
    const now = Date.now();
    const inactiveThreshold = 10 * 60 * 1000; // 10 minutes

    if (now - currentStartTime > inactiveThreshold) {
      chrome.tabs.get(currentTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          endCurrentSession();
        }
      });
    }
  }
}, 2 * 60 * 1000);
