// Chrome uses a service worker; Safari loads this in a nonpersistent background page.
if (typeof importScripts === "function") {
  importScripts("../common/account.js", "../common/common.js", "./class/StorageUtil.js", "./class/RefreshCoordinator.js", "./class/CourseCollector.js");
}
StorageUtil.isBackground = true;

const MOODLE_ROOT = "https://cms7.ict.nitech.ac.jp/moodle40a/";
const refreshCoordinator = new RefreshCoordinator({ storage: ext.storage.local });
const accountSession = new AccountSession({ storage: ext.storage.local });
let tabCollection = null;

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !["SAVE_TASK", "SAVE_QUIZ_REVIEW_OVERVIEW", "EDIT_TASK", "TAB_COURSE", "GET_SETTINGS",
    "REFRESH_CLAIM", "REFRESH_HEARTBEAT", "REFRESH_FINISH", "REFRESH_STATUS", "REFRESH_PROGRESS", "REFRESH_PAGE_READY",
    "ACCOUNT_READY", "ACCOUNT_RESUME", "ACCOUNT_GET", "ACCOUNT_SET", "ACCOUNT_VERIFY", "ACCOUNT_APPEND_HISTORY"].includes(msg.type)) return false;
  const operation = async () => {
    if (msg.type === "ACCOUNT_READY") return accountSession.register(msg, sender);
    if (msg.type === "ACCOUNT_RESUME") return accountSession.register(msg, sender, true);
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
      case "ACCOUNT_VERIFY":
        return { ok: true };
      case "ACCOUNT_APPEND_HISTORY": {
        const entry = msg.entry;
        let url;
        try { url = new URL(entry?.url); } catch { throw new Error("履歴が不正です"); }
        if (typeof entry?.title !== "string" || !entry.title.trim()
          || url.origin !== "https://cms7.ict.nitech.ac.jp" || url.pathname !== "/moodle40a/course/view.php") {
          throw new Error("履歴が不正です");
        }
        const saved = await ext.storage.local.get(["history", "refreshCoordinator", "duedleCollectionTabs"]);
        if (saved.duedleCollectionTabs?.[sender.tab.id] || saved.refreshCoordinator?.temporaryTabId === sender.tab.id) {
          return { ok: true, skipped: true };
        }
        const history = (Array.isArray(saved.history) ? saved.history : [])
          .filter(item => typeof item?.title === "string" && item.title.trim() !== entry.title.trim());
        history.push({ title: entry.title, url: entry.url });
        await ext.storage.local.set({ history: history.slice(-10) });
        return { ok: true };
      }
      case "ACCOUNT_GET":
        if (!Array.isArray(msg.keys) || msg.keys.some(key => !AccountSession.keys.includes(key))) throw new Error("保存キーが不正です");
        return { ok: true, data: await ext.storage.local.get(msg.keys) };
      case "ACCOUNT_SET": {
        if (!msg.values || Object.keys(msg.values).some(key => !["courseIds", "history"].includes(key))) throw new Error("保存キーが不正です");
        const values = {};
        if ("courseIds" in msg.values) {
          if (!Array.isArray(msg.values.courseIds) || msg.values.courseIds.length > 10000) throw new Error("コース一覧が不正です");
          if (msg.values.courseIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("コース一覧が不正です");
          // This is a complete enrolled-course snapshot, not browsing history.
          values.courseIds = [...new Set(msg.values.courseIds)];
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
      case "SAVE_QUIZ_REVIEW_OVERVIEW":
        await StorageUtil.saveQuizReviewOverview(msg.data, msg.expectedFetchedAt);
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

function collectedPageOperation(context, sender, response, tabId, url, operation = async () => {}) {
  return accountSession.run(context, sender, async () => {
    try {
      if (!response?.accountId || response.accountId !== context.accountId) throw new Error("Account mismatch");
      await accountSession.authorize(response, { tab: { id: tabId }, url, frameId: 0 });
    } catch {
      throw Object.assign(new Error("収集先のMoodleアカウントを確認できません。ログインし直してから更新してください。"), { code: "AUTH_REQUIRED" });
    }
    return operation();
  });
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
    await accountSession.run(context, sender, async () => {
      // This marker is browser-wide: account switching clears the per-account
      // coordinator, but a delayed collector document must remain a collector.
      const { duedleCollectionTabs = {} } = await ext.storage.local.get("duedleCollectionTabs");
      await ext.storage.local.set({ duedleCollectionTabs: { ...duedleCollectionTabs, [tab.id]: context.accountId } });
      if (refreshToken) await refreshCoordinator.setTemporaryTab(refreshToken, sender, tab.id);
    });
    await publish();
    for (const courseId of ids) {
      if (refreshToken) await requireTabLease(refreshToken, sender, context);
      const url = `${MOODLE_ROOT}course/view.php?id=${courseId}`;
      const pages = [url];
      const queuedPages = new Set(pages);
      let opened = false;
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const pageURL = pages[pageIndex];
        try {
          if (refreshToken) await requireTabLease(refreshToken, sender, context);
          await navigateTab(tab.id, pageURL);
          const response = await ext.tabs.sendMessage(tab.id, { type: "COLLECT_COURSE_ITEMS" });
          if (!response?.ok) {
            const error = tabCollectionError(response?.error || "コースを読み取れませんでした");
            if (response?.code === "AUTH_REQUIRED") error.code = response.code;
            throw error;
          }
          await collectedPageOperation(context, sender, response, tab.id, pageURL);
          if (!Array.isArray(response.items) || !Array.isArray(response.sections)
            || response.items.some(item => !["assign", "quiz"].includes(item?.type) || !Number.isSafeInteger(item.id) || item.id <= 0)) {
            throw new Error("コースの取得結果を確認できませんでした");
          }
          opened = true;
          for (const section of response.sections) {
            const sectionURL = CourseCollector.sectionURL(section, pageURL, courseId);
            if (!sectionURL) throw new Error("コースのセクションURLが不正です");
            if (queuedPages.has(sectionURL)) continue;
            if (queuedPages.size >= CourseCollector.maxCoursePages) throw new Error("コースのページ数が取得上限を超えました");
            queuedPages.add(sectionURL);
            pages.push(sectionURL);
          }
          for (const item of response.items) {
            const key = `${item.type}:${item.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (refreshToken) await requireTabLease(refreshToken, sender, context);
            const taskURL = `${MOODLE_ROOT}mod/${item.type}/view.php?id=${item.id}`;
            try {
              await navigateTab(tab.id, taskURL);
              const detail = await ext.tabs.sendMessage(tab.id, { type: "COLLECT_TASK" });
              if (!detail?.ok || !detail.data) {
                const error = tabCollectionError(detail?.error || "課題を読み取れませんでした");
                if (detail?.code === "AUTH_REQUIRED") error.code = detail.code;
                throw error;
              }
              const table = item.type === "assign" ? "assign_list" : "quiz_list";
              const idproperty = item.type === "assign" ? "assignId" : "quizId";
              if (detail.data.group !== table || Number(detail.data[idproperty]) !== item.id) throw new Error("課題の取得結果が一致しません");
              if (refreshToken) await requireTabLease(refreshToken, sender, context);
              await collectedPageOperation(context, sender, detail, tab.id, taskURL, () =>
                StorageUtil.saveData(table, idproperty,
                  { ...detail.data, courseId, fetchedAt: detail.data.fetchedAt ?? Date.now() }));
              result.saved++;
            } catch (error) {
              if (error.name === "RefreshLeaseLost" || error.code === "AUTH_REQUIRED") throw error;
              result.failed++;
              result.errors.push({ url: taskURL, message: error.message });
            }
            await publish();
          }
        } catch (error) {
          if (error.name === "RefreshLeaseLost" || error.code === "AUTH_REQUIRED") throw error;
          result.failed++;
          result.errors.push({ url: pageURL, message: error.message });
        }
        await publish();
      }
      if (opened) result.courses++;
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
    let navigation;
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
          if (actual.pathname !== expected.pathname || actual.searchParams.get("id") !== expected.searchParams.get("id")
            || actual.searchParams.get("section") !== expected.searchParams.get("section")) return;
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
      if (id !== tabId || info.status !== "complete") return;
      if (tab?.url) return finish(null, tab);
      // Without global tabs permission, outside-site URLs (and about:blank)
      // are hidden. Recheck after navigation starts so a queued blank-page
      // completion cannot be mistaken for an authentication redirect.
      Promise.resolve().then(() => navigation).then(() => ext.tabs.get(tabId)).then(current => {
        if (current.status !== "complete" || current.pendingUrl) return;
        if (!current.url) return finish(tabCollectionError("Moodleにログインし直してから更新してください"));
        finish(null, current);
      }, error => finish(error));
    };
    const onRemoved = id => {
      if (id === tabId) finish(new Error("収集用のタブが閉じられました"));
    };
    // Subscribe before navigating so cached pages cannot finish before the listener exists.
    ext.tabs.onUpdated.addListener(onUpdated);
    ext.tabs.onRemoved.addListener(onRemoved);
    timer = setTimeout(() => finish(new Error("ページの読み込みがタイムアウトしました")), timeout);
    navigation = ext.tabs.update(tabId, { url });
    navigation.then(tab => {
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

// Tab IDs may be reused after a full browser restart. This event is not a
// service-worker wake, so in-flight markers survive normal background restarts.
ext.runtime.onStartup?.addListener(() => {
  accountSession.serial(async () => {
    const { refreshCoordinator } = await ext.storage.local.get("refreshCoordinator");
    const update = { duedleCollectionTabs: {} };
    if (refreshCoordinator) update.refreshCoordinator = { ...refreshCoordinator, temporaryTabId: null };
    await ext.storage.local.set(update);
  }).catch(console.error);
});

ext.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") accountSession.serial(() => refreshCoordinator.tabGone(tabId)).catch(console.error);
});
ext.tabs.onRemoved.addListener(tabId => {
  accountSession.serial(() => refreshCoordinator.tabGone(tabId)).catch(console.error);
  accountSession.forget(tabId).catch(console.error);
});
