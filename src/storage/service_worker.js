// Chrome uses a service worker; Safari loads this in a nonpersistent background page.
if (typeof importScripts === "function") {
  importScripts("../common/common.js", "./class/StorageUtil.js", "./class/RefreshCoordinator.js");
}
StorageUtil.isBackground = true;

const MOODLE_ROOT = "https://cms7.ict.nitech.ac.jp/moodle40a/";
const refreshCoordinator = new RefreshCoordinator({ storage: ext.storage.local });
let tabCollection = null;

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !["SAVE_TASK", "EDIT_TASK", "TAB_COURSE", "GET_CAPABILITIES",
    "REFRESH_CLAIM", "REFRESH_HEARTBEAT", "REFRESH_FINISH", "REFRESH_STATUS"].includes(msg.type)) return false;
  const operation = async () => {
    switch (msg.type) {
      case "SAVE_TASK":
        await StorageUtil.saveData(msg.table, msg.idproperty, msg.data);
        return { ok: true };
      case "EDIT_TASK":
        await StorageUtil.editData(msg.table, msg.idproperty, msg.id, msg.property, msg.value);
        return { ok: true };
      case "GET_CAPABILITIES":
        return { ok: true, notifications: Boolean(ext.notifications?.create) };
      case "REFRESH_CLAIM":
        return refreshCoordinator.claim(msg, sender);
      case "REFRESH_HEARTBEAT":
        return refreshCoordinator.heartbeat(msg.token, sender);
      case "REFRESH_FINISH":
        return refreshCoordinator.finish(msg, sender);
      case "REFRESH_STATUS":
        return refreshCoordinator.status(sender);
      case "TAB_COURSE":
        if (tabCollection) throw new Error("別のタブで課題情報を更新しています");
        // Reserve synchronously, before checking the persisted lease, so two
        // messages bearing the same token cannot start two temporary tabs.
        tabCollection = collectTabWithLease(msg, sender);
        try {
          return await tabCollection;
        } finally {
          tabCollection = null;
        }
    }
  };
  operation().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  // Callback responses keep Chrome and Safari messaging compatible.
  return true;
});

async function collectTabWithLease(message, sender) {
  let token = message.refreshToken;
  const internalLease = !token;
  if (internalLease) {
    const claim = await refreshCoordinator.claim({ mode: "manual" }, sender);
    if (!claim.granted) return { ...claim, ok: false,
      error: claim.reason === "cooldown" ? "次の更新時刻までお待ちください" : "別のタブで課題情報を更新しています" };
    token = claim.token;
  }
  try {
    await requireTabLease(token, sender);
    const result = await runTabScraping(token, sender);
    if (internalLease) {
      await refreshCoordinator.finish({ token, outcome: result.failed ? "partial" : "success",
        fullSweep: true }, sender);
    }
    return { ok: true, result };
  } catch (error) {
    if (internalLease) await refreshCoordinator.finish({ token, outcome: "error" }, sender);
    throw error;
  }
}

async function requireTabLease(token, sender) {
  const heartbeat = await refreshCoordinator.heartbeat(token, sender, "manual");
  if (!heartbeat.owned) {
    const error = new Error("更新の実行権を失いました");
    error.name = "RefreshLeaseLost";
    throw error;
  }
}

function tabCollectionError(message) {
  const error = new Error(message);
  if (/ログイン|login|authentication/i.test(message)) error.code = "AUTH_REQUIRED";
  return error;
}

