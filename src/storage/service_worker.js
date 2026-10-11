// Chrome uses a service worker; Safari loads this in a nonpersistent background page.
if (typeof importScripts === "function") {
  importScripts("../common/account.js", "../common/common.js", "./class/StorageUtil.js", "./class/RefreshCoordinator.js");
}
StorageUtil.isBackground = true;

const MOODLE_ROOT = "https://cms7.ict.nitech.ac.jp/moodle40a/";
const refreshCoordinator = new RefreshCoordinator({ storage: ext.storage.local });
const accountSession = new AccountSession({ storage: ext.storage.local });
let tabCollection = null;

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !["SAVE_TASK", "EDIT_TASK", "TAB_COURSE", "GET_SETTINGS",
    "REFRESH_CLAIM", "REFRESH_HEARTBEAT", "REFRESH_FINISH", "REFRESH_STATUS", "REFRESH_PROGRESS", "REFRESH_PAGE_READY",
    "ACCOUNT_READY", "ACCOUNT_GET", "ACCOUNT_SET"].includes(msg.type)) return false;
  const operation = async () => {
    if (msg.type === "ACCOUNT_READY") return accountSession.register(msg, sender);
    if (msg.type === "GET_SETTINGS") {
      await installationReady;
      return { ok: true, ...(await ext.storage.local.get(["thememode", "themeDefault", "iosAppearance"])) };
    }
    if (msg.type === "TAB_COURSE") {
      // Do not hold the account queue while navigating/fetching. Every progress,
      // lease check and save below revalidates its account in that queue.
      await accountSession.run(msg, sender, async () => {});
      if (tabCollection) throw new Error("別のタブで課題情報を更新しています");
      tabCollection = collectTabWithLease(msg, sender);
      try { return await tabCollection; }
      finally { tabCollection = null; }
    }
    return accountSession.run(msg, sender, async () => {
    switch (msg.type) {
      case "ACCOUNT_GET":
        if (!Array.isArray(msg.keys) || msg.keys.some(key => !AccountSession.keys.includes(key))) throw new Error("保存キーが不正です");
        return { ok: true, data: await ext.storage.local.get(msg.keys) };
      case "ACCOUNT_SET": {
        if (!msg.values || Object.keys(msg.values).some(key => !["courseIds", "history"].includes(key))) throw new Error("保存キーが不正です");
        const values = {};
        if ("courseIds" in msg.values) {
          if (!Array.isArray(msg.values.courseIds) || msg.values.courseIds.length > 10000) throw new Error("コース一覧が不正です");
          const old = (await ext.storage.local.get("courseIds")).courseIds || [];
          values.courseIds = [...new Set([...old, ...msg.values.courseIds])].filter(id => Number.isSafeInteger(id) && id > 0);
        }
        if ("history" in msg.values) {
          if (!Array.isArray(msg.values.history) || msg.values.history.length > 10) throw new Error("履歴が不正です");
          values.history = msg.values.history.filter(entry => {
            try {
              const url = new URL(entry.url);
              return typeof entry.title === "string" && url.origin === "https://cms7.ict.nitech.ac.jp" && url.pathname.startsWith("/moodle40a/");
            } catch { return false; }
          }).map(entry => ({ title: entry.title, url: entry.url }));
        }
        await ext.storage.local.set(values);
        return { ok: true };
      }
      case "SAVE_TASK":
        await StorageUtil.saveData(msg.table, msg.idproperty, msg.data);
        return { ok: true };
      case "EDIT_TASK":
        await StorageUtil.editData(msg.table, msg.idproperty, msg.id, msg.property, msg.value);
        return { ok: true };
      case "REFRESH_CLAIM":
        return refreshCoordinator.claim(msg, sender);
      case "REFRESH_HEARTBEAT":
        return refreshCoordinator.heartbeat(msg.token, sender);
      case "REFRESH_FINISH":
        return refreshCoordinator.finish(msg, sender);
      case "REFRESH_PROGRESS":
        return refreshCoordinator.progress(msg, sender);
      case "REFRESH_PAGE_READY":
        return refreshCoordinator.pageReady(msg.pageId, sender);
      case "REFRESH_STATUS":
        return refreshCoordinator.status(sender);
    }
    });
  };
  operation().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  // Callback responses keep Chrome and Safari messaging compatible.
  return true;
});

