document.addEventListener("DOMContentLoaded", () => {
  const currentDateEl = document.getElementById("currentDate");
  const totalTimeEl = document.getElementById("totalTime");
  const entryCountEl = document.getElementById("entryCount");
  const tbody = document.getElementById("logBody");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");
  const prevDayBtn = document.getElementById("prevDay");
  const nextDayBtn = document.getElementById("nextDay");
  const selectedDateEl = document.getElementById("selectedDate");

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  currentDateEl.textContent = today.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.getAttribute("data-tab");

      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      tabContents.forEach((content) => {
        content.classList.add("hidden");
      });
      document.getElementById(`${tabName}-tab`).classList.remove("hidden");
    });
  });

  function loadTodayData() {
    chrome.storage.local.get(["dailyLogs"], (result) => {
      const logs = result.dailyLogs || {};
      const todayLogs = logs[todayStr] || [];

      tbody.innerHTML = "";

      if (todayLogs.length === 0) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="3">No activity logged today.</td>`;
        tbody.appendChild(row);
        totalTimeEl.textContent = "0";
        entryCountEl.textContent = "0";
      } else {
        let totalMinutes = 0;

        todayLogs.forEach((entry) => {
          const match = entry.match(/(.*?) [-] (.*?) for ([\d.]+) min/);
          if (match) {
            const category = match[1];
            const domain = match[2];
            const minutes = parseFloat(match[3]);

            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${category}</td>
              <td>${domain}</td>
              <td>${minutes.toFixed(1)}</td>
            `;
            tbody.appendChild(row);

            totalMinutes += minutes;
          }
        });

        totalTimeEl.textContent = totalMinutes.toFixed(1);
        entryCountEl.textContent = todayLogs.length;
      }
    });
  }

  function loadHistoryData(dateStr) {
    selectedDateEl.textContent = formatDate(dateStr);

    chrome.storage.local.get(["dailyLogs"], (result) => {
      const logs = result.dailyLogs || {};
      const selectedLogs = logs[dateStr] || [];
      const historyContent = document.getElementById("historyContent");

      if (selectedLogs.length === 0) {
        historyContent.innerHTML =
          '<p class="empty-state">No activity logged for this date.</p>';
      } else {
        let html = '<ul class="history-list">';
        selectedLogs.forEach((entry) => {
          html += `<li>${entry}</li>`;
        });
        html += "</ul>";
        historyContent.innerHTML = html;
      }
    });
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  let currentViewDate = todayStr;

  prevDayBtn.addEventListener("click", () => {
    const date = new Date(currentViewDate);
    date.setDate(date.getDate() - 1);
    currentViewDate = date.toISOString().split("T")[0];
    loadHistoryData(currentViewDate);
  });

  nextDayBtn.addEventListener("click", () => {
    const date = new Date(currentViewDate);
    date.setDate(date.getDate() + 1);
    const newDate = date.toISOString().split("T")[0];

    if (newDate <= todayStr) {
      currentViewDate = newDate;
      loadHistoryData(currentViewDate);
    }
  });

  exportBtn.addEventListener("click", () => {
    chrome.storage.local.get(["dailyLogs"], (result) => {
      const logs = result.dailyLogs || {};
      const todayLogs = logs[todayStr] || [];

      let totalMinutes = 0;
      todayLogs.forEach((entry) => {
        const timeMatch = entry.match(/for ([\d.]+) min/);
        if (timeMatch) {
          totalMinutes += parseFloat(timeMatch[1]);
        }
      });

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

      let markdown = `# CodeCred Log for ${todayStr}\n\n`;
      markdown += `Total productive time: ${totalMinutes.toFixed(
        1
      )} minutes\n\n`;

      for (const category in categories) {
        markdown += `## ${category}\n`;
        categories[category].forEach((item) => {
          markdown += `- ${item}\n`;
        });
        markdown += "\n";
      }

      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `codecred-${todayStr}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  clearBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear today's data?")) {
      chrome.storage.local.get(["dailyLogs"], (result) => {
        const logs = result.dailyLogs || {};
        delete logs[todayStr];
        chrome.storage.local.set({ dailyLogs: logs }, () => {
          loadTodayData();
        });
      });
    }
  });

  loadTodayData();
});
