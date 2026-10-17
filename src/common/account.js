// Personal data is a projection of the currently signed-in Moodle account.
// Switching accounts archives the old projection and restores only the new one.
class AccountSession {
    static keys = ["assign_list", "quiz_list", "courseIds", "history", "refreshHistory", "refreshCoordinator", "scrapeCooldown"];
    static empty = { assign_list: [], quiz_list: [], courseIds: [], history: [], refreshHistory: {}, refreshCoordinator: null, scrapeCooldown: null };

    constructor({ storage }) {
        this.storage = storage;
        this.queue = Promise.resolve();
    }

    serial(operation) {
        const result = this.queue.catch(() => {}).then(operation);
        this.queue = result;
        return result;
    }

    static userId(value) {
        return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(Number(value)) : null;
    }

    static senderTab(sender) {
        const id = sender?.tab?.id;
        const url = new URL(sender?.url || sender?.tab?.url || "about:blank");
        if (!Number.isInteger(id) || id < 0 || (sender.frameId ?? 0) !== 0
            || url.origin !== "https://cms7.ict.nitech.ac.jp" || !url.pathname.startsWith("/moodle40a/")) {
            throw new Error("Moodleのページから操作してください");
        }
        return id;
    }

    register(message, sender, resume = false) {
        const tab = AccountSession.senderTab(sender);
        const user = AccountSession.userId(message.accountId);
        if (typeof message.pageId !== "string" || !message.pageId || message.pageId.length > 160) {
            throw new Error("ページの識別子が不正です");
        }
        return this.serial(async () => {
            const saved = await this.storage.get(["duedleAccount", "duedleAccountTabs", "duedleCollectionTabs", ...AccountSession.keys]);
            // A collector tab is opened on behalf of the active account. Its
            // cookies/DOM cannot switch that account while a sweep is running.
            const collector = saved.duedleCollectionTabs?.[tab];
            if ((collector || saved.refreshCoordinator?.temporaryTabId === tab)
                && (!user || saved.duedleAccount !== user || collector && collector !== user)) {
                throw new Error("Moodleのアカウントが変わったか、ログイン状態を確認できません。更新を中止しました。");
            }
            // A history-restored document may refresh its registration, but must
            // never switch the active account using its cached DOM identity.
            if (resume && (!user || saved.duedleAccount !== user)) {
                throw new Error("Moodleのアカウントが変わりました。このページを再読み込みしてください。");
            }
            if (sender.documentLifecycle && sender.documentLifecycle !== "active") {
                throw new Error("表示中のMoodleページから操作してください。");
            }
            const tabs = saved.duedleAccountTabs || {};
            const update = {};
            if (saved.duedleAccount !== user) {
                const previous = Object.fromEntries(AccountSession.keys.filter(key => key in saved).map(key => [key, saved[key]]));
                if (Object.keys(previous).length && (saved.duedleAccount || saved.duedleAccount === undefined)) {
                    // Legacy data has no owner; retain it for recovery, but never
                    // attribute it to the next person who signs in.
                    update["duedleAccountData:" + (saved.duedleAccount || "legacy")] = previous;
                }
                const key = "duedleAccountData:" + user;
                const archive = user ? (await this.storage.get(key))[key] : null;
                Object.assign(update, AccountSession.empty, archive || {}, { refreshCoordinator: null, duedleAccount: user });
            }
            tabs[tab] = { accountId: user, pageId: message.pageId, documentId: sender.documentId || null };
            update.duedleAccountTabs = tabs;
            await this.storage.set(update);
            return { ok: true, accountId: user };
        });
    }

    async authorize(message, sender) {
        const tab = AccountSession.senderTab(sender);
        const saved = await this.storage.get(["duedleAccount", "duedleAccountTabs"]);
        const registered = saved.duedleAccountTabs?.[tab];
        const user = AccountSession.userId(message.accountId);
        if (!user || user !== saved.duedleAccount) {
            throw new Error("Moodleのアカウントが変わりました。このページを再読み込みしてください。");
        }
        if (registered?.accountId !== user || registered.pageId !== message.pageId
            || registered.documentId && sender.documentId && registered.documentId !== sender.documentId) {
            throw new Error("ページの登録が古くなりました。このページを再読み込みしてください。");
        }
        return user;
    }

    run(message, sender, operation) {
        return this.serial(async () => {
            await this.authorize(message, sender);
            return operation();
        });
    }

    forget(tab) {
        return this.serial(async () => {
            const saved = await this.storage.get(["duedleAccountTabs", "duedleCollectionTabs"]);
            const tabs = saved.duedleAccountTabs || {};
            const collectors = saved.duedleCollectionTabs || {};
            delete tabs[tab];
            delete collectors[tab];
            await this.storage.set({ duedleAccountTabs: tabs, duedleCollectionTabs: collectors });
        });
    }