async function collectTabWithLease(message, sender) {
  const context = { accountId: message.accountId, pageId: message.pageId };
  let token = message.refreshToken;
  const internalLease = !token;
  if (internalLease) {
    const claim = await accountSession.run(context, sender, () => refreshCoordinator.claim({ mode: "manual" }, sender));
    if (!claim.granted) return { ...claim, ok: false,
      error: claim.reason === "cooldown" ? "次の更新時刻までお待ちください" : "別のタブで課題情報を更新しています" };
    token = claim.token;
  }
  try {
    await requireTabLease(token, sender, context);
    const result = await runTabScraping(token, sender, context);
    if (internalLease) {
      await accountSession.run(context, sender, () => refreshCoordinator.finish({ token, outcome: result.failed ? "partial" : "success",
        fullSweep: true }, sender));
    }
    return { ok: true, result };
  } catch (error) {
    if (internalLease) await accountSession.run(context, sender, () => refreshCoordinator.finish({ token, outcome: "error" }, sender)).catch(() => {});
    throw error;
  }
}

async function requireTabLease(token, sender, context) {
  let heartbeat;
  try { heartbeat = await accountSession.run(context, sender, () => refreshCoordinator.heartbeat(token, sender, "manual")); }
  catch { heartbeat = { owned: false }; }
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

async function runTabScraping(refreshToken, sender, context) {
  const { courseIds = [] } = await accountSession.run(context, sender, () => ext.storage.local.get("courseIds"));
  const ids = [...new Set(courseIds.map(Number))].filter(id => Number.isInteger(id) && id > 0);
  if (!ids.length) throw new Error("マイコースを表示してから課題情報を更新してください");
  const tab = await ext.tabs.create({ url: "about:blank", active: false });
  const result = { courses: 0, saved: 0, failed: 0, errors: [] };
  const publish = async () => {
    if (!refreshToken) return;
    const reply = await accountSession.run(context, sender, () => refreshCoordinator.progress({ token: refreshToken,
      progress: { phase: "courses", completed: result.courses, total: ids.length, saved: result.saved } }, sender));
    if (!reply.owned) throw Object.assign(new Error("更新が中断されました"), { name: "RefreshLeaseLost" });
  };
  const seen = new Set();
  try {
    if (refreshToken) await accountSession.run(context, sender, () => refreshCoordinator.setTemporaryTab(refreshToken, sender, tab.id));
    await publish();
    for (const courseId of ids) {
      if (refreshToken) await requireTabLease(refreshToken, sender, context);
      const url = `${MOODLE_ROOT}course/view.php?id=${courseId}`;
      try {
        await navigateTab(tab.id, url);
        const response = await ext.tabs.sendMessage(tab.id, { type: "COLLECT_COURSE_ITEMS" });
        if (!response?.ok) throw tabCollectionError(response?.error || "コースを読み取れませんでした");
        for (const item of response.items) {
          const key = `${item.type}:${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (refreshToken) await requireTabLease(refreshToken, sender, context);
          const taskURL = `${MOODLE_ROOT}mod/${item.type}/view.php?id=${item.id}`;
          try {
            await navigateTab(tab.id, taskURL);
            const detail = await ext.tabs.sendMessage(tab.id, { type: "COLLECT_TASK" });
            if (!detail?.ok || !detail.data) throw tabCollectionError(detail?.error || "課題を読み取れませんでした");
            if (refreshToken) await requireTabLease(refreshToken, sender, context);
            await accountSession.run(context, sender, () => StorageUtil.saveData(detail.data.group,
              item.type === "assign" ? "assignId" : "quizId",
              { ...detail.data, courseId, fetchedAt: detail.data.fetchedAt ?? Date.now() }));
            result.saved++;
          } catch (error) {
            if (error.name === "RefreshLeaseLost" || error.code === "AUTH_REQUIRED") throw error;
            result.failed++;
            result.errors.push({ url: taskURL, message: error.message });
          }
          await publish();
        }
        result.courses++;
      } catch (error) {
        if (error.name === "RefreshLeaseLost" || error.code === "AUTH_REQUIRED") throw error;
        result.failed++;
        result.errors.push({ url, message: error.message });
      }
      await publish();
    }
    return result;
  } finally {
    // Only the tab created for collection is closed, including on failure.
    await ext.tabs.remove(tab.id).catch(() => {});
    if (refreshToken) await accountSession.run(context, sender, () => refreshCoordinator.clearTemporaryTab(tab.id)).catch(() => {});
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


// An absent theme in an older installation means browser sync, not a new install.
let installationReady = Promise.resolve();
async function initializeInstallation(details) {
  const settings = await ext.storage.local.get(["thememode", "themeDefault", "iosAppearance"]);
  if (settings.themeDefault === undefined) {
    await ext.storage.local.set({ themeDefault: details.reason === "install" ? 2 : 0 });
  }
}
ext.runtime.onInstalled.addListener(details => {
  installationReady = initializeInstallation(details);
  installationReady.catch(console.error);
});

ext.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") accountSession.serial(() => refreshCoordinator.tabGone(tabId)).catch(console.error);
});
ext.tabs.onRemoved.addListener(tabId => {
  accountSession.serial(() => refreshCoordinator.tabGone(tabId)).catch(console.error);
  accountSession.forget(tabId).catch(console.error);
});