async function runTabScraping(refreshToken, sender) {
  const { courseIds = [] } = await ext.storage.local.get("courseIds");
  const ids = [...new Set(courseIds.map(Number))].filter(id => Number.isInteger(id) && id > 0);
  if (!ids.length) throw new Error("マイコースを表示してから課題情報を更新してください");
  const tab = await ext.tabs.create({ url: "about:blank", active: false });
  const result = { courses: 0, saved: 0, failed: 0, errors: [] };
  const seen = new Set();
  try {
    if (refreshToken) await refreshCoordinator.setTemporaryTab(refreshToken, sender, tab.id);
    for (const courseId of ids) {
      if (refreshToken) await requireTabLease(refreshToken, sender);
      const url = `${MOODLE_ROOT}course/view.php?id=${courseId}`;
      try {
        await navigateTab(tab.id, url);
        const response = await ext.tabs.sendMessage(tab.id, { type: "COLLECT_COURSE_ITEMS" });
        if (!response?.ok) throw tabCollectionError(response?.error || "コースを読み取れませんでした");
        for (const item of response.items) {
          const key = `${item.type}:${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (refreshToken) await requireTabLease(refreshToken, sender);
          const taskURL = `${MOODLE_ROOT}mod/${item.type}/view.php?id=${item.id}`;
          try {
            await navigateTab(tab.id, taskURL);
            const detail = await ext.tabs.sendMessage(tab.id, { type: "COLLECT_TASK" });
            if (!detail?.ok || !detail.data) throw tabCollectionError(detail?.error || "課題を読み取れませんでした");
            if (refreshToken) await requireTabLease(refreshToken, sender);
            await StorageUtil.saveData(detail.data.group,
              item.type === "assign" ? "assignId" : "quizId",
              { ...detail.data, courseId, fetchedAt: detail.data.fetchedAt ?? Date.now() });
            result.saved++;
          } catch (error) {
            if (error.name === "RefreshLeaseLost" || error.code === "AUTH_REQUIRED") throw error;
            result.failed++;
            result.errors.push({ url: taskURL, message: error.message });
          }
        }
        result.courses++;
      } catch (error) {
        if (error.name === "RefreshLeaseLost" || error.code === "AUTH_REQUIRED") throw error;
        result.failed++;
        result.errors.push({ url, message: error.message });
      }
    }
    return result;
  } finally {
    // Only the tab created for collection is closed, including on failure.
    await ext.tabs.remove(tab.id).catch(() => {});
    if (refreshToken) await refreshCoordinator.clearTemporaryTab(tab.id);
  }
}

function navigateTab(tabId, url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      ext.tabs.onUpdated.removeListener(onUpdated);
      ext.tabs.onRemoved.removeListener(onRemoved);
    };
    const finish = (error, tab) => {
      if (settled) return;
      const authRedirect = tab?.url && (tab.url.startsWith(MOODLE_ROOT + "login/")
        || tab.url.startsWith(MOODLE_ROOT + "auth/"));
      // Ignore a queued completion from the previous page (including about:blank).
      if (!error && tab?.url && tab.url !== url && !authRedirect) {
        if (tab.url === "about:blank") return;
        if (tab.url.startsWith(MOODLE_ROOT)) {
          const actual = new URL(tab.url);
          const expected = new URL(url);
          if (actual.pathname !== expected.pathname || actual.searchParams.get("id") !== expected.searchParams.get("id")) return;
        }
      }
      settled = true;
      cleanup();
      if (error) return reject(error);
      if (tab?.url && (!tab.url.startsWith(MOODLE_ROOT) || authRedirect)) {
        return reject(tabCollectionError("Moodleにログインし直してから更新してください"));
      }
      resolve();
    };
    const onUpdated = (id, info, tab) => {
      if (id === tabId && info.status === "complete") finish(null, tab);
    };
    const onRemoved = id => {
      if (id === tabId) finish(new Error("収集用のタブが閉じられました"));
    };
    // Subscribe before navigating so cached pages cannot finish before the listener exists.
    ext.tabs.onUpdated.addListener(onUpdated);
    ext.tabs.onRemoved.addListener(onRemoved);
    timer = setTimeout(() => finish(new Error("ページの読み込みがタイムアウトしました")), timeout);
    ext.tabs.update(tabId, { url }).then(tab => {
      if (tab.status === "complete" && tab.url === url) finish(null, tab);
    }, error => finish(error));
  });
}

async function createNotification(url, title, message) {
  if (!ext.notifications?.create) return false;
  try {
    await ext.notifications.create(url, {
      type: "basic", iconUrl: ext.runtime.getURL("storage/icon.jpg"), title, message
    });
    return true;
  } catch (error) {
    console.warn("通知を表示できませんでした", error);
    return false;
  }
}

// Register once at top level; Safari can unload and restart its background context.
if (ext.notifications?.onClicked) {
  ext.notifications.onClicked.addListener(notificationId => {
    if (notificationId.startsWith(MOODLE_ROOT)) ext.tabs.create({ url: notificationId });
  });
}

async function checkDeadlines() {
  if (!ext.notifications?.create) return;
  for (const [table, idproperty, name, module] of [
    ["assign_list", "assignId", "assignName", "assign"],
    ["quiz_list", "quizId", "quizName", "quiz"]
  ]) {
    // Reminder edits share the same storage queue as foreground refreshes.
    await StorageUtil.mutate(table, async items => {
      for (const item of items) {
        const remaining = new Date(item.due).getTime() - Date.now();
        if (!item.due || remaining <= 0 || remaining > 24 * 60 * 60 * 1000
            || item.notified || item.status === "complete") continue;
        const sent = await createNotification(`${MOODLE_ROOT}mod/${module}/view.php?id=${item[idproperty]}`,
          "締切間近", `${item.courseName} コースの ${item[name]} の締切が近いです`);
        if (sent) item.notified = true;
      }
      return items;
    });
  }
}

async function ensureReminderAlarm() {
  if (!ext.alarms?.create || !ext.notifications?.create) return;
  await ext.alarms.create("task_notice", { periodInMinutes: 10 });
}

if (ext.alarms?.onAlarm) {
  ext.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "task_notice") checkDeadlines().catch(console.error);
  });
}
ext.runtime.onInstalled.addListener(() => ensureReminderAlarm().catch(console.error));
if (ext.runtime.onStartup) {
  ext.runtime.onStartup.addListener(() => ensureReminderAlarm().catch(console.error));
}
ensureReminderAlarm().catch(console.error);