    static findUser(doc, pageURL) {
        if (doc.querySelector('form#login, #loginform') || /\/moodle40a\/(?:login|auth)\//.test(new URL(pageURL).pathname)) return null;
        // Standard Moodle 4.0 navigation carries the logged-in user ID here.
        // M.cfg normally contains session/config data, not necessarily userid.
        for (const element of doc.querySelectorAll('#nav-notification-popover-container[data-userid], #nav-message-popover-container[data-userid], [data-region="right-hand-drawer"][data-user-id]')) {
            const user = AccountSession.userId(element.getAttribute("data-userid") || element.getAttribute("data-user-id"));
            if (user) return user;
        }
        // M.cfg is JSON bootstrap data; do not execute code in the page world.
        for (const script of doc.querySelectorAll("script:not([src])")) {
            const text = script.textContent || "";
            const match = /\bM\.cfg\s*=\s*\{/.exec(text);
            if (!match) continue;
            const start = match.index + match[0].lastIndexOf("{");
            let depth = 0, quoted = false, escaped = false;
            for (let i = start; i < text.length; i++) {
                const char = text[i];
                if (quoted) {
                    if (escaped) escaped = false;
                    else if (char === "\\") escaped = true;
                    else if (char === '"') quoted = false;
                } else if (char === '"') quoted = true;
                else if (char === "{") depth++;
                else if (char === "}" && --depth === 0) {
                    try {
                        const user = AccountSession.userId(JSON.parse(text.slice(start, i + 1)).userid);
                        if (user) return user;
                    } catch { /* Some themes use a non-JSON bootstrap. */ }
                    break;
                }
            }
        }
        for (const link of doc.querySelectorAll('#usernavigation a[href*="/user/profile.php"], #usermenu a[href*="/user/profile.php"], .usermenu a[href*="/user/profile.php"], .usermenu a[href*="/user/view.php"], a[data-title="profile,moodle"]')) {
            try {
                const url = new URL(link.getAttribute("href"), pageURL);
                const user = AccountSession.userId(url.searchParams.get("id"));
                if (url.origin === new URL(pageURL).origin && ["/moodle40a/user/profile.php", "/moodle40a/user/view.php"].includes(url.pathname) && user) return user;
            } catch { /* Ignore unrelated profile links. */ }
        }
        return null;
    }

    static contentAPI(native, doc, pageURL) {
        let accountId = this.findUser(doc, pageURL);
        const pageId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        globalThis.duedlePageId = pageId;
        // Reads wait for ready. A theme which inserts navigation after idle gets
        // a bounded chance to supply its identity before personal data is hidden.
        globalThis.duedleAccountActive = true;
        const loggedOut = Boolean(doc.querySelector('form#login, #loginform') || /\/moodle40a\/(?:login|auth)\//.test(new URL(pageURL).pathname));
        const identity = accountId || loggedOut ? Promise.resolve(accountId) : new Promise(resolve => {
            const finish = () => {
                accountId = this.findUser(doc, pageURL);
                if (accountId) { clearTimeout(timer); observer.disconnect(); resolve(accountId); }
            };
            const observer = new MutationObserver(finish);
            const timer = setTimeout(() => { observer.disconnect(); resolve(null); }, 2000);
            observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-userid", "data-user-id", "href"] });
        });
        let ready = identity.then(user => {
            accountId = user;
            // Unknown markup does not prove logout and must not clear the
            // current account or its cached task information.
            if (!user && !loggedOut) throw new Error("Moodleのユーザー情報を確認できません。");
            return native.runtime.sendMessage({ type: "ACCOUNT_READY", accountId, pageId });
        }).then(async reply => {
            if (!reply?.ok) throw new Error(reply?.error || "Moodleのユーザー情報を確認できません。");
            const active = await native.storage.local.get("duedleAccount");
            globalThis.duedleAccountActive = Boolean(accountId && active.duedleAccount === accountId);
        }).catch(error => { globalThis.duedleAccountActive = false; console.warn(error); });
        const send = async message => {
            await ready;
            return native.runtime.sendMessage({ ...message, accountId, pageId });
        };
        const requested = keys => keys == null ? AccountSession.keys : typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const withCallback = (promise, callback) => {
            if (callback) promise.then(callback, console.error);
            return promise;
        };
        const local = {
            get(keys, callback) {
                const operation = (async () => {
                    await ready;
                    const names = requested(keys);
                    const personal = names.filter(key => AccountSession.keys.includes(key));
                    const shared = names.filter(key => !AccountSession.keys.includes(key));
                    const result = shared.length ? await native.storage.local.get(shared) : {};
                    if (personal.length && globalThis.duedleAccountActive) {
                        const reply = await send({ type: "ACCOUNT_GET", keys: personal });
                        // Failed authorization is not an empty task list.
                        if (!reply?.ok) throw new Error(reply?.error || "課題情報を読み取れませんでした。");
                        if (globalThis.duedleAccountActive) Object.assign(result, reply.data);
                    }
                    if (keys && typeof keys === "object" && !Array.isArray(keys)) {
                        for (const key of names) if (!(key in result)) result[key] = keys[key];
                    }
                    return result;
                })();
                return withCallback(operation, callback);
            },
            set(values, callback) {
                const operation = (async () => {
                    await ready;
                    const personal = Object.fromEntries(Object.entries(values).filter(([key]) => AccountSession.keys.includes(key)));
                    const shared = Object.fromEntries(Object.entries(values).filter(([key]) => !AccountSession.keys.includes(key)));
                    if (Object.keys(personal).length) {
                        const reply = await send({ type: "ACCOUNT_SET", values: personal });
                        if (!reply?.ok) throw new Error(reply?.error || "アカウントのデータを保存できませんでした。");
                    }
                    if (Object.keys(shared).length) await native.storage.local.set(shared);
                })();
                return withCallback(operation, callback);
            }
        };
        const listeners = new Map();
        const invalidate = () => {
            globalThis.duedleAccountActive = false;
            globalThis.duedleAutoRefreshController?.stop();
            doc.getElementById("display")?.replaceChildren();
            doc.querySelector(".duedle-history-list")?.replaceChildren();
            doc.dispatchEvent(new CustomEvent("duedle:account-changed"));
        };
        doc.defaultView?.addEventListener("pageshow", event => {
            if (!event.persisted) return;
            // BFCache restores this JS context without re-running content scripts.
            // Queue every subsequent personal operation behind re-registration.
            ready = ready.then(async () => {
                const reply = await native.runtime.sendMessage({ type: "ACCOUNT_RESUME", accountId, pageId });
                if (!reply?.ok) throw new Error(reply?.error || "ページの登録を復元できませんでした。");
                const active = await native.storage.local.get("duedleAccount");
                if (!accountId || active.duedleAccount !== accountId) throw new Error("Moodleのアカウントが変わりました。");
                globalThis.duedleAccountActive = true;
                const refreshed = await native.runtime.sendMessage({ type: "REFRESH_PAGE_READY", accountId, pageId });
                if (!refreshed?.ok) throw new Error(refreshed?.error || "ページの復元に失敗しました。");
            }).catch(error => { invalidate(); console.warn(error); });
            globalThis.duedlePageReady = ready;
            ready.then(() => {
                if (!globalThis.duedleAccountActive) return;
                doc.dispatchEvent(new CustomEvent("duedle:account-ready"));
                globalThis.duedleAutoRefreshController?.start();
                globalThis.duedleAutoRefreshController?.wake();
            });
        });
        // Cookies may change while an old tab remains open. Never save a fetched
        // page belonging to a different (or unidentified) signed-in user.
        globalThis.duedleAssertAccountDocument = (fetched, responseURL) => {
            if (!accountId || AccountSession.findUser(fetched, responseURL) !== accountId) {
                invalidate();
                const error = new Error("Moodleのアカウントが変わったか、ログイン状態を確認できません。このページを再読み込みしてください。");
                error.code = "AUTH_REQUIRED";
                throw error;
            }
        };
        globalThis.duedleCollectAccountContext = async () => {
            // ready deliberately catches failures for shared settings/UI. A
            // collector must additionally require successful personal access.
            await ready;
            if (!globalThis.duedleAccountActive || !accountId) {
                throw Object.assign(new Error("Moodleのログイン状態を確認できません。ページを再読み込みしてください。"), { code: "AUTH_REQUIRED" });
            }
            globalThis.duedleAssertAccountDocument(doc, pageURL);
            const reply = await send({ type: "ACCOUNT_VERIFY" });
            if (!reply?.ok || !globalThis.duedleAccountActive) {
                throw Object.assign(new Error(reply?.error || "Moodleのログイン状態を確認できません。"), { code: "AUTH_REQUIRED" });
            }
            return { accountId, pageId };
        };
        native.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.duedleAccount && changes.duedleAccount.newValue !== accountId) invalidate();
        });
        // WebExtension namespaces can expose inherited/non-enumerable members.
        // Forward native APIs rather than copying only enumerable properties.
        const forward = (source, overrides) => new Proxy(overrides, {
            get(target, key) {
                if (Object.prototype.hasOwnProperty.call(target, key)) return target[key];
                const value = Reflect.get(source, key, source);
                return typeof value === "function" ? value.bind(source) : value;
            },
            has(target, key) { return key in target || key in source; }
        });
        return forward(native, { runtime: forward(native.runtime, { sendMessage: send }), storage: forward(native.storage, {
            local,
            onChanged: {
                addListener(listener) {
                    const wrapped = (changes, area) => {
                        const visible = area === "local" && !globalThis.duedleAccountActive
                            ? Object.fromEntries(Object.entries(changes).filter(([key]) => !AccountSession.keys.includes(key))) : changes;
                        if (Object.keys(visible).length) listener(visible, area);
                    };
                    listeners.set(listener, wrapped);
                    native.storage.onChanged.addListener(wrapped);
                },
                removeListener(listener) {
                    const wrapped = listeners.get(listener);
                    if (wrapped) native.storage.onChanged.removeListener(wrapped);
                    listeners.delete(listener);
                }
            }
        }) });
    }
}
